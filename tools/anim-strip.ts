// `pnpm sprites:strip <id>…` (plan ART-06): animation strips for judging motion — one row per
// `<variant>/<anim>`, frames left to right, each frame composited with its `@shadow` (and `@emissive` on top, ART-16) over a flat grass ground
// (grass 2, the scene's base) and scaled ×8 with 1-logical-px gaps. Writes reports/sprites/<id>-anim.png.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPalette } from '../assets-src/gen/lib/palette.ts';
import { encodePng, type RgbaImage } from './lib/png.ts';
import { renderGenerator, SpriteBuildError, type FrameImage } from './lib/sprites/atlas.ts';
import { loadGenerators } from './lib/sprites/load.ts';

const PALETTE = 'assets-src/palettes/master.json';
const OUT = 'reports/sprites';
const SCALE = 8;
const GAP = 2;
const GROUND: readonly [number, number, number] = [0x2a, 0x59, 0x31];
const BACK: readonly [number, number, number] = [0x1b, 0x1a, 0x24];

/** `<entity>[.<variant>][@<layer>]/<anim>/<nn>` → parts. */
function parse(name: string): { row: string; layer: string | null; index: number } {
  const [stem = '', anim = '', nn = '0'] = name.split('/');
  const [entity = '', layer] = stem.split('@');
  return { row: `${entity}/${anim}`, layer: layer ?? null, index: Number(nn) };
}

function blit(out: RgbaImage, src: RgbaImage, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if ((src.data[i + 3] ?? 0) === 0) continue;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const o = ((oy + y * SCALE + sy) * out.width + ox + x * SCALE + sx) * 4;
          out.data[o] = src.data[i] ?? 0;
          out.data[o + 1] = src.data[i + 1] ?? 0;
          out.data[o + 2] = src.data[i + 2] ?? 0;
          out.data[o + 3] = 255;
        }
      }
    }
  }
}

function strip(frames: readonly FrameImage[]): RgbaImage {
  const rows = new Map<string, { base: FrameImage[]; shadow: FrameImage[]; emissive: FrameImage[] }>();
  for (const f of frames) {
    const p = parse(f.name);
    const row = rows.get(p.row) ?? { base: [], shadow: [], emissive: [] };
    (p.layer === 'shadow' ? row.shadow : p.layer === 'emissive' ? row.emissive : p.layer === null ? row.base : []).push(
      f,
    );
    rows.set(p.row, row);
  }
  const first = frames[0];
  if (!first) throw new Error('anim-strip: no frames');
  const cellW = (first.image.width + GAP) * SCALE;
  const cellH = (first.image.height + GAP) * SCALE;
  const cols = Math.max(...[...rows.values()].map((r) => r.base.length));
  const out: RgbaImage = {
    width: cols * cellW + GAP * SCALE,
    height: rows.size * cellH + GAP * SCALE,
    data: new Uint8Array(0),
  };
  const data = new Uint8Array(out.width * out.height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...BACK, 255], i);
  const img: RgbaImage = { ...out, data };
  [...rows.values()].forEach((row, r) => {
    row.base.forEach((f, c) => {
      const ox = GAP * SCALE + c * cellW;
      const oy = GAP * SCALE + r * cellH;
      const groundTop = Math.round(f.anchor.y * f.image.height) - 3;
      for (let y = Math.max(0, groundTop) * SCALE; y < f.image.height * SCALE; y++) {
        for (let x = 0; x < f.image.width * SCALE; x++) data.set([...GROUND, 255], ((oy + y) * img.width + ox + x) * 4);
      }
      const shadow = row.shadow[c];
      if (shadow) blit(img, shadow.image, ox, oy);
      blit(img, f.image, ox, oy);
      const glow = row.emissive[c];
      if (glow) blit(img, glow.image, ox, oy);
    });
  });
  return img;
}

async function main(): Promise<void> {
  const palette = loadPalette(JSON.parse(readFileSync(PALETTE, 'utf8')));
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) throw new Error('sprites:strip: name at least one generator id');
  const generators = (await loadGenerators()).filter((g) => wanted.includes(g.id));
  const missing = wanted.filter((id) => !generators.some((g) => g.id === id));
  if (missing.length > 0) throw new Error(`sprites:strip: no generator with id ${missing.join(', ')}`);
  mkdirSync(OUT, { recursive: true });
  for (const gen of generators) {
    const problems: string[] = [];
    const frames = renderGenerator(gen, palette, problems);
    if (problems.length > 0) throw new SpriteBuildError(problems);
    const file = join(OUT, `${gen.id}-anim.png`);
    writeFileSync(file, encodePng(strip(frames)));
    console.log(file);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof SpriteBuildError ? error.message : error);
  process.exit(1);
});
