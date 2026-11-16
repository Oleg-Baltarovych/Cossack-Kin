import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FarPlane } from '../../../src/content/villages/khortytsia.layout.ts';
import { KHORTYTSIA_FARM } from '../../../src/content/villages/khortytsia.layout.ts';
import { dayCycle } from '../../../src/render/atmosphere/dayCycle.ts';
import {
  HAZE_ALPHA_STEPS,
  paintHazeBand,
  paintPlane,
  planeProfile,
} from '../../../src/render/atmosphere/landscapePaint.ts';
import { airHaze, PLANE_ROWS } from '../../../src/render/layers/landscape.ts';

const master = JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')) as {
  ramps: Record<string, string[]>;
};
const PALETTE = new Set(Object.values(master.ramps).flatMap((r) => r.map((h) => Number.parseInt(h.slice(1), 16))));

const steppe: FarPlane = { kind: 'steppe', layer: 'far', depth: 0.5, seed: 1, kurgans: [[50, 10, 6]] };
const cliffs: FarPlane = { kind: 'cliffs', layer: 'far', depth: 1.4, seed: 2, plateaus: [[40, 80, 20]] };
const grove: FarPlane = { kind: 'grove', layer: 'mid', depth: 2.3, seed: 3, groves: [[20, 60, 12]] };

const W = 120;
const H = 40;
function paint(plane: FarPlane, minutes: number, weather: 'clear' | 'fog' = 'clear'): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  const cycle = dayCycle(minutes);
  paintPlane(out, W, H, plane, planeProfile(plane, W), cycle, airHaze(cycle, weather));
  return out;
}
const colors = (out: Uint8Array): number[] => {
  const list: number[] = [];
  for (let i = 0; i < out.length; i += 4) {
    if ((out[i + 3] ?? 0) > 0) list.push(((out[i] ?? 0) << 16) | ((out[i + 1] ?? 0) << 8) | (out[i + 2] ?? 0));
  }
  return list;
};
const luma = (c: number): number => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
const meanLuma = (out: Uint8Array): number => {
  const c = colors(out);
  return c.reduce((s, v) => s + luma(v), 0) / Math.max(1, c.length);
};

describe('planeProfile (ART-08)', () => {
  it('kurgans rise above the low steppe line', () => {
    const p = planeProfile(steppe, W);
    expect(p.height[50]).toBeGreaterThanOrEqual(13);
    expect(p.height[10]).toBeLessThanOrEqual(11);
  });

  it('bluffs: a steep scarp on the sun side, a longer slope on the right, trees on the crest', () => {
    const p = planeProfile(cliffs, W);
    const at = (x: number): number => p.height[x] ?? 0;
    expect(at(60)).toBeGreaterThanOrEqual(19);
    expect(at(32)).toBeLessThan(at(92)); // 8 px left of the plateau is lower than 12 px right of it
    expect(Array.from(p.height).some((h, x) => h > (p.rock[x] ?? 0))).toBe(true);
  });

  it('every plane fits the layer buffer', () => {
    for (const plane of KHORTYTSIA_FARM.farPlanes) {
      expect(Math.max(...planeProfile(plane, 600).height)).toBeLessThan(PLANE_ROWS);
    }
  });

  it('the steppe is a continuous band (never a sliver) with kurgans above it', () => {
    const p = planeProfile(steppe, W);
    expect(Math.min(...p.height)).toBeGreaterThanOrEqual(8);
    expect(p.height[50]).toBeGreaterThan(Math.min(...p.height) + 3);
  });
});

describe('paintPlane: aerial perspective in the sky colours', () => {
  it('paints only master-palette colours, at every key', () => {
    for (const minutes of [330, 420, 780, 1170, 1260, 1380]) {
      for (const plane of [steppe, cliffs, grove]) {
        const off = colors(paint(plane, minutes)).filter((c) => !PALETTE.has(c));
        expect(off.slice(0, 3), `${plane.kind} at ${String(minutes)}`).toEqual([]);
      }
    }
  });

  it('nearer planes are darker than farther ones (depth), and night planes darker than day ones', () => {
    expect(meanLuma(paint(cliffs, 780))).toBeLessThan(meanLuma(paint(steppe, 780)));
    expect(meanLuma(paint(cliffs, 1380))).toBeLessThan(meanLuma(paint(cliffs, 780)));
  });

  it('fog thins the planes toward the horizon colour (lighter)', () => {
    expect(meanLuma(paint(cliffs, 420, 'fog'))).toBeGreaterThan(meanLuma(paint(cliffs, 420)));
  });
});

describe('paintHazeBand', () => {
  it('is most opaque right under the horizon, in stepped layers, and empty at its bottom', () => {
    const w = 64;
    const rows = 20;
    const out = new Uint8Array(w * 40 * 4);
    paintHazeBand(out, w, rows, dayCycle(330), 0.6);
    const alpha = (r: number): number => out[(r * w + 5) * 4 + 3] ?? 0;
    expect(alpha(0)).toBeGreaterThan(alpha(rows - 5));
    expect(alpha(rows)).toBe(0);
    const levels = new Set(Array.from({ length: rows }, (_, r) => alpha(r)));
    // The bands plus 0 where the lower edge dithers out.
    expect(levels.size).toBeLessThanOrEqual(HAZE_ALPHA_STEPS + 1);
    // One solid colour (premultiplied by a uniform alpha per row): no dotted chain dither.
    const rgbs = new Set(Array.from({ length: w }, (_, x) => out[(1 * w + x) * 4] ?? 0));
    expect(rgbs.size).toBe(1);
    // Inside a band the opacity is uniform across the row; band seams dither between two neighbouring levels.
    for (let x = 0; x < w; x++) expect(out[(1 * w + x) * 4 + 3]).toBe(alpha(1));
    const seam = new Set(Array.from({ length: w }, (_, x) => out[(4 * w + x) * 4 + 3] ?? 0));
    expect(seam.size).toBe(2);
  });
});
