import { describe, expect, it } from 'vitest';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { FARM, SICH, TAP } from '../../../src/content/economy.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import { bulkCost } from '../../../src/core/economy.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { collectModifiers, farmIncomeRate } from '../../../src/core/modifiers.ts';
import { createInitialState, validateState, type GameState } from '../../../src/core/state.ts';

const T0 = 1_763_400_000_000;
const field = KHORTYTSIA.buildings.find((b) => b.id === 'field');
if (!field) throw new Error('content');

function rich(ducats: number, glory = 0, farm: Partial<GameState['village']['levels']> = {}): GameState {
  const s = createInitialState({ seed: 11, now: T0 });
  return {
    ...s,
    // Every story beat already seen: beats have their own tests (story.test.ts), these are about the economy.
    story: { seen: [...STORY_BEAT_IDS] },
    currencies: { ...s.currencies, ducats: Big.from(ducats), glory: Big.from(glory) },
    village: { ...s.village, levels: { ...s.village.levels, ...farm } },
  };
}
const types = (events: readonly GameEvent[]): string[] => events.map((e) => e.type);
const rejected = (events: readonly GameEvent[]): string | undefined => {
  const e = events.find((x) => x.type === 'ActionRejected');
  return e?.type === 'ActionRejected' ? e.reason : undefined;
};

describe('buying farm buildings (M1-10)', () => {
  it('×1 buys a level, pays for it and emits BuildingUpgraded', () => {
    const s = rich(10);
    const r = applyAction(s, { type: 'buyBuilding', id: 'field', mode: 1 }, T0);
    expect(r.state.village.levels.field).toBe(1);
    expect(r.state.currencies.ducats.isZero()).toBe(true);
    expect(r.state.stats.purchases).toBe(1);
    expect(types(r.events)).toEqual(['BuildingUpgraded']);
  });

  it('crossing a milestone emits TierReached', () => {
    const s = rich(1e9, 0, { field: 9 });
    const r = applyAction(s, { type: 'buyBuilding', id: 'field', mode: 1 }, T0);
    expect(r.state.village.levels.field).toBe(10);
    expect(r.events).toContainEqual({ type: 'TierReached', zone: 'farm', id: 'field', tier: 1 });
  });

  it('MAX buys as many as the ducats cover and pays exactly their price', () => {
    const s = rich(1e5);
    const r = applyAction(s, { type: 'buyBuilding', id: 'field', mode: 'max' }, T0);
    const n = r.state.village.levels.field;
    expect(n).toBeGreaterThan(10);
    const paid = bulkCost(field, 0, n, KHORTYTSIA.scale);
    expect(r.state.currencies.ducats.sub(Big.from(1e5).sub(paid)).toNumber()).toBeCloseTo(0, 6);
  });

  it('not enough ducats / already at the cap → the state is unchanged and ActionRejected tells why', () => {
    const poor = rich(5);
    const r1 = applyAction(poor, { type: 'buyBuilding', id: 'field', mode: 1 }, T0);
    expect(r1.state).toEqual(poor);
    expect(rejected(r1.events)).toBe('ducats');
    const capped = rich(1e30, 0, { field: FARM.levelMax });
    const r2 = applyAction(capped, { type: 'buyBuilding', id: 'field', mode: 'max' }, T0);
    expect(r2.state).toEqual(capped);
    expect(rejected(r2.events)).toBe('max');
  });
});

describe('buying Sich buildings (M1-10)', () => {
  it('pays glory, raises the level, emits SichUpgraded', () => {
    const s = rich(0, 1e6);
    const r = applyAction(s, { type: 'buySich', id: 'walls', mode: 10 }, T0);
    expect(r.state.village.sichLevels.walls).toBe(10);
    expect(r.state.currencies.glory.lt(1e6)).toBe(true);
    expect(types(r.events)).toContain('SichUpgraded');
    expect(r.events).toContainEqual({ type: 'TierReached', zone: 'sich', id: 'walls', tier: 1 });
  });

  it('a locked building is refused ("locked"), however much glory', () => {
    const s = rich(0, 1e30);
    const church = applyAction(s, { type: 'buySich', id: 'church', mode: 1 }, T0);
    expect(church.state).toEqual(s);
    expect(rejected(church.events)).toBe('locked');
    expect(rejected(applyAction(s, { type: 'buySich', id: 'cannonry', mode: 1 }, T0).events)).toBe('locked');
  });

  it('no glory → "glory"; at the cap → "max"', () => {
    expect(rejected(applyAction(rich(1e30, 0), { type: 'buySich', id: 'walls', mode: 1 }, T0).events)).toBe('glory');
    const s = rich(0, 1e30);
    const top: GameState = {
      ...s,
      village: { ...s.village, sichLevels: { ...s.village.sichLevels, walls: SICH.levelMax } },
    };
    expect(rejected(applyAction(top, { type: 'buySich', id: 'walls', mode: 1 }, T0).events)).toBe('max');
  });
});

