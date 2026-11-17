import { describe, expect, it } from 'vitest';
import { ARMY } from '../../../src/content/economy.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { Big } from '../../../src/core/big.ts';
import { collectModifiers, maxCossacks } from '../../../src/core/modifiers.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { armyPower, canHire, gloryGain, gloryRate, hireCost } from '../../../src/core/systems/army.ts';

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
