import { describe, expect, it } from 'vitest';
import { ARMY } from '../../../src/content/economy.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { Big } from '../../../src/core/big.ts';
import { collectModifiers, maxCossacks } from '../../../src/core/modifiers.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import {
  armyPower,
  canHire,
  gloryGain,
  gloryRate,
  hireBulkCost,
  hireCost,
  hireCount,
} from '../../../src/core/systems/army.ts';

const close = (a: number, b: number, rel = 1e-9): boolean => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const NOW = 0;
const base = createInitialState({ seed: 3, now: NOW });

/** A state with `infantry` Cossacks, `ducats`, and food from fields at `field`. */
function with_(
  infantry: number,
  ducats: number,
  field: number,
  extra: Partial<GameState['village']['levels']> = {},
): GameState {
  return {
    ...base,
    currencies: { ...base.currencies, ducats: Big.from(ducats) },
    army: { infantry },
    village: { ...base.village, levels: { ...base.village.levels, field, ...extra } },
  };
}

describe('hiring infantry (M1-08)', () => {
  it('the n-th Cossack costs unitBase × scale × hireGrowth^n', () => {
    for (const n of [0, 1, 7, 40]) {
      const want = ARMY.infantry.unitBase * KHORTYTSIA.scale * ARMY.hireGrowth ** n;
      expect(close(hireCost(n, KHORTYTSIA.scale).toNumber(), want)).toBe(true);
    }
  });

  it('hiring above the food limit is refused with reason "kharch", even with the money', () => {
    const s = with_(0, 1e12, 20); // 20 fields → 20 kharch → 2 Cossacks
    const limit = maxCossacks(s);
    expect(limit).toBeGreaterThan(0);
    expect(canHire(s, limit).ok).toBe(true);
    const over = canHire(s, limit + 1);
    expect(over).toEqual({ ok: false, reason: 'kharch' });
    expect(canHire(with_(limit, 1e12, 20), 1)).toEqual({ ok: false, reason: 'kharch' });
  });

  it('without the ducats the reason is "ducats"; with them the price is the geometric sum', () => {
    const s = with_(2, 10, 200);
    expect(canHire(s, 1)).toEqual({ ok: false, reason: 'ducats' });
    const rich = with_(2, 1e9, 200);
    const r = canHire(rich, 3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const sum = [2, 3, 4].reduce((t, n) => t + hireCost(n, KHORTYTSIA.scale).toNumber(), 0);
      expect(close(r.cost.toNumber(), sum)).toBe(true);
    }
    expect(canHire(rich, 0)).toEqual({ ok: false, reason: 'count' });
  });
});

describe('hiring several at once (M2-14)', () => {
  /** Ducats for Cossacks `from` … `from + n − 1`, summed one by one (the closed form must agree). */
  const sum = (from: number, n: number): number => {
    let t = 0;
    for (let i = from; i < from + n; i++) t += hireCost(i, KHORTYTSIA.scale).toNumber();
    return t;
  };

  it('×10 / ×25 hire exactly n when food and ducats cover all of them, otherwise none', () => {
    const s = with_(4, sum(4, 10), 400); // 400 kharch → 40 Cossacks
    expect(maxCossacks(s) - 4).toBeGreaterThanOrEqual(25);
    expect(hireCount(s, 10)).toBe(10);
    expect(hireCount(with_(4, sum(4, 10) * 0.999, 400), 10)).toBe(0);
    expect(hireCount(s, 25)).toBe(0);
    expect(hireCount(with_(4, sum(4, 25), 400), 25)).toBe(25);
    expect(hireCount(s, 1)).toBe(1);
  });

  it('×10 near the food limit hires the rest up to it; at the limit nothing', () => {
    const s = with_(0, 1e12, 30); // 30 kharch → 3 Cossacks
    const room = maxCossacks(s);
    expect(room).toBeLessThan(10);
    expect(hireCount(s, 10)).toBe(room);
    expect(hireCount(s, 'max')).toBe(room);
    expect(hireCount(with_(room, 1e12, 30), 10)).toBe(0);
    expect(hireCount(with_(room, 1e12, 30), 'max')).toBe(0);
  });

  it('Max hires the most the ducats cover, and the reducer takes exactly that many', () => {
    const s = with_(3, sum(3, 7) + 1, 400);
    expect(hireCount(s, 'max')).toBe(7);
    expect(hireCount(with_(3, sum(3, 7) - 1, 400), 'max')).toBe(6);
    expect(hireCount(with_(3, 1, 400), 'max')).toBe(0);
    const n = hireCount(s, 'max');
    expect(canHire(s, n).ok).toBe(true);
    expect(canHire(s, n + 1).ok).toBe(false);
  });
});

describe('hire price under a cost modifier (M2-14 review)', () => {
  // No content source lowers hire prices yet (costMult is 1 in M1/M2); the path is checked with an injected modifier.
  it('the bulk price scales with costMult, and Max affords more when hiring is cheaper', () => {
    expect(
      close(hireBulkCost(5, 4, KHORTYTSIA.scale, 0.5).toNumber(), hireBulkCost(5, 4, KHORTYTSIA.scale).toNumber() / 2),
    ).toBe(true);
    const s = with_(3, 2e4, 2000);
    const mods = collectModifiers(s, NOW);
    expect(hireCount(s, 'max', NOW, { ...mods, costMult: 0.5 })).toBeGreaterThan(hireCount(s, 'max', NOW, mods));
  });
});

describe('army power and passive glory (M1-08)', () => {
  it('ArmyPower = infantry × power × powerMult; glory/s = ArmyPower × gloryPerPower × gloryMult', () => {
    const s = with_(10, 0, 200, { smithy: 5, tavern: 20 });
    const m = collectModifiers(s, NOW);
    const power = 10 * ARMY.infantry.power * m.powerMult;
    expect(close(armyPower(s, m), power)).toBe(true);
    expect(close(gloryRate(s, m).toNumber(), power * ARMY.gloryPerPower * m.gloryMult)).toBe(true);
    expect(gloryRate(with_(0, 0, 0), collectModifiers(base, NOW)).isZero()).toBe(true);
  });

  it('glory grows linearly with time up to the store cap, then stops', () => {
    const rate = Big.from(2);
    const cap = 3600;
    expect(gloryGain(rate, 0, cap).isZero()).toBe(true);
    expect(gloryGain(rate, 100, cap).toNumber()).toBe(200);
    expect(gloryGain(rate, 1800, cap).toNumber()).toBe(3600);
    expect(gloryGain(rate, cap, cap).toNumber()).toBe(7200);
    expect(gloryGain(rate, 10 * cap, cap).toNumber()).toBe(7200);
  });
});
