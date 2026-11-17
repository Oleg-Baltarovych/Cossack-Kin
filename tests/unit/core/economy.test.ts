import { describe, expect, it } from 'vitest';
import { FARM, SICH } from '../../../src/content/economy.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { Big } from '../../../src/core/big.ts';
import {
  bulkCost,
  buyCount,
  cost,
  incomeRate,
  maxAffordable,
  milestoneMult,
  prod,
  tier,
} from '../../../src/core/economy.ts';
import { createInitialState } from '../../../src/core/state.ts';

const close = (a: number, b: number, rel = 1e-9): boolean => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const field = KHORTYTSIA.buildings.find((b) => b.id === 'field');
const windmill = KHORTYTSIA.buildings.find((b) => b.id === 'windmill');
const walls = SICH_BUILDINGS.find((b) => b.id === 'walls');
if (!field || !windmill || !walls) throw new Error('content missing');
const FARM_MAX = FARM.levelMax;

describe('milestones and tiers (M1-05)', () => {
  it('milestoneMult: ×2 at 10, 25, 50, 75 and ×3 at 100 (SPEC §3.2), cumulative', () => {
    const at = (l: number): number => milestoneMult(l, FARM.milestones);
    expect([0, 9, 10, 24, 25, 49, 50, 74, 75, 99, 100].map(at)).toEqual([1, 1, 2, 2, 4, 4, 8, 8, 16, 16, 48]);
  });

  it('tier counts the milestones passed: farm 0…5, Sich 0…3', () => {
    const farmLevels = FARM.milestones.map((m) => m.level);
    expect([0, 9, 10, 24, 25, 49, 50, 99, 100].map((l) => tier(l, farmLevels))).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 5]);
    expect([0, 9, 10, 25, 49, 50].map((l) => tier(l, SICH.milestones))).toEqual([0, 0, 1, 2, 2, 3]);
  });
});

describe('cost and income (M1-05)', () => {
  it('cost(l) = base × scale × growth^l × mult: the field costs 10, then 11.5, …', () => {
    expect(close(cost(field, 0, 1).toNumber(), 10)).toBe(true);
    expect(close(cost(field, 1, 1).toNumber(), 11.5)).toBe(true);
    expect(close(cost(field, 10, 1).toNumber(), 10 * 1.15 ** 10)).toBe(true);
    expect(close(cost(field, 10, 1000, 0.8).toNumber(), 10 * 1000 * 1.15 ** 10 * 0.8)).toBe(true);
    expect(close(cost(walls, 3, KHORTYTSIA.gloryScale).toNumber(), walls.base * walls.growth ** 3)).toBe(true);
  });

  it('bulkCost(l, n) is the geometric sum of the n single costs', () => {
    for (const [l, n] of [
      [0, 1],
      [0, 10],
      [7, 25],
      [60, 40],
    ] as const) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += cost(field, l + k, 1).toNumber();
      expect(close(bulkCost(field, l, n, 1).toNumber(), sum, 1e-9), `l=${String(l)} n=${String(n)}`).toBe(true);
    }
    expect(bulkCost(field, 5, 0, 1).isZero()).toBe(true);
  });

  it('prod(l) = baseProd × scale × l × milestoneMult(l) × mult; 0 at level 0', () => {
    expect(prod(field, 0, 1).isZero()).toBe(true);
    expect(close(prod(field, 9, 1).toNumber(), 0.5 * 9)).toBe(true);
    expect(close(prod(field, 10, 1).toNumber(), 0.5 * 10 * 2)).toBe(true);
    expect(close(prod(windmill, 25, 1, 2).toNumber(), 200 * 25 * 4 * 2)).toBe(true);
    expect(close(prod(field, 100, 1).toNumber(), 0.5 * 100 * 48)).toBe(true);
  });

  it('incomeRate sums every building, with a per-building multiplier', () => {
    const s = createInitialState({ seed: 1, now: 0 });
    expect(incomeRate(s.village.levels, KHORTYTSIA).isZero()).toBe(true);
    const levels = { ...s.village.levels, field: 10, windmill: 25 };
    const plain = 0.5 * 10 * 2 + 200 * 25 * 4;
    expect(close(incomeRate(levels, KHORTYTSIA).toNumber(), plain)).toBe(true);
    const doubledMill = incomeRate(levels, KHORTYTSIA, (id) => (id === 'windmill' ? 2 : 1));
    expect(close(doubledMill.toNumber(), 0.5 * 10 * 2 + 200 * 25 * 4 * 2)).toBe(true);
  });
});

