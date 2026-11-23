// Farm and suburb tier bases (plans M2-06/07/08, ART-BIBLE §4/§6): every tier of the field, the garden, the apiary,
// the smithy, the tavern, the fair, the windmill and the potter's khata stays inside the building colour budget
// (≤ 24 colours from ≤ 6 ramps; companion layers do not count) and grows from tier to tier — a tier never shrinks in width or height, and each one differs from the
// last in silhouette, not only in colour.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import apiary from '../../../assets-src/gen/khortytsia/apiary/index.ts';
import field from '../../../assets-src/gen/khortytsia/field/index.ts';
import garden from '../../../assets-src/gen/khortytsia/garden/index.ts';
import gilt from '../../../assets-src/gen/khortytsia/gilt/index.ts';
import khata from '../../../assets-src/gen/khortytsia/khata/index.ts';
import mill, { millPoleTop, millSailLift } from '../../../assets-src/gen/khortytsia/mill/index.ts';
import millSails from '../../../assets-src/gen/khortytsia/mill-sails/index.ts';
import windmillSails from '../../../assets-src/gen/khortytsia/windmill-sails/index.ts';
import {
  isTierSprite,
  KHORTYTSIA_FARM,
  KHORTYTSIA_SUBURB,
  KHORTYTSIA_WORLD,
} from '../../../src/content/villages/khortytsia.layout.ts';
import smithy, { smithyForge } from '../../../assets-src/gen/khortytsia/smithy/index.ts';
import tavern from '../../../assets-src/gen/khortytsia/tavern/index.ts';
import fair from '../../../assets-src/gen/khortytsia/fair/index.ts';
import { SHOP_RIDGE } from '../../../assets-src/gen/khortytsia/shop/index.ts';
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
  ['smithy', smithy],
  ['tavern', tavern],
  ['fair', fair],
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

  // M2-29 B3 (art-director M2-07): the vane stood on the band's last row and slid over the passing blade. Now it is
  // drawn before the sails (they turn in front of the roof, pole and banner) and clears the river band by ≥ 4 rows.
  it('stands the VI vane under the sails and at least 4 rows below the river band', () => {
    const parts = partsAt(6);
    const vaneAt = parts.findIndex((p) => p.sprite === 'gilt.vane');
    const sailsAt = parts.findIndex((p) => p.sprite.includes('sails'));
    expect(vaneAt).toBeGreaterThanOrEqual(0);
    expect(vaneAt).toBeLessThan(sailsAt);
    const f = renderGenerator(gilt, palette, []).find((g) => g.name.startsWith('gilt.vane/'));
    if (!f) throw new Error('gilt.vane has no frame');
    const py = Math.round(f.anchor.y * f.image.height);
    let top = py;
    for (let y = py - 1; y >= 0; y--) {
      for (let x = 0; x < f.image.width; x++) if ((f.image.data[(y * f.image.width + x) * 4 + 3] ?? 0) > 0) top = y;
    }
    const row = (windmillSprite?.ground ?? 0) - (parts[vaneAt]?.lift ?? 0) - (py - top);
    expect(row).toBeGreaterThanOrEqual((KHORTYTSIA_WORLD.river?.rows ?? Infinity) + 4);
  });

  // M2-29 B2: the V–VI sails reach 42 px (art-director M2-07: they read short) — the tip of every frame stays under
  // the river band, which would cover it.
  it('keeps the top sail tip of every tier and frame below the river band', () => {
    const rows = KHORTYTSIA_WORLD.river?.rows ?? 0;
    expect(rows).toBeGreaterThan(0);
    const reach = new Map<string, number>();
    for (const gen of [windmillSails, millSails]) {
      for (const f of renderGenerator(gen, palette, [])) {
        const stem = f.name.slice(0, f.name.indexOf('/'));
        const py = Math.round(f.anchor.y * f.image.height);
        let top = py;
        for (let y = 0; y < f.image.height && top === py; y++) {
          for (let x = 0; x < f.image.width; x++) {
            if ((f.image.data[(y * f.image.width + x) * 4 + 3] ?? 0) > 0) {
              top = y;
              break;
            }
          }
        }
        reach.set(stem, Math.max(reach.get(stem) ?? 0, py - top));
      }
    }
    expect(reach.get('mill-sails.l')).toBeGreaterThan(reach.get('mill-sails.m') ?? 0);
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      const sails = partsAt(tier).find((p) => p.sprite.includes('sails'));
      const up = reach.get(sails?.sprite ?? '') ?? Infinity;
      const tip = (windmillSprite?.ground ?? 0) - (sails?.lift ?? 0) - up;
      expect(tip, `t${String(tier)}`).toBeGreaterThanOrEqual(rows);
    }
  });
});

describe('smithy add-ons', () => {
  const smithySprite = KHORTYTSIA_SUBURB.props.filter(isTierSprite).find((t) => t.building === 'smithy');

  it('lays the forge fire on the hearth of every tier', () => {
    expect(smithySprite).toBeDefined();
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      const look = smithySprite?.tiers[tier - 1];
      const fire = look && 'parts' in look ? look.parts.find((p) => p.sprite === 'forge') : undefined;
      const want = smithyForge(`t${String(tier)}`);
      expect([fire?.dx, fire?.lift], `t${String(tier)}`).toEqual([want.dx, want.lift]);
    }
  });
});

describe('fair add-ons', () => {
  it('stands the VI gilt vane on the shop ridge of the generator', () => {
    const fairSprite = KHORTYTSIA_SUBURB.props.filter(isTierSprite).find((t) => t.building === 'fair');
    const look = fairSprite?.tiers[5];
    const parts = look && 'parts' in look ? look.parts : [];
    const shop = parts.find((p) => p.sprite === 'shop');
    const vane = parts.find((p) => p.sprite === 'gilt.vane');
    expect([vane?.dx, vane?.dground, vane?.lift]).toEqual([
      (shop?.dx ?? 0) + SHOP_RIDGE.dx,
      shop?.dground,
      SHOP_RIDGE.lift,
    ]);
  });
});
