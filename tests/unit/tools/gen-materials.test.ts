// Material set 1 (plan ART-03, ART-BIBLE §4–5) and the contact sheet (ART-02): per-swatch color budget, texture
// instead of flat fill, determinism by seed, sheet geometry.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import materials1, { MATERIAL_SWATCHES } from '../../../assets-src/gen/debug/materials-1/index.ts';
import khata, { KHATA_GROUND } from '../../../assets-src/gen/khortytsia/khata/index.ts';
import tyn, { TYN_GROUND } from '../../../assets-src/gen/khortytsia/tyn/index.ts';
import { createIndexBuffer, quantize, type RampName } from '../../../assets-src/gen/lib/buffer.ts';
import { earth, planks } from '../../../assets-src/gen/lib/materials.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import { compose } from '../../../assets-src/gen/lib/passes.ts';
import { rect } from '../../../assets-src/gen/lib/shapes.ts';
import type { RgbaImage } from '../../../tools/lib/png.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats, contactSheet } from '../../../tools/lib/sprites/contact-sheet.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
const rampSize = (ramp: RampName): number => palette.ramps.get(ramp)?.length ?? 0;

const render = (): FrameImage[] => {
  const problems: string[] = [];
  const frames = renderGenerator(materials1, palette, problems);
  expect(problems).toEqual([]);
  return frames;
};

/** Share of opaque px taken by the most frequent color. */
function dominantShare(img: RgbaImage): number {
  const counts = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    if ((img.data[i * 4 + 3] ?? 0) === 0) continue;
    opaque += 1;
    const rgb = ((img.data[i * 4] ?? 0) << 16) | ((img.data[i * 4 + 1] ?? 0) << 8) | (img.data[i * 4 + 2] ?? 0);
    counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / opaque;
}

describe('materials-1 swatches', () => {
  const frames = render();

  it('has one 32×32 swatch per material', () => {
    expect(frames.map((f) => f.name)).toEqual(MATERIAL_SWATCHES.map((m) => `materials-1.${m}/idle/00`));
    for (const f of frames) expect([f.image.width, f.image.height]).toEqual([32, 32]);
  });

  it.each(MATERIAL_SWATCHES.map((m, i) => [m, i] as const))(
    '%s: ≤ 16 palette colors from ≤ 4 ramps, not a flat fill (≥ 6 colors, no color on 80 percent of px)',
    (_name, i) => {
      const img = frames[i]?.image;
      if (!img) throw new Error('missing frame');
      const stats = colorStats(img, palette);
      expect(stats.colors).toBeLessThanOrEqual(16);
      expect(stats.ramps.length).toBeLessThanOrEqual(4);
      expect(stats.colors).toBeGreaterThanOrEqual(6);
      expect(dominantShare(img)).toBeLessThan(0.8);
    },
  );

  it('grass keeps to ≤ 6 grass colors plus gold flecks (recipe)', () => {
    const img = frames[MATERIAL_SWATCHES.indexOf('grass')]?.image;
    if (!img) throw new Error('missing frame');
    expect(colorStats(img, palette).ramps).toEqual(['gold', 'grass']);
    expect(colorStats(img, palette).colors).toBeLessThanOrEqual(7);
  });

  it('the AO band under the eave is darker than the wall below it', () => {
    const img = frames[MATERIAL_SWATCHES.indexOf('thatch')]?.image;
    if (!img) throw new Error('missing frame');
    const ramp = palette.ramps.get('plaster') ?? [];
    const mean = (y: number): number => {
      let sum = 0;
      let n = 0;
      for (let x = 0; x < 32; x++) {
        const o = (y * 32 + x) * 4;
        const idx = ramp.indexOf(((img.data[o] ?? 0) << 16) | ((img.data[o + 1] ?? 0) << 8) | (img.data[o + 2] ?? 0));
        if (idx >= 0) {
          sum += idx;
          n += 1;
        }
      }
      return sum / Math.max(1, n);
    };
    expect(mean(25)).toBeLessThan(mean(28) - 1.5);
  });

  it('is deterministic: two runs give identical bytes', () => {
    const again = render();
    frames.forEach((f, i) => {
      expect(Buffer.from(again[i]?.image.data ?? []).equals(Buffer.from(f.image.data))).toBe(true);
    });
  });

  it('depends on the material seed', () => {
    const swatch = (seed: string): Uint8Array => {
      const buf = createIndexBuffer(32, 32, palette);
      compose(
        buf,
        [
          { shape: rect(0, 0, 32, 16), material: earth({ seed }) },
          { shape: rect(0, 16, 32, 16), material: planks({ seed }) },
        ],
        rampSize,
      );
      return quantize(buf, palette).data;
    };
    expect(Buffer.from(swatch('a')).equals(Buffer.from(swatch('a')))).toBe(true);
    expect(Buffer.from(swatch('a')).equals(Buffer.from(swatch('b')))).toBe(false);
  });
});

const opaquePx = (img: RgbaImage | undefined): { x: number; y: number }[] => {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; img && i < img.width * img.height; i++) {
    if ((img.data[i * 4 + 3] ?? 0) > 0) out.push({ x: i % img.width, y: Math.floor(i / img.width) });
  }
  return out;
};
const rampAt = (img: RgbaImage, x: number, y: number): string | undefined => {
  const o = (y * img.width + x) * 4;
  if ((img.data[o + 3] ?? 0) === 0) return undefined;
  return palette.colors.get(((img.data[o] ?? 0) << 16) | ((img.data[o + 1] ?? 0) << 8) | (img.data[o + 2] ?? 0))?.ramp;
};

