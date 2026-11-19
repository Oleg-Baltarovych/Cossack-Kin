// Chimney smoke (plan M2-11, SPEC §6.3): puffs rise from the mouth, the wind bends and flattens the plume, «менше руху»
// holds a still plume. Pure functions of time and wind, whole px.
import { describe, expect, it } from 'vitest';
import { SMOKE, WIND_STRENGTH } from '../../../src/render/atmosphere/config.ts';
import { smokePuffs, stillPlume, type Puff } from '../../../src/render/fx/smoke.ts';

const VENT = { x: 100, y: 200, seed: 3 };
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Puffs over a few seconds of one chimney, so a single moment's stagger does not decide the test. */
const sample = (strength: number): Puff[] =>
  Array.from({ length: 40 }, (_, i) => smokePuffs(i * 0.37, VENT, strength, 8)).flat();

describe('smokePuffs', () => {
  it('keeps `count` puffs on whole px, rising from the mouth (never below it), every age frame shown', () => {
    const puffs = sample(WIND_STRENGTH.breeze);
    expect(puffs).toHaveLength(40 * 8);
    for (const p of puffs) {
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
      expect(p.y).toBeLessThanOrEqual(VENT.y);
      expect(p.y).toBeGreaterThanOrEqual(VENT.y - SMOKE.rise);
    }
    expect(new Set(puffs.map((p) => p.frame))).toEqual(new Set([0, 1, 2]));
  });

  it('young puffs are small and low, old ones large and high', () => {
    const puffs = sample(WIND_STRENGTH.calm);
    const height = (f: number): number => mean(puffs.filter((p) => p.frame === f).map((p) => VENT.y - p.y));
    expect(height(0)).toBeLessThan(height(1));
    expect(height(1)).toBeLessThan(height(2));
  });

  it('drifts downwind (+x) with the wind: calm stands nearly upright, a storm leans far and flattens', () => {
    const calm = sample(WIND_STRENGTH.calm);
    const storm = sample(WIND_STRENGTH.storm);
    const drift = (ps: Puff[]): number => mean(ps.map((p) => p.x - VENT.x));
    const top = (ps: Puff[]): number => Math.max(...ps.map((p) => VENT.y - p.y));
    expect(Math.abs(drift(calm))).toBeLessThan(3);
    expect(drift(storm)).toBeGreaterThan(drift(calm) + 10);
    expect(top(storm)).toBeLessThan(top(calm));
  });

  it('is a function of time: repeats for the same second, moves on the next', () => {
    expect(smokePuffs(5, VENT, 0.5, 6)).toEqual(smokePuffs(5, VENT, 0.5, 6));
    expect(smokePuffs(5.5, VENT, 0.5, 6)).not.toEqual(smokePuffs(5, VENT, 0.5, 6));
  });

  it('two chimneys do not puff in step', () => {
    const a = smokePuffs(2, VENT, 0.5, 6).map((p) => p.y - VENT.y);
    const b = smokePuffs(2, { ...VENT, seed: 4 }, 0.5, 6).map((p) => p.y - VENT.y);
    expect(a).not.toEqual(b);
  });
});

describe('stillPlume («менше руху»)', () => {
  it('is a fixed plume of stillPuffs puffs, one per age, still leaning with the wind', () => {
    const calm = stillPlume(VENT, WIND_STRENGTH.calm);
    expect(calm).toHaveLength(SMOKE.stillPuffs);
    expect(calm.map((p) => p.frame)).toEqual([0, 1, 2]);
    const storm = stillPlume(VENT, WIND_STRENGTH.storm);
    expect(mean(storm.map((p) => p.x))).toBeGreaterThan(mean(calm.map((p) => p.x)));
  });
});
