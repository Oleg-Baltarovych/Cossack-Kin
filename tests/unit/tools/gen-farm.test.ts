// Farm tier bases (plan M2-06, ART-BIBLE §4/§6): every tier of the field, the garden and the apiary stays inside the
// building colour budget (≤ 24 colours from ≤ 6 ramps; companion layers do not count) and grows from tier to tier —
// a tier never shrinks in width or height, and each one differs from the last in silhouette, not only in colour.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import apiary from '../../../assets-src/gen/khortytsia/apiary/index.ts';
import field from '../../../assets-src/gen/khortytsia/field/index.ts';
import garden from '../../../assets-src/gen/khortytsia/garden/index.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import { renderGenerator } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';
import type { RgbaImage } from '../../../tools/lib/png.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
const BUILDING_BUDGET = { colors: 24, ramps: 6 } as const;

/** The base (non-companion) frames of a generator, in variant order t1 … t6. */
function bases(gen: SpriteGenerator): { name: string; image: RgbaImage }[] {
  const problems: string[] = [];
  const frames = renderGenerator(gen, palette, problems).filter((f) => !f.name.includes('@'));
  expect(problems).toEqual([]);
  return frames;
}

/** Opaque bounding box width × height. */
function extent(image: RgbaImage): { w: number; h: number } {
  let x0 = image.width;
  let y0 = image.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

describe.each([
  ['field', field],
  ['garden', garden],
  ['apiary', apiary],
] as const)('%s tiers', (_, gen) => {
  const frames = bases(gen);

  it('has six tier bases', () => {
    expect(frames.map((f) => f.name)).toEqual(
      ['t1', 't2', 't3', 't4', 't5', 't6'].map((t) => `${gen.id}.${t}/idle/00`),
    );
  });

  it('keeps every base inside the building colour budget (≤ 24 colours, ≤ 6 ramps)', () => {
    for (const f of frames) {
      const stats = colorStats(f.image, palette);
      expect(stats.colors, f.name).toBeLessThanOrEqual(BUILDING_BUDGET.colors);
      expect(stats.ramps.length, f.name).toBeLessThanOrEqual(BUILDING_BUDGET.ramps);
    }
  });

  it('never shrinks from tier to tier, and every tier changes the silhouette', () => {
    const sizes = frames.map((f) => extent(f.image));
    sizes.slice(1).forEach((s, i) => {
      const prev = sizes[i] ?? s;
      expect(s.w, `${gen.id} t${String(i + 2)} width`).toBeGreaterThanOrEqual(prev.w);
      expect(s.h, `${gen.id} t${String(i + 2)} height`).toBeGreaterThanOrEqual(prev.h);
      expect(s.w > prev.w || s.h > prev.h, `${gen.id} t${String(i + 2)} silhouette`).toBe(true);
    });
  });
});