describe('khata (khortytsia atlas)', () => {
  const problems: string[] = [];
  const frames = renderGenerator(khata, palette, problems);
  const byName = new Map(frames.map((f) => [f.name, f.image]));

  it('renders tiers I and III with emissive and shadow layers, pivot at the base', () => {
    expect(problems).toEqual([]);
    expect(frames.map((f) => f.name)).toEqual([
      'khata.t1/idle/00',
      'khata.t1@emissive/idle/00',
      'khata.t1@shadow/idle/00',
      'khata.t3/idle/00',
      'khata.t3@emissive/idle/00',
      'khata.t3@shadow/idle/00',
    ]);
    expect(khata.atlas).toBe('khortytsia');
    expect(khata.anchor?.y).toBeCloseTo((KHATA_GROUND + 1) / khata.size.h, 10);
    const base = opaquePx(byName.get('khata.t1/idle/00'));
    expect(Math.max(...base.map((p) => p.y))).toBe(KHATA_GROUND);
  });

  it('emissive = window glass minus mullions: 20 px per window (one in tier I, two in tier III)', () => {
    const t1 = opaquePx(byName.get('khata.t1@emissive/idle/00'));
    const t3 = opaquePx(byName.get('khata.t3@emissive/idle/00'));
    expect(t1).toHaveLength(20);
    expect(t3).toHaveLength(40);
    const img = byName.get('khata.t1/idle/00');
    if (!img) throw new Error('missing frame');
    for (const p of t1) expect(['ink', 'plaster']).toContain(rampAt(img, p.x, p.y));
  });

  it('heavy roof: thatch covers 50–56 % of the visible height; the pryzba is the wall width + 1 px each side', () => {
    const img = byName.get('khata.t1/idle/00');
    if (!img) throw new Error('missing frame');
    const rows = new Set(
      opaquePx(img)
        .filter((p) => rampAt(img, p.x, p.y) === 'thatch')
        .map((p) => p.y),
    );
    const share = rows.size / (KHATA_GROUND + 1);
    expect(share).toBeGreaterThanOrEqual(0.5);
    expect(share).toBeLessThanOrEqual(0.56);
    const pryzba = opaquePx(img).filter((p) => p.y === KHATA_GROUND - 1 && rampAt(img, p.x, p.y) === 'earth');
    const wall = opaquePx(img).filter((p) => p.y === KHATA_GROUND - 6 && rampAt(img, p.x, p.y) === 'plaster');
    const span = (ps: { x: number }[]): number => Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)) + 1;
    expect(span(pryzba)).toBe(span(wall) + 2);
  });

  it('the shadow falls right of the house at the ground line, never up the wall', () => {
    const shade = opaquePx(byName.get('khata.t1@shadow/idle/00'));
    const base = opaquePx(byName.get('khata.t1/idle/00'));
    expect(shade.every((p) => p.y >= KHATA_GROUND - 3)).toBe(true);
    expect(Math.max(...shade.map((p) => p.x))).toBeGreaterThanOrEqual(Math.max(...base.map((p) => p.x)) + 5);
  });
});

describe('tyn (khortytsia atlas)', () => {
  it('stands on its ground row with a pot hung on a stake and a contact shadow', () => {
    const problems: string[] = [];
    const [base, shadow] = renderGenerator(tyn, palette, problems);
    expect(problems).toEqual([]);
    const px = opaquePx(base?.image);
    expect(Math.max(...px.map((p) => p.y))).toBe(TYN_GROUND);
    const img = base?.image;
    if (!img) throw new Error('missing frame');
    expect(px.filter((p) => rampAt(img, p.x, p.y) === 'earth').length).toBeGreaterThan(30);
    expect(opaquePx(shadow?.image).length).toBeGreaterThan(40);
  });
});

describe('contactSheet', () => {
  const tiny: FrameImage = {
    name: 'a/idle/00',
    image: { width: 2, height: 1, data: new Uint8Array([0x3f, 0x75, 0x35, 255, 0, 0, 0, 0]) },
    declared: { w: 2, h: 1 },
    anchor: { x: 0.5, y: 1 },
  };

  it('draws each px as a scale×scale block (grid lines only darken the block edge) and labels the frame', () => {
    const sheet = contactSheet([tiny], palette, { scale: 6, preview: 0 });
    const at = (x: number, y: number): number => {
      const o = (y * sheet.width + x) * 4;
      return ((sheet.data[o] ?? 0) << 16) | ((sheet.data[o + 1] ?? 0) << 8) | (sheet.data[o + 2] ?? 0);
    };
    // Cell origin: margin 16, two text lines of 12 px + 4, 1 px border.
    const ox = 17;
    const oy = 16 + 24 + 4 + 1;
    for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) expect(at(ox + x, oy + y)).toBe(0x3f7535);
    expect(at(ox + 6 + 3, oy + 3)).not.toBe(0x3f7535); // transparent px → checker
    expect(at(ox, oy)).not.toBe(0x3f7535); // major grid line darkens the edge
    let label = 0;
    for (let y = 16; y < 26; y++) for (let x = 16; x < 60; x++) if (at(x, y) === 0xd8d4dc) label += 1;
    expect(label).toBeGreaterThan(20);
  });

  it('reports color and ramp counts', () => {
    expect(colorStats(tiny.image, palette)).toEqual({ colors: 1, ramps: ['grass'] });
  });
});
