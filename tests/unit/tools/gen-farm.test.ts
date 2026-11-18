// Farm tier bases (plans M2-06/M2-07, ART-BIBLE §4/§6): every tier of the field, the garden, the apiary, the windmill
// and the potter's khata stays inside the building colour budget (≤ 24 colours from ≤ 6 ramps; companion layers do
// not count) and grows from tier to tier — a tier never shrinks in width or height, and each one differs from the
// last in silhouette, not only in colour.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import apiary from '../../../assets-src/gen/khortytsia/apiary/index.ts';
import field from '../../../assets-src/gen/khortytsia/field/index.ts';
import garden from '../../../assets-src/gen/khortytsia/garden/index.ts';
import khata from '../../../assets-src/gen/khortytsia/khata/index.ts';
import mill, { millPoleTop, millSailLift } from '../../../assets-src/gen/khortytsia/mill/index.ts';
import { isTierSprite, KHORTYTSIA_FARM } from '../../../src/content/villages/khortytsia.layout.ts';
import potter from '../../../assets-src/gen/khortytsia/potter/index.ts';
import windmill from '../../../assets-src/gen/khortytsia/windmill/index.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';
import type { RgbaImage } from '../../../tools/lib/png.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
const BUILDING_BUDGET = { colors: 24, ramps: 6 } as const;

/** The base (non-companion) frames of a generator, in variant order t1 … t6. */
function bases(gen: SpriteGenerator): FrameImage[] {
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

/** Opaque px aligned at the pivot: `"dx,dy"` from the frame's anchor. */
function mask(f: FrameImage): Set<string> {
  const px = Math.round(f.anchor.x * f.image.width);
  const py = Math.round(f.anchor.y * f.image.height);
  const out = new Set<string>();
  for (let y = 0; y < f.image.height; y++) {
    for (let x = 0; x < f.image.width; x++) {
      if ((f.image.data[(y * f.image.width + x) * 4 + 3] ?? 0) > 0) out.add(`${String(x - px)},${String(y - py)}`);
    }
  }
  return out;
}

// M2-07: tiers I and III of the potter's khata and tier I of the windmill are the M-ART frames (kept pixel-identical),
// so the chains mix generators: the extent never shrinks, and every tier changes the silhouette (≥ 12 px of the
// pivot-aligned opaque mask differ from the tier before).
const byName = (gen: SpriteGenerator, name: string): FrameImage => {
  const f = bases(gen).find((b) => b.name === `${name}/idle/00`);
  if (!f) throw new Error(`no frame ${name}`);
  return f;
};
describe.each([
  ['windmill', [byName(windmill, 'windmill'), ...['t2', 't3', 't4', 't5', 't6'].map((t) => byName(mill, `mill.${t}`))]],
  [
    'potter',
    [
      byName(khata, 'khata.t1'),
      byName(potter, 'potter.t2'),
      byName(khata, 'khata.t3'),
      ...['t4', 't5', 't6'].map((t) => byName(potter, `potter.${t}`)),
    ],
  ],
] as const)('%s tiers I–VI', (id, frames) => {
  it('keeps every new base inside the building colour budget (≤ 24 colours, ≤ 6 ramps)', () => {
    for (const f of frames) {
      const stats = colorStats(f.image, palette);
      expect(stats.colors, f.name).toBeLessThanOrEqual(BUILDING_BUDGET.colors);
      expect(stats.ramps.length, f.name).toBeLessThanOrEqual(BUILDING_BUDGET.ramps);
    }
  });

  it('never shrinks from tier to tier, and every tier changes the silhouette', () => {
    frames.slice(1).forEach((f, i) => {
      const prev = frames[i] ?? f;
      const [s, p] = [extent(f.image), extent(prev.image)];
      expect(s.w, `${id} t${String(i + 2)} width`).toBeGreaterThanOrEqual(p.w);
      expect(s.h, `${id} t${String(i + 2)} height`).toBeGreaterThanOrEqual(p.h);
      const [a, b] = [mask(f), mask(prev)];
      const differ = [...a].filter((k) => !b.has(k)).length + [...b].filter((k) => !a.has(k)).length;
      expect(differ, `${id} t${String(i + 2)} silhouette`).toBeGreaterThanOrEqual(12);
    });
  });
});

describe('windmill add-ons', () => {
  const windmillSprite = KHORTYTSIA_FARM.props.filter(isTierSprite).find((t) => t.building === 'windmill');
  const partsAt = (tier: number) => {
    const look = windmillSprite?.tiers[tier - 1];
    return look && 'parts' in look ? look.parts : [];
  };

  it('hangs the sails on the hub and the VI weathervane on the pole top of the generator', () => {
    for (const tier of [2, 3, 4, 5, 6]) {
      const sails = partsAt(tier).find((p) => p.sprite.includes('sails'));
      expect(sails?.lift, `t${String(tier)}`).toBe(millSailLift(`t${String(tier)}`));
    }
    const vane = partsAt(6).find((p) => p.sprite === 'gilt.vane');
    const top = millPoleTop('t6');
    expect([vane?.dx, vane?.lift]).toEqual([top.dx, top.lift]);
  });
});
