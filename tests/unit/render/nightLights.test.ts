import { describe, expect, it } from 'vitest';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { FIRE, FIRE_LIGHTS, FIREFLIES, WINDOW_POOL } from '../../../src/render/atmosphere/config.ts';
import { fireflies, flicker, paintPool, poolLook, sparks } from '../../../src/render/atmosphere/nightLights.ts';

describe('flicker (ART-16)', () => {
  it('stays within base ± depth in whole 1/8 steps and repeats for the same time', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const v = flicker(i / 37, 3);
      expect(v).toBeGreaterThanOrEqual(1 - FIRE.flicker.depth - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(v * 8 - Math.round(v * 8))).toBeLessThan(1e-9);
      expect(flicker(i / 37, 3)).toBe(v);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(1); // it does flicker
  });

  it('two lights with different seeds do not flicker in step', () => {
    const a = Array.from({ length: 50 }, (_, i) => flicker(i / 8, 1));
    const b = Array.from({ length: 50 }, (_, i) => flicker(i / 8, 2));
    expect(a).not.toEqual(b);
  });
});

describe('paintPool (ART-16 light pools)', () => {
  const pool = paintPool(20, 8, 0xffcc66);
  const alphaAt = (x: number, y: number): number => pool.pixels[(y * pool.w + x) * 4 + 3] ?? -1;

  it('is an ellipse rx × ry, brightest in the middle and empty past the rim', () => {
    expect(pool.w).toBe(41);
    expect(pool.h).toBe(17);
    expect(alphaAt(20, 8)).toBeGreaterThan(0);
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(40, 8)).toBe(0);
    expect(alphaAt(20, 8)).toBeGreaterThanOrEqual(alphaAt(30, 8));
  });

  it('uses only a few quantized alpha steps (pixel art, not a smooth gradient)', () => {
    const alphas = new Set<number>();
    for (let i = 3; i < pool.pixels.length; i += 4) alphas.add(pool.pixels[i] ?? 0);
    expect(alphas.size).toBeLessThanOrEqual(5);
  });

  it('is premultiplied: colour channels never exceed alpha', () => {
    for (let i = 0; i < pool.pixels.length; i += 4) {
      const a = pool.pixels[i + 3] ?? 0;
      expect(pool.pixels[i] ?? 0).toBeLessThanOrEqual(a);
    }
  });
});

describe('sparks and fireflies (ART-16)', () => {
  it('sparks rise from the fire in whole px, at most FIRE.sparks, and repeat for the same time', () => {
    const list = sparks(3.3, { x: 100, y: 200 });
    expect(list.length).toBeLessThanOrEqual(FIRE.sparks);
    for (const s of list) {
      expect(Number.isInteger(s.x) && Number.isInteger(s.y)).toBe(true);
      expect(s.y).toBeLessThanOrEqual(200);
      expect(s.y).toBeGreaterThanOrEqual(200 - FIRE.sparkRise);
    }
    expect(sparks(3.3, { x: 100, y: 200 })).toEqual(list);
    expect(sparks(3.6, { x: 100, y: 200 })).not.toEqual(list);
  });

  it('fireflies stay inside their area, at most FIREFLIES.count, some lit and some dark', () => {
    const area = { x0: 0, x1: 300, y0: 400, y1: 600 };
    const list = fireflies(12.5, area);
    expect(list.length).toBe(FIREFLIES.count);
    expect(FIREFLIES.count).toBeLessThanOrEqual(40);
    for (const f of list) {
      expect(f.x).toBeGreaterThanOrEqual(area.x0);
      expect(f.x).toBeLessThan(area.x1);
      expect(f.y).toBeGreaterThanOrEqual(area.y0);
      expect(f.y).toBeLessThan(area.y1);
    }
    const lit = list.filter((f) => f.on).length;
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(list.length);
  });
});

describe('poolLook (M2-08)', () => {
  it('gives fires their FIRE_LIGHTS pool and windows a flat one of a share of the mask width', () => {
    expect(poolLook({ sprite: 'campfire' }, null)).toMatchObject({ ...FIRE_LIGHTS.campfire, fire: true });
    expect(poolLook({ sprite: 'forge' }, 14)).toMatchObject({ ...FIRE_LIGHTS.forge, fire: true });
    expect(poolLook({ sprite: 'khata.t1' }, 76)).toMatchObject({ rx: 34, ry: WINDOW_POOL.ry, fire: false });
    expect(poolLook({ sprite: 'kurin' }, 4)?.rx).toBe(WINDOW_POOL.minRx);
    expect(poolLook({ sprite: 'tyn' }, null)).toBeNull();
  });

  it("takes a tier part's poolRx through the world layout (the tavern's pool fits its wall, not its frame)", () => {
    const taverns = KHORTYTSIA_WORLD.props.filter((p) => p.sprite.startsWith('tavern.'));
    expect(taverns).toHaveLength(6);
    for (const t of taverns) {
      expect(t.poolRx, t.sprite).toBeGreaterThan(0);
      expect(poolLook(t, 132)?.rx, t.sprite).toBe(t.poolRx);
    }
  });
});
