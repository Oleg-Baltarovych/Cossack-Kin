import { describe, expect, it } from 'vitest';
import { createRng, hash32, hashUnit, next, type Rng } from '../../../src/core/rng.ts';

/** χ² of `values` (each in [0, 1)) over `bins` equal buckets. */
function chiSquare(values: readonly number[], bins: number): number {
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const b = Math.min(bins - 1, Math.floor(v * bins));
    counts[b] = (counts[b] ?? 0) + 1;
  }
  const expected = values.length / bins;
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
}
/** χ² critical value for 9 degrees of freedom at p = 0.001: a fair generator fails this 1 time in 1000. */
const CHI2_9_P001 = 27.88;

const take = (rng: Rng, n: number): number[] => {
  const out: number[] = [];
  let r = rng;
  for (let i = 0; i < n; i++) {
    const [v, r2] = next(r);
    out.push(v);
    r = r2;
  }
  return out;
};

describe('rng: mulberry32 in state (M1-02)', () => {
  it('matches the reference mulberry32 sequence for seed 1 (bryc, PRNGs.md)', () => {
    expect(take(createRng(1), 5)).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849,
    ]);
  });

  it('next() never mutates: the same state gives the same value; the returned state moves on', () => {
    const rng = createRng(42);
    const [a, after] = next(rng);
    const [b] = next(rng);
    expect(a).toBe(b);
    expect(after.state).not.toBe(rng.state);
    expect(next(after)[0]).not.toBe(a);
  });

  it('keeps its state a uint32 (survives JSON, as the save stores it)', () => {
    let r = createRng(-7);
    for (let i = 0; i < 100; i++) {
      expect(Number.isInteger(r.state) && r.state >= 0 && r.state <= 0xffffffff).toBe(true);
      r = next(r)[1];
    }
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('is uniform (χ² over 10⁴ values, 10 bins)', () => {
    expect(chiSquare(take(createRng(2026), 10_000), 10)).toBeLessThan(CHI2_9_P001);
  });
});

describe('hash32: stateless schedules (M1-02)', () => {
  it('is a stable pure function of (seed, i): the same inputs, the same uint32', () => {
    expect(hash32(1, 0)).toBe(hash32(1, 0));
    expect(hash32(1, 0)).not.toBe(hash32(1, 1));
    expect(hash32(1, 0)).not.toBe(hash32(2, 0));
    for (const [s, i] of [
      [0, 0],
      [1, 2],
      [0xffffffff, 7],
      [-3, 1e6],
    ] as const) {
      const h = hash32(s, i);
      expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
    }
  });

  it('pins its values (a change would reshuffle every saved schedule, e.g. the wind)', () => {
    expect([hash32(1, 0), hash32(1, 1), hash32(12345, 678)]).toEqual(PINNED);
  });

  it('is uniform over consecutive indices (χ² over 10⁴ values, 10 bins)', () => {
    const values = Array.from({ length: 10_000 }, (_, i) => hashUnit(7, i));
    for (const v of values) expect(v >= 0 && v < 1).toBe(true);
    expect(chiSquare(values, 10)).toBeLessThan(CHI2_9_P001);
  });
});

// Pinned once from this implementation (lowbias32 mixing): they guard against an accidental change, they do not
// prove correctness — uniformity and stability above do that.
const PINNED: readonly number[] = [3818772927, 841256496, 2656347195];
