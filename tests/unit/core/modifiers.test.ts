import { describe, expect, it } from 'vitest';
import { ARMY, DEFENCE, FOOD, OFFLINE } from '../../../src/content/economy.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS, KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { incomeRate } from '../../../src/core/economy.ts';
import {
  collectModifiers,
  defence,
  farmIncomeRate,
  kharch,
  maxCossacks,
  sichUnlocked,
} from '../../../src/core/modifiers.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';

const close = (a: number, b: number, rel = 1e-9): boolean => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const base = createInitialState({ seed: 1, now: 0 });
/** The new game with farm levels / Sich levels overridden. */
function at(
  farm: Partial<Record<(typeof FARM_BUILDING_IDS)[number], number>>,
  sich: Partial<GameState['village']['sichLevels']> = {},
): GameState {
  return {
    ...base,
    village: {
      ...base.village,
      levels: { ...base.village.levels, ...farm },
      sichLevels: { ...base.village.sichLevels, ...sich },
    },
  };
}
const per = (id: string): number => KHORTYTSIA.buildings.find((b) => b.id === id)?.kharchPerLevel ?? 0;
const sichDef = (id: string): number => SICH_BUILDINGS.find((b) => b.id === id)?.effects.defencePerLevel ?? 0;
const allFarm = (level: number): Record<(typeof FARM_BUILDING_IDS)[number], number> =>
  Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, level])) as Record<(typeof FARM_BUILDING_IDS)[number], number>;

describe('kharch and the Cossack limit (M1-06)', () => {
  it('kharch sums only the food buildings', () => {
    expect(kharch(at({}))).toBe(0);
    const s = at({ field: 10, garden: 4, windmill: 2, potter: 50, smithy: 30 });
    expect(kharch(s)).toBe(10 * per('field') + 4 * per('garden') + 2 * per('windmill'));
  });

  it('maxCossacks = floor(kharch / kharchPerCossack) + the kurins', () => {
    const s = at({ field: 13, garden: 3 }, { kurins: 4 });
    const fromFood = Math.floor((13 * per('field') + 3 * per('garden')) / FOOD.kharchPerCossack);
    const kurins = SICH_BUILDINGS.find((b) => b.id === 'kurins')?.effects.cossacksPerLevel ?? 0;
    expect(maxCossacks(s)).toBe(fromFood + 4 * kurins);
  });
});

describe('defence (M1-06)', () => {
  it('grows with Sich levels, the walls weighing most', () => {
    expect(defence(at({}))).toBe(0);
    expect(defence(at({}, { walls: 5, kurins: 2 }))).toBe(5 * sichDef('walls') + 2 * sichDef('kurins'));
    expect(sichDef('walls')).toBeGreaterThan(sichDef('kurins'));
  });

  it('counts only unlocked buildings (a crafted save with a locked church level gets nothing for it)', () => {
    const church = SICH_BUILDINGS.find((b) => b.id === 'church');
    const cannonry = SICH_BUILDINGS.find((b) => b.id === 'cannonry');
    if (!church || !cannonry) throw new Error('content');
    expect(sichUnlocked(church, at(allFarm(24)))).toBe(false);
    expect(sichUnlocked(church, at(allFarm(25)))).toBe(true);
    expect(sichUnlocked(cannonry, at(allFarm(100)))).toBe(false); // land 5
    expect(defence(at(allFarm(10), { church: 7, cannonry: 9 }))).toBe(0);
    expect(defence(at(allFarm(25), { church: 7 }))).toBe(7 * sichDef('church'));
  });

  it('multiplies only the farm/suburb income, not glory', () => {
    const calm = at({ field: 20, potter: 5 });
    const guarded = at({ field: 20, potter: 5 }, { walls: 10 });
    const m0 = collectModifiers(calm);
    const m1 = collectModifiers(guarded);
    expect(close(m1.incomeMult, 1 + 10 * sichDef('walls') * DEFENCE.incomePerPoint)).toBe(true);
    expect(farmIncomeRate(guarded, m1).toNumber()).toBeGreaterThan(farmIncomeRate(calm, m0).toNumber());
    expect(m1.gloryMult).toBe(m0.gloryMult);
  });
});

describe('collectModifiers: the one source of multipliers (M1-06)', () => {
  it('a new game: neutral multipliers, the land passive on the windmill, base caps', () => {
    const m = collectModifiers(base);
    expect(m.incomeMult).toBe(1);
    expect(m.costMult).toBe(1);
    expect(m.gloryMult).toBe(1);
    expect(m.powerMult).toBe(1);
    expect(m.offlineMult).toBe(OFFLINE.mult);
    expect(m.offlineCapSec).toBe(OFFLINE.capSec);
    expect(m.gloryCapSec).toBe(ARMY.gloryCapSec);
    expect(m.buildingMult.windmill).toBe(KHORTYTSIA.passive.mult);
    expect(m.buildingMult.field).toBe(1);
  });

  it('the smithy and the maidan raise army power; the tavern and the church raise glory; the treasury the glory cap', () => {
    const m = collectModifiers(at({ ...allFarm(25), smithy: 30, tavern: 40 }, { maidan: 10, church: 5, treasury: 3 }));
    const smithy = 30 * 0.03;
    const maidan = 10 * (SICH_BUILDINGS.find((b) => b.id === 'maidan')?.effects.powerPerLevel ?? 0);
    expect(close(m.powerMult, 1 + smithy + maidan)).toBe(true);
    const church = 5 * (SICH_BUILDINGS.find((b) => b.id === 'church')?.effects.gloryPerLevel ?? 0);
    expect(close(m.gloryMult, 1 + 40 * 0.01 + church)).toBe(true);
    const treasury = 3 * (SICH_BUILDINGS.find((b) => b.id === 'treasury')?.effects.gloryCapSecPerLevel ?? 0);
    expect(m.gloryCapSec).toBe(ARMY.gloryCapSec + treasury);
  });

  it('farmIncomeRate = incomeRate with the per-building multipliers × incomeMult', () => {
    const s = at({ field: 10, windmill: 25 }, { walls: 4 });
    const m = collectModifiers(s);
    const expected = incomeRate(s.village.levels, KHORTYTSIA, (id) => m.buildingMult[id]).mul(m.incomeMult);
    expect(farmIncomeRate(s, m).eq(expected)).toBe(true);
  });
});
