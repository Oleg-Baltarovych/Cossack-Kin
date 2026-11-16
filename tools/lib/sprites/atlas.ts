// Atlas assembly for `pnpm sprites` (plan M0-08): generators → frames → checks → shelf pack → PNG + Pixi
// Spritesheet JSON. Pure (no fs); tools/build-sprites.ts does the I/O.
import { encodePng, type RgbaImage } from '../png.ts';
import { createIndexBuffer, quantize } from './buffer.ts';
import { checkFrame, SOFT_ALPHA_ATLASES } from './check.ts';
import { packShelves } from './pack.ts';
import type { Palette } from './palette.ts';
import { seededRng } from './rng.ts';
import type { Size, SpriteGenerator } from './types.ts';

/** SPEC §12.4: one land atlas ≤ 2048². */
export const MAX_ATLAS_SIZE = 2048;
const PADDING = 1;
const NAME = /^[a-z][a-z0-9-]*$/;
const MAX_FRAMES = 100;

export class SpriteBuildError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`sprites: ${String(problems.length)} problem(s)\n  ${problems.join('\n  ')}`);
    this.name = 'SpriteBuildError';
    this.problems = problems;
  }
}

export interface FrameImage {
  /** `<entity>/<anim>/<nn>`. */
  readonly name: string;
  readonly image: RgbaImage;
  readonly declared: Size;
  readonly anchor: { readonly x: number; readonly y: number };
}

/** The subset of Pixi's `SpritesheetData` we emit (pixi.js/lib/spritesheet/Spritesheet.d.ts). */
export interface SpritesheetJson {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      rotated: false;
      trimmed: false;
      spriteSourceSize: { x: 0; y: 0; w: number; h: number };
      sourceSize: { w: number; h: number };
      anchor: { x: number; y: number };
    }
  >;
  animations: Record<string, string[]>;
  meta: { app: string; version: string; image: string; format: 'RGBA8888'; size: { w: number; h: number }; scale: 1 };
}

export interface AtlasOutput {
  readonly name: string;
  readonly png: Buffer;
  readonly json: SpritesheetJson;
  /** Exact bytes written to `<name>.json`. */
  readonly jsonText: string;
}

/** Checks, packs and encodes one atlas. Throws SpriteBuildError with every problem found. */
export function composeAtlas(name: string, frames: readonly FrameImage[], palette: Palette): AtlasOutput {
  const softAlpha = SOFT_ALPHA_ATLASES.includes(name);
  const problems = frames.flatMap((f) =>
    checkFrame(f.image, palette, { name: `${name}:${f.name}`, declared: f.declared, softAlpha }),
  );
  if (problems.length > 0) throw new SpriteBuildError(problems);

  let packed;
  try {
    packed = packShelves(
      frames.map((f) => ({ id: f.name, w: f.image.width, h: f.image.height })),
      { maxSize: MAX_ATLAS_SIZE, padding: PADDING },
    );
  } catch (error) {
    throw new SpriteBuildError([`${name}: ${error instanceof Error ? error.message : String(error)}`]);
  }

  const byName = new Map(frames.map((f) => [f.name, f]));
  const data = new Uint8Array(packed.width * packed.height * 4);
  const json: SpritesheetJson = {
    frames: {},
    animations: {},
    meta: {
      app: 'cossack-kin build-sprites',
      version: '1',
      image: `${name}.png`,
      format: 'RGBA8888',
      size: { w: packed.width, h: packed.height },
      scale: 1,
    },
  };
  for (const p of packed.placements) {
    const f = byName.get(p.id);
    if (!f) continue;
    for (let y = 0; y < p.h; y++) {
      const src = f.image.data.subarray(y * p.w * 4, (y + 1) * p.w * 4);
      data.set(src, ((p.y + y) * packed.width + p.x) * 4);
    }
    json.frames[p.id] = {
      frame: { x: p.x, y: p.y, w: p.w, h: p.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h },
      sourceSize: { w: p.w, h: p.h },
      anchor: { ...f.anchor },
    };
    const anim = p.id.slice(0, p.id.lastIndexOf('/'));
    (json.animations[anim] ??= []).push(p.id);
  }
  // Frame names are zero-padded, so a plain sort is frame order.
  for (const list of Object.values(json.animations)) list.sort();
  const png = encodePng({ width: packed.width, height: packed.height, data });
  return { name, png, json, jsonText: `${JSON.stringify(json, null, 2)}\n` };
}

/** Runs every generator and builds one atlas per `generator.atlas`, sorted by atlas name. */
export function buildAtlases(generators: readonly SpriteGenerator[], palette: Palette): AtlasOutput[] {
  const problems: string[] = [];
  const atlases = new Map<string, FrameImage[]>();
  const seen = new Set<string>();
  const rampSize = (ramp: string): number => palette.ramps.get(ramp)?.length ?? 0;
  for (const gen of generators) {
    const contract = contractProblems(gen);
    if (contract.length > 0) {
      problems.push(...contract);
      continue;
    }
    for (const [anim, count] of Object.entries(gen.frames)) {
      for (let frame = 0; frame < count; frame++) {
        const name = `${gen.id}/${anim}/${String(frame).padStart(2, '0')}`;
        const key = `${gen.atlas}:${name}`;
        if (seen.has(key)) {
          problems.push(`duplicate frame ${key}`);
          continue;
        }
        seen.add(key);
        const buffer = createIndexBuffer(gen.size.w, gen.size.h, palette);
        try {
          gen.generate(seededRng(key), { anim, frame, buffer, rampSize });
        } catch (error) {
          problems.push(`${key}: generator failed: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        const list = atlases.get(gen.atlas) ?? [];
        list.push({
          name,
          image: quantize(buffer, palette),
          declared: gen.size,
          anchor: gen.anchor ?? { x: 0.5, y: 1 },
        });
        atlases.set(gen.atlas, list);
      }
    }
  }
  if (problems.length > 0) throw new SpriteBuildError(problems);

  const out: AtlasOutput[] = [];
  for (const name of [...atlases.keys()].sort()) {
    try {
      out.push(composeAtlas(name, atlases.get(name) ?? [], palette));
    } catch (error) {
      if (error instanceof SpriteBuildError) problems.push(...error.problems);
      else throw error;
    }
  }
  if (problems.length > 0) throw new SpriteBuildError(problems);
  return out;
}

function contractProblems(gen: SpriteGenerator): string[] {
  const label = `generator ${gen.atlas}/${gen.id}`;
  const problems: string[] = [];
  if (!NAME.test(gen.atlas)) problems.push(`${label}: atlas "${gen.atlas}" must match ${String(NAME)}`);
  if (!NAME.test(gen.id)) problems.push(`${label}: id "${gen.id}" must match ${String(NAME)}`);
  const { w, h } = gen.size;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_ATLAS_SIZE || h > MAX_ATLAS_SIZE) {
    problems.push(`${label}: size ${String(w)}×${String(h)} must be whole px in 1..${String(MAX_ATLAS_SIZE)}`);
  }
  const anims = Object.entries(gen.frames);
  if (anims.length === 0) problems.push(`${label}: no animations in "frames"`);
  for (const [anim, count] of anims) {
    if (!NAME.test(anim)) problems.push(`${label}: animation "${anim}" must match ${String(NAME)}`);
    if (!Number.isInteger(count) || count < 1 || count > MAX_FRAMES) {
      problems.push(`${label}: "${anim}" frame count ${String(count)} must be 1..${String(MAX_FRAMES)}`);
    }
  }
  return problems;
}
