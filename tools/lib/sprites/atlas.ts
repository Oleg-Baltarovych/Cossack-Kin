// Atlas assembly for `pnpm sprites` (plan M0-08): generators → frames → checks → shelf pack → PNG + Pixi
// Spritesheet JSON, plus the atlas index the game loads. Pure (no fs); tools/build-sprites.ts does the I/O.
// Frame naming scheme: assets-src/gen/lib/types.ts.
import { createIndexBuffer, quantize, type IndexBuffer } from '../../../assets-src/gen/lib/buffer.ts';
import type { Palette } from '../../../assets-src/gen/lib/palette.ts';
import { seededRng } from '../../../assets-src/gen/lib/rng.ts';
import {
  COMPANION_LAYERS,
  type CompanionLayer,
  type Size,
  type SpriteGenerator,
} from '../../../assets-src/gen/lib/types.ts';
import { encodePng, type RgbaImage } from '../png.ts';
import { checkFrame, SOFT_ALPHA_ATLASES } from './check.ts';
import { packShelves } from './pack.ts';

/** SPEC §12.4: one land atlas ≤ 2048². */
export const MAX_ATLAS_SIZE = 2048;
/** Atlases for dev/test builds only: listed with `debug: true` in the index, stripped from production `dist/`. */
export const DEBUG_ATLASES: readonly string[] = ['debug'];
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
  /** `<entity>[.<variant>][@<layer>]/<anim>/<nn>`. */
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
  /** Frame px / atlas px, 0..1. */
  readonly utilisation: number;
}

/** `public/atlases/index.json`: what render loads (src/render/atlases.ts validates the same shape). */
export interface AtlasIndex {
  readonly version: 1;
  readonly atlases: readonly { readonly name: string; readonly json: string; readonly debug: boolean }[];
}

export function atlasIndex(atlases: readonly AtlasOutput[]): AtlasIndex {
  return {
    version: 1,
    atlases: atlases.map((a) => ({ name: a.name, json: `${a.name}.json`, debug: DEBUG_ATLASES.includes(a.name) })),
  };
}

const frameNumber = (name: string): number => Number(name.slice(name.lastIndexOf('/') + 1));

