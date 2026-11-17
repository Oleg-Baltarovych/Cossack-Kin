import { describe, expect, it } from 'vitest';
import {
  binOf,
  dustMotes,
  paintBeam,
  paintShafts,
  RAY_ALPHA_STEPS,
  shadowMap,
  shaftBands,
  shaftLight,
  shaftStep,
} from '../../../src/render/atmosphere/rays.ts';
import { rayVariant } from '../../../src/render/layers/Light.ts';

const sun = { x: 50, y: 50 };
// One round occluder to the right of the sun (centre 85, 50, radius 5), and no horizon field.
const box = {
  ellipses: [{ cx: 85, cy: 50, rx: 5, ry: 5 }],
  horizon: 10_000,
  maxHeight: 0,
  height: () => 0,
};
const none = { ellipses: [], horizon: 10_000, maxHeight: 0, height: () => 0 };
const alphaAt = (out: Uint8Array, w: number, x: number, y: number): number => out[(y * w + x) * 4 + 3] ?? 0;

describe('shadow map (occlusion variant)', () => {
  it('a ray toward the occluder stops at it; other rays reach the full distance', () => {
    const map = shadowMap(sun, box, 200, 720);
    expect(map[binOf(sun, 100, 50, 720)]).toBeCloseTo(30, 0);
    expect(map[binOf(sun, 50, 150, 720)]).toBe(200);
  });

  it('the horizon height field shadows rays that cross it', () => {
    const field = {
      ellipses: [],
      horizon: 100,
      maxHeight: 20,
      height: (x: number) => (x >= 120 && x < 140 ? 15 : 0),
    };
    const low = { x: 50, y: 92 };
    const map = shadowMap(low, field, 200, 720);
    expect(map[binOf(low, 130, 92, 720)]).toBeLessThan(200); // straight right into the bluff
    expect(map[binOf(low, 130, 40, 720)]).toBe(200); // over it
  });

  it('light is 0 behind the occluder and beyond the reach', () => {
    const map = shadowMap(sun, box, 200, 720);
    expect(shaftLight(sun, map, 200, 120, 50)).toBe(0);
    expect(shaftLight(sun, map, 200, 50, 120)).toBeGreaterThan(0);
    expect(shaftLight(sun, map, 200, 300, 300)).toBe(0);
  });

  it('steps fall from a 40-px core outward and stop at the reach', () => {
    expect(shaftStep(10, 300)).toBe(4);
    expect(shaftStep(100, 300)).toBe(3);
    expect(shaftStep(200, 300)).toBe(2);
    expect(shaftStep(280, 300)).toBe(1);
    expect(shaftStep(300, 300)).toBe(0);
  });

  it('paints stepped opacities, nothing in the shadow, only step 1 on the ground, a checker in the outer quarter', () => {
    const w = 260;
    const h = 200;
    const out = new Uint8Array(w * h * 4);
    const map = shadowMap(sun, box, 200, 720);
    paintShafts(out, w, h, sun, map, 0xffd458, { reach: 200, cover: 0.4, scale: 1, horizon: 120 });
    const step1 = Math.round((0.4 / RAY_ALPHA_STEPS) * 255);
    expect(alphaAt(out, w, 52, 50)).toBe(Math.round(0.4 * 255)); // core
    expect(alphaAt(out, w, 121, 50)).toBe(0); // behind the box
    for (let x = 40; x < 80; x++) expect([0, step1]).toContain(alphaAt(out, w, x, 150)); // ground: step 1 only
    const outer = Array.from({ length: 6 }, (_, k) => alphaAt(out, w, 50 + 185 + (k % 2), 50 + (k >> 1)));
    expect(outer.some((a) => a === 0)).toBe(true); // checkered
  });
});

describe('shaft edges and bands (art-director ART-10)', () => {
  it('a wide open sector is broken into alternating dimmed bands; narrow gaps stay whole', () => {
    const open = new Float32Array(720).fill(200);
    const bands = shaftBands(open, 200);
    const dimmed = Array.from(bands).filter((v) => v === 1).length;
    expect(dimmed).toBeGreaterThan(200);
    expect(dimmed).toBeLessThan(520);
    // A 10° gap between shadows is not banded.
    const gap = new Float32Array(720).fill(20);
    for (let b = 100; b < 120; b++) gap[b] = 200;
    expect(Array.from(shaftBands(gap, 200).slice(100, 120)).every((v) => v === 0)).toBe(true);
  });

  it('the light fades over a few degrees toward a shadow edge instead of stopping on a line', () => {
    const map = new Float32Array(720).fill(200);
    for (let b = 0; b < 360; b++) map[b] = 10; // lower half (angles 0..180°) shadowed
    const w = 200;
    const out = new Uint8Array(w * 200 * 4);
    paintShafts(out, w, 200, { x: 100, y: 100 }, map, 0xffffff, { reach: 200, cover: 0.8, scale: 1, horizon: 999 });
    // Along a row just above the sun the alpha rises with the angle away from the edge (the +x axis).
    const row = 70;
    const a = (x: number): number => out[(row * w + x) * 4 + 3] ?? 0;
    expect(a(195)).toBeLessThanOrEqual(a(110));
  });
});

describe('beam (low tier) and dust', () => {
  const open = shadowMap(sun, none, 100, 720);
  it('a beam widens away from the sun and stops at the horizon', () => {
    const img = paintBeam(sun, 20, 100, 20, 0xffd458, 0.4, open, 70);
    const width = (along: number): number => {
      let n = 0;
      const cx = sun.x + Math.cos((20 * Math.PI) / 180) * along;
      for (let y = img.y; y < img.y + img.h; y++) {
        const x = Math.round(cx);
        if (x >= img.x && x < img.x + img.w && (img.pixels[((y - img.y) * img.w + (x - img.x)) * 4 + 3] ?? 0) > 0) n++;
      }
      return n;
    };
    expect(width(60)).toBeGreaterThan(width(10));
    for (let y = 70 - img.y; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) expect(img.pixels[(y * img.w + x) * 4 + 3]).toBe(0);
    }
  });

  it('a beam is clipped where the bluffs shadow it', () => {
    const map = shadowMap(sun, box, 100, 720);
    const img = paintBeam(sun, 0, 100, 10, 0xffd458, 0.4, map, 999);
    const at = (x: number, y: number): number => img.pixels[((y - img.y) * img.w + (x - img.x)) * 4 + 3] ?? 0;
    expect(at(70, 50)).toBeGreaterThan(0);
    expect(at(110, 50)).toBe(0);
  });

  it('dust motes are full-bright where lit at step ≥ 2, hidden elsewhere', () => {
    const motes = dustMotes(sun, 200, 40, 3.2, (x) => (x > 100 ? 3 : 1));
    expect(motes.length).toBe(40);
    for (const m of motes) if (m.x <= 100) expect(m.glow).toBe(0);
    expect(motes.some((m) => m.glow === 1)).toBe(true);
  });
});

describe('quality tier → variant (ART-10 decision)', () => {
  it('high = occlusion full res, med/auto = occlusion ½ res, low = beams', () => {
    expect(rayVariant('high')).toBe('occlusion-full');
    expect(rayVariant('med')).toBe('occlusion-half');
    expect(rayVariant(null)).toBe('occlusion-half');
    expect(rayVariant('low')).toBe('beams');
  });
});
