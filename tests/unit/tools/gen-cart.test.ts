// The food cart (plan M2-20): `viz.full` / `viz.empty` frames match what the agents ask for (walk 6, idle 4 — the
// person set), each load is drawn in its own direction (full east, empty west: the light stays top-left, never
// mirrored), the oxen stand on the ground row, the walk is an animation, the leading nose is `VIZ_REACH` px from the
// pivot, and the colour budget holds.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import viz, { VIZ_GROUND, VIZ_REACH, VIZ_W } from '../../../assets-src/gen/people/viz/index.ts';
import { loadPalette } from '../../../assets-src/gen/lib/palette.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';
import { CART_SPRITES } from '../../../src/content/agents.ts';
import { personAnim } from '../../../src/render/agents/sim.ts';

const palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
const problems: string[] = [];
const frames: FrameImage[] = renderGenerator(viz, palette, problems);
const base = frames.filter((f) => !f.name.includes('@'));
const of = (stem: string, anim: string): FrameImage[] => base.filter((f) => f.name.startsWith(`${stem}/${anim}/`));
const key = (f: FrameImage): string => Buffer.from(f.image.data).toString('base64');

/** Opaque columns and the lowest opaque row of a frame. */
function extent(f: FrameImage): { x0: number; x1: number; low: number } {
  let [x0, x1, low] = [Infinity, -Infinity, -1];
  for (let y = 0; y < f.image.height; y++) {
    for (let x = 0; x < f.image.width; x++) {
      if ((f.image.data[(y * f.image.width + x) * 4 + 3] ?? 0) === 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      low = Math.max(low, y);
    }
  }
  return { x0, x1, low };
}

describe('viz: the food cart (M2-20)', () => {
  it('renders without problems, the frames the agents use', () => {
    expect(problems).toEqual([]);
    for (const stem of CART_SPRITES) {
      for (const anim of ['walk', 'idle'] as const)
        expect(of(stem, anim), `${stem} ${anim}`).toHaveLength(personAnim(anim).frames);
    }
  });

  it('stands on the ground row; the nose is VIZ_REACH px from the pivot, ahead in the direction of the load', () => {
    const pivot = VIZ_W / 2;
    for (const f of base) {
      const e = extent(f);
      expect(e.low, f.name).toBe(VIZ_GROUND);
      if (f.name.startsWith('viz.full/')) expect(e.x1 + 1 - pivot, f.name).toBeLessThanOrEqual(VIZ_REACH);
      else expect(pivot - e.x0, f.name).toBeLessThanOrEqual(VIZ_REACH);
    }
  });

  it('full is drawn facing east and empty facing west (not a mirror: the light stays top-left)', () => {
    const full = of('viz.full', 'idle')[0];
    const empty = of('viz.empty', 'idle')[0];
    if (!full || !empty) throw new Error('no idle frames');
    // The oxen (stone ramp) pull ahead: right of the middle going east, left of it going west.
    const oxen = (f: FrameImage): number => {
      let [sum, n] = [0, 0];
      for (let i = 0; i < f.image.width * f.image.height; i++) {
        const d = f.image.data;
        if ((d[i * 4 + 3] ?? 0) === 0) continue;
        const rgb = ((d[i * 4] ?? 0) << 16) | ((d[i * 4 + 1] ?? 0) << 8) | (d[i * 4 + 2] ?? 0);
        if (palette.colors.get(rgb)?.ramp !== 'stone') continue;
        sum += i % f.image.width;
        n += 1;
      }
      return sum / n;
    };
    expect(oxen(full)).toBeGreaterThan(VIZ_W / 2);
    expect(oxen(empty)).toBeLessThan(VIZ_W / 2);
    // A mirror of the full cart's bed would put its lit edge on the right: the empty one is its own drawing.
    const mirrored = (f: FrameImage): string => {
      const { width, height, data } = f.image;
      const out = Buffer.alloc(data.length);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          for (let c = 0; c < 4; c++) out[(y * width + (width - 1 - x)) * 4 + c] = data[(y * width + x) * 4 + c] ?? 0;
      return out.toString('base64');
    };
    expect(mirrored(empty)).not.toBe(key(full));
  });

  it('walks and breathes: every walk frame differs, the idle moves, full and empty differ', () => {
    for (const stem of CART_SPRITES) {
      expect(new Set(of(stem, 'walk').map(key)).size, stem).toBe(personAnim('walk').frames);
      expect(new Set(of(stem, 'idle').map(key)).size, stem).toBeGreaterThan(1);
    }
    const [full, empty] = [of('viz.full', 'idle')[0], of('viz.empty', 'idle')[0]];
    if (!full || !empty) throw new Error('no idle frames');
    expect(key(full)).not.toBe(key(empty));
  });

  // ≤ 32 colours: the explicit bound of a busy people frame (M2-17); two oxen, a cart and its load are past «~24».
  it('colour budget (ART-BIBLE §4): ≤ 6 ramps and ≤ 32 colours a frame', () => {
    for (const f of base) {
      const s = colorStats(f.image, palette);
      expect(s.ramps.length, `${f.name} ${s.ramps.join(',')}`).toBeLessThanOrEqual(6);
      expect(s.colors, f.name).toBeLessThanOrEqual(32);
    }
  });
});