describe('MAX and bulk buying (M1-05)', () => {
  it('maxAffordable buys exactly what the money covers: n affordable, n + 1 not', () => {
    for (const [level, money] of [
      [0, 10],
      [0, 9.99],
      [0, 1e6],
      [12, 5e4],
      [40, 3.7e9],
    ] as const) {
      const n = maxAffordable(field, level, Big.from(money), 1, FARM_MAX);
      expect(bulkCost(field, level, n, 1).lte(money), `n=${String(n)} affordable`).toBe(true);
      if (level + n < FARM_MAX) expect(bulkCost(field, level, n + 1, 1).gt(money), `n+1 not`).toBe(true);
    }
    expect(maxAffordable(field, 0, Big.from(9.99), 1, FARM_MAX)).toBe(0);
  });

  it('maxAffordable at exactly the price of n levels returns n (float noise in pow must not lose one)', () => {
    for (const n of [1, 5, 10, 33]) {
      const price = bulkCost(field, 3, n, 1);
      expect(maxAffordable(field, 3, price, 1, FARM_MAX)).toBe(n);
    }
  });

  it('never goes past the level cap (farm 100, Sich 50), however rich', () => {
    const rich = Big.fromString('1e200') ?? Big.ZERO;
    expect(maxAffordable(field, 95, rich, 1, FARM_MAX)).toBe(5);
    expect(maxAffordable(field, FARM_MAX, rich, 1, FARM_MAX)).toBe(0);
    expect(maxAffordable(walls, 48, rich, 1, SICH.levelMax)).toBe(2);
  });

  it('buyCount: ×1/×10/×25 buy exactly n (or the rest up to the cap) only if affordable; MAX as much as possible', () => {
    const rich = Big.fromString('1e200') ?? Big.ZERO;
    expect(buyCount(field, 0, Big.from(1e6), 1, FARM_MAX, 10)).toBe(10);
    expect(buyCount(field, 90, rich, 1, FARM_MAX, 25)).toBe(10); // ×25 near the cap: the 10 that are left
    expect(buyCount(field, FARM_MAX, rich, 1, FARM_MAX, 25)).toBe(0);
    // ×10 that is not affordable is 0 (the button is disabled), even if a few levels would be.
    const priceOf5 = bulkCost(field, 0, 5, 1);
    expect(buyCount(field, 0, priceOf5, 1, FARM_MAX, 10)).toBe(0);
    expect(buyCount(field, 0, priceOf5, 1, FARM_MAX, 'max')).toBe(5);
    expect(buyCount(field, 0, Big.from(5), 1, FARM_MAX, 1)).toBe(0);
  });
});

describe('income-rate bound (M1-09: rates are computed in number, only totals in Big)', () => {
  it('the largest income rate any land can reach stays far below Number.MAX_VALUE', () => {
    // SPEC §3.7: village.scale ×~1000 per land; land 8 = 1000^7. Revisit if the land scales change (M5 content).
    const lastLandScale = 1000 ** 7;
    const generousMods = 1e6; // far above any modifier stack the game has
    const levels = Object.fromEntries(KHORTYTSIA.buildings.map((b) => [b.id, FARM.levelMax])) as Record<
      (typeof KHORTYTSIA.buildings)[number]['id'],
      number
    >;
    const rate = incomeRate(levels, { ...KHORTYTSIA, scale: lastLandScale }, () => generousMods).toNumber();
    expect(Number.isFinite(rate)).toBe(true);
    expect(Math.log10(rate)).toBeLessThan(100); // ≪ 308: rates never need Big
  });
});