describe('hiring (M1-10)', () => {
  it('hires within the food limit and pays; above it is refused with "kharch"', () => {
    const s = rich(1e9, 0, { field: 50 });
    const ok = applyAction(s, { type: 'hire', n: 2 }, T0);
    expect(ok.state.army.infantry).toBe(2);
    expect(ok.state.currencies.ducats.lt(1e9)).toBe(true);
    expect(types(ok.events)).toEqual(['CossackHired']);
    const over = applyAction(s, { type: 'hire', n: 1000 }, T0);
    expect(over.state).toEqual(s);
    expect(rejected(over.events)).toBe('kharch');
  });
});

describe('tapping (M1-10)', () => {
  it('a tap gives max(scale × minScaleMult, income × incomeShare)', () => {
    const fresh = rich(0);
    const r = applyAction(fresh, { type: 'tap' }, T0);
    expect(r.state.currencies.ducats.toNumber()).toBe(KHORTYTSIA.scale * TAP.minScaleMult);
    expect(r.events).toContainEqual({ type: 'Tapped', amount: r.state.currencies.ducats });
    const busy = rich(0, 0, { field: 50, garden: 40, apiary: 30 });
    const income = farmIncomeRate(busy, collectModifiers(busy, T0)).toNumber();
    const t = applyAction(busy, { type: 'tap' }, T0);
    expect(t.state.currencies.ducats.toNumber()).toBeCloseTo(income * TAP.incomeShare, 6);
    expect(t.state.stats.taps).toBe(1);
  });

  it('more than tapMaxPerSec taps in one second are ignored, silently (Q8); the next second counts again', () => {
    let s = rich(0);
    for (let i = 0; i < TAP.maxPerSec + 5; i++) s = applyAction(s, { type: 'tap' }, T0).state;
    expect(s.stats.taps).toBe(TAP.maxPerSec);
    const extra = applyAction(s, { type: 'tap' }, T0 + 500);
    expect(extra.state.stats.taps).toBe(TAP.maxPerSec);
    expect(extra.events.filter((e) => e.type === 'Tapped' || e.type === 'ActionRejected')).toEqual([]);
    expect(applyAction(s, { type: 'tap' }, T0 + 1000).state.stats.taps).toBe(TAP.maxPerSec + 1);
  });

  it('a clock stepping back does not open new tap seconds: taps behind lastSeen count in its second (M2-22 review)', () => {
    let s = rich(0);
    for (let i = 0; i < TAP.maxPerSec; i++) s = applyAction(s, { type: 'tap' }, T0 + 10).state;
    // Each step back by 1 ms used to start a fresh second (now < tapWindow.start) with 10 more taps.
    for (let back = 1; back <= 50; back++) s = applyAction(s, { type: 'tap' }, T0 + 10 - back * 100).state;
    expect(s.stats.taps).toBe(TAP.maxPerSec);
    expect(s.stats.tapIncomeSec).toBeCloseTo(TAP.maxPerSec * TAP.incomeShare, 9);
    expect(s.time.lastSeen).toBe(T0 + 10);
    // Once the clock passes that second again, taps count as usual.
    expect(applyAction(s, { type: 'tap' }, T0 + 1010).state.stats.taps).toBe(TAP.maxPerSec + 1);
  });
});

describe('claimReturn and settings (M1-10)', () => {
  it('claimReturn credits the report once and clears it; without a report it is refused', () => {
    const s: GameState = {
      ...rich(100),
      returnReport: {
        awaySec: 3600,
        countedSec: 3600,
        capped: false,
        reason: 'normal',
        ducats: Big.from(500),
        glory: Big.from(7),
      },
    };
    const r = applyAction(s, { type: 'claimReturn' }, T0);
    expect(r.state.currencies.ducats.toNumber()).toBe(600);
    expect(r.state.currencies.glory.toNumber()).toBe(7);
    expect(r.state.village.lifetimeDucats.toNumber()).toBe(500);
    expect(r.state.returnReport).toBeNull();
    expect(types(r.events)).toEqual(['ReturnClaimed']);
    expect(rejected(applyAction(r.state, { type: 'claimReturn' }, T0).events)).toBe('noReport');
  });

  it('setSettings changes the language / number format', () => {
    const r = applyAction(rich(0), { type: 'setSettings', lang: 'en', numberFormat: 'short' }, T0);
    expect(r.state.settings).toEqual({ lang: 'en', numberFormat: 'short' });
  });
});

describe('every action advances time first (M1-10)', () => {
  it('income up to now is earned before the action applies', () => {
    const s = rich(0, 0, { field: 50 });
    const r = applyAction(s, { type: 'setSettings', lang: 'en' }, T0 + 60_000);
    expect(r.state.time.lastSeen).toBe(T0 + 60_000);
    expect(r.state.currencies.ducats.gt(0)).toBe(true);
  });

  it('every resulting state passes the save gate', () => {
    let s = rich(1e7, 1e5, { field: 30 });
    const actions = [
      { type: 'buyBuilding', id: 'garden', mode: 'max' },
      { type: 'buySich', id: 'kurins', mode: 10 },
      { type: 'hire', n: 1 },
      { type: 'tap' },
      { type: 'setSettings', numberFormat: 'short' },
    ] as const;
    let t = T0;
    for (const a of actions) {
      t += 1000;
      s = applyAction(s, a, t).state;
      expect(validateState(JSON.parse(JSON.stringify(s))).ok, a.type).toBe(true);
    }
  });
});