/** Checks, packs and encodes one atlas. Throws SpriteBuildError with every problem found. */
export function composeAtlas(name: string, frames: readonly FrameImage[], palette: Palette): AtlasOutput {
  const softAlpha = SOFT_ALPHA_ATLASES.includes(name);
  const problems = frames.flatMap((f) =>
    checkFrame(f.image, palette, { name: `${name}:${f.name}`, declared: f.declared, softAlpha }),
  );
  const names = new Set<string>();
  for (const f of frames) {
    if (names.has(f.name)) problems.push(`duplicate frame ${name}:${f.name}`);
    names.add(f.name);
  }
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
  let framePx = 0;
  for (const p of packed.placements) {
    const f = byName.get(p.id);
    if (!f) continue;
    for (let y = 0; y < p.h; y++) {
      const src = f.image.data.subarray(y * p.w * 4, (y + 1) * p.w * 4);
      data.set(src, ((p.y + y) * packed.width + p.x) * 4);
    }
    framePx += p.w * p.h;
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
  for (const list of Object.values(json.animations)) list.sort((a, b) => frameNumber(a) - frameNumber(b));
  const png = encodePng({ width: packed.width, height: packed.height, data });
  return {
    name,
    png,
    json,
    jsonText: `${JSON.stringify(json, null, 2)}\n`,
    utilisation: framePx / (packed.width * packed.height),
  };
}

/**
 * Every frame name a generator declares (`<entity>[.<variant>][@<layer>]/<anim>/<nn>`), without drawing: what
 * `renderGenerator` writes when the generator succeeds. Content tests check layout sprites against it (plan M2-05).
 */
export function frameNames(gen: SpriteGenerator): string[] {
  const out: string[] = [];
  for (const variant of gen.variants ?? [null]) {
    const entity = variant === null ? gen.id : `${gen.id}.${variant}`;
    for (const [anim, count] of Object.entries(gen.frames)) {
      for (let frame = 0; frame < count; frame++) {
        const nn = String(frame).padStart(2, '0');
        out.push(`${entity}/${anim}/${nn}`, ...(gen.layers ?? []).map((layer) => `${entity}@${layer}/${anim}/${nn}`));
      }
    }
  }
  return out;
}

/**
 * Runs one generator: every variant × animation frame, plus its companion layers right after each base frame.
 * Contract or generator failures are appended to `problems` (the frames that did render are still returned).
 */
export function renderGenerator(gen: SpriteGenerator, palette: Palette, problems: string[]): FrameImage[] {
  const contract = contractProblems(gen);
  if (contract.length > 0) {
    problems.push(...contract);
    return [];
  }
  const out: FrameImage[] = [];
  const rampSize = (ramp: string): number => palette.ramps.get(ramp)?.length ?? 0;
  const anchor = gen.anchor ?? { x: 0.5, y: 1 };
  const layerNames = gen.layers ?? [];
  for (const variant of gen.variants ?? [null]) {
    const entity = variant === null ? gen.id : `${gen.id}.${variant}`;
    for (const [anim, count] of Object.entries(gen.frames)) {
      for (let frame = 0; frame < count; frame++) {
        const nn = String(frame).padStart(2, '0');
        const name = `${entity}/${anim}/${nn}`;
        const buffer = createIndexBuffer(gen.size.w, gen.size.h, palette);
        const layers: Partial<Record<CompanionLayer, IndexBuffer>> = {};
        for (const layer of layerNames) layers[layer] = createIndexBuffer(gen.size.w, gen.size.h, palette);
        try {
          gen.generate(seededRng(`${gen.atlas}:${name}`), { variant, anim, frame, buffer, layers, rampSize });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          problems.push(`${gen.atlas}:${name}: generator failed: ${reason}`);
          continue;
        }
        out.push({ name, image: quantize(buffer, palette), declared: gen.size, anchor });
        for (const layer of layerNames) {
          const layerBuffer = layers[layer];
          if (!layerBuffer) continue;
          out.push({
            name: `${entity}@${layer}/${anim}/${nn}`,
            image: quantize(layerBuffer, palette),
            declared: gen.size,
            anchor,
          });
        }
      }
    }
  }
  return out;
}

/** Runs every generator and builds one atlas per `generator.atlas`, sorted by atlas name. */
export function buildAtlases(generators: readonly SpriteGenerator[], palette: Palette): AtlasOutput[] {
  const problems: string[] = [];
  const atlases = new Map<string, FrameImage[]>();
  const seen = new Set<string>();
  for (const gen of generators) {
    for (const frame of renderGenerator(gen, palette, problems)) {
      const key = `${gen.atlas}:${frame.name}`;
      if (seen.has(key)) {
        problems.push(`duplicate frame ${key}`);
        continue;
      }
      seen.add(key);
      const list = atlases.get(gen.atlas) ?? [];
      list.push(frame);
      atlases.set(gen.atlas, list);
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
  const named = (what: string, value: string): void => {
    if (!NAME.test(value)) problems.push(`${label}: ${what} "${value}" must match ${String(NAME)}`);
  };
  const unique = (what: string, list: readonly string[]): void => {
    if (new Set(list).size !== list.length) problems.push(`${label}: duplicate ${what} in [${list.join(', ')}]`);
  };
  named('atlas', gen.atlas);
  named('id', gen.id);
  const { w, h } = gen.size;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_ATLAS_SIZE || h > MAX_ATLAS_SIZE) {
    problems.push(`${label}: size ${String(w)}×${String(h)} must be whole px in 1..${String(MAX_ATLAS_SIZE)}`);
  }
  const anims = Object.entries(gen.frames);
  if (anims.length === 0) problems.push(`${label}: no animations in "frames"`);
  for (const [anim, count] of anims) {
    named('animation', anim);
    if (!Number.isInteger(count) || count < 1 || count > MAX_FRAMES) {
      problems.push(`${label}: "${anim}" frame count ${String(count)} must be 1..${String(MAX_FRAMES)}`);
    }
  }
  if (gen.variants !== undefined) {
    if (gen.variants.length === 0) problems.push(`${label}: "variants" is empty (omit it instead)`);
    for (const v of gen.variants) named('variant', v);
    unique('variants', gen.variants);
  }
  for (const layer of gen.layers ?? []) {
    if (!(COMPANION_LAYERS as readonly string[]).includes(layer)) {
      problems.push(`${label}: layer "${layer}" is not one of ${COMPANION_LAYERS.join(', ')}`);
    }
  }
  unique('layers', gen.layers ?? []);
  return problems;
}
