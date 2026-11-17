import { describe, expect, it } from 'vitest';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { createRng, next } from '../../../src/core/rng.ts';
import { collectModifiers, farmIncomeRate } from '../../../src/core/modifiers.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { stormStarts, windBreakpoints } from '../../../src/core/systems/village-mechanics/wind.ts';

type WindChanged = Extract<GameEvent, { type: 'WindChanged' }>;
const T0 = 1_763_400_000_000;
const HOUR = 3600 * 1000;
const relDiff = (a: Big, b: Big): number => {
  if (b.isZero()) return a.isZero() ? 0 : 1;
  return Math.abs(a.sub(b).div(b).toNumber());
};

/** A mid-game state: every farm building levelled, the windmill past the storm goal, some infantry and Sich. */
function midGame(seed: number, now = T0): GameState {
  const s = createInitialState({ seed, now });
  return {
    ...s,
    army: { infantry: 12 },
    village: {
      ...s.village,
      levels: { field: 40, garden: 35, apiary: 30, windmill: 27, potter: 20, smithy: 12, tavern: 8, fair: 2 },
      sichLevels: { ...s.village.sichLevels, walls: 6, kurins: 4, maidan: 3 },
    },
  };
}

describe('advance(state, now) (M1-09)', () => {
  it('now == lastSeen leaves the state unchanged and emits nothing', () => {
    const s = midGame(1);
    const r = advance(s, T0);
    expect(r.state).toEqual(s);
    expect(r.events).toEqual([]);
  });

  it('earns ducats and glory, moves lastSeen/maxSeen and lifetime ducats', () => {
    const s = midGame(2);
    const r = advance(s, T0 + HOUR);
    expect(r.state.currencies.ducats.gt(s.currencies.ducats)).toBe(true);
    expect(r.state.currencies.glory.gt(s.currencies.glory)).toBe(true);
    expect(r.state.time.lastSeen).toBe(T0 + HOUR);
    expect(r.state.time.maxSeen).toBe(T0 + HOUR);
    const earned = r.state.currencies.ducats.sub(s.currencies.ducats);
    expect(relDiff(r.state.village.lifetimeDucats, earned)).toBeLessThan(1e-12);
  });

  it('equivalence: 8 h in one call ≈ 288 000 ticks of 0.1 s (< 0.1 %, with the wind)', () => {
    const s = midGame(3);
    const end = T0 + 8 * HOUR;
    const once = advance(s, end).state;
    let ticked = s;
    for (let t = T0 + 100; t <= end; t += 100) ticked = advance(ticked, t).state;
    expect(ticked.time.lastSeen).toBe(end);
    expect(windBreakpoints(s.seed, T0, end).length).toBeGreaterThan(5); // the wind really changed meanwhile
    expect(relDiff(ticked.currencies.ducats, once.currencies.ducats)).toBeLessThan(1e-3);
    expect(relDiff(ticked.currencies.glory, once.currencies.glory)).toBeLessThan(1e-3);
    expect(ticked.village.mechanic.stormsSurvived).toBe(once.village.mechanic.stormsSurvived);
  });

  it('additivity: a → b → c equals a → c (50 seeded cases)', () => {
    let rng = createRng(2026);
    const draw = (): number => {
      const [v, r] = next(rng);
      rng = r;
      return v;
    };
    for (let i = 0; i < 50; i++) {
      const s = midGame(Math.floor(draw() * 2 ** 32));
      const c = T0 + Math.floor(draw() * 48 * HOUR);
      const b = T0 + Math.floor(draw() * (c - T0));
      const twoStep = advance(advance(s, b).state, c).state;
      const oneStep = advance(s, c).state;
      expect(relDiff(twoStep.currencies.ducats, oneStep.currencies.ducats)).toBeLessThan(1e-9);
      expect(relDiff(twoStep.currencies.glory, oneStep.currencies.glory)).toBeLessThan(1e-9);
      expect(twoStep.village.mechanic.stormsSurvived).toBe(oneStep.village.mechanic.stormsSurvived);
      expect(twoStep.time).toEqual(oneStep.time);
    }
  });

  it('emits WindChanged at every wind breakpoint, in order', () => {
    const s = midGame(4);
    const end = T0 + 12 * HOUR;
    const events = advance(s, end).events;
    const changes = events.filter((e): e is WindChanged => e.type === 'WindChanged');
    expect(changes).toHaveLength(events.length); // advance itself emits nothing else
    expect(changes.map((e) => e.at)).toEqual(windBreakpoints(s.seed, T0, end));
    for (const e of changes) expect(e.from).not.toBe(e.to);
  });

  it('counts storms toward Bloom only with the windmill at the goal level', () => {
    const end = T0 + 24 * HOUR;
    const withMill = midGame(5);
    const storms = stormStarts(withMill.seed, T0, end).length;
    expect(advance(withMill, end).state.village.mechanic.stormsSurvived).toBe(storms);
    const lowMill: GameState = {
      ...withMill,
      village: {
        ...withMill.village,
        levels: { ...withMill.village.levels, windmill: KHORTYTSIA.bloomGoal.windmillLevel - 1 },
      },
    };
    expect(advance(lowMill, end).state.village.mechanic.stormsSurvived).toBe(0);
  });

  it('a new game earns nothing (no buildings, no army) but still moves its clock', () => {
    const s = createInitialState({ seed: 6, now: T0 });
    const r = advance(s, T0 + HOUR);
    expect(r.state.currencies.ducats.eq(s.currencies.ducats)).toBe(true);
    expect(r.state.currencies.glory.isZero()).toBe(true);
    expect(r.state.time.lastSeen).toBe(T0 + HOUR);
  });

  it('never runs backwards: now < lastSeen leaves the state as it is (clock-back is handled by applyOffline)', () => {
    const s = midGame(7);
    expect(advance(s, T0 - HOUR).state).toEqual(s);
  });
});

describe('advance: review cases (M1-09)', () => {
  /** Only the windmill levelled: income swings with the wind (×0.5 / ×1 / ×3), so a wrong segment wind shows. */
  function millOnly(seed: number): GameState {
    const s = createInitialState({ seed, now: 0 });
    return { ...s, village: { ...s.village, levels: { ...s.village.levels, windmill: 30 } } };
  }
  const rateAt = (s: GameState, t: number): number => farmIncomeRate(s, collectModifiers(s, t)).toNumber();
  const at = (s: GameState, t: number): GameState => ({ ...s, time: { lastSeen: t, maxSeen: t, created: t } });

  it('rejects a non-finite now (Infinity would never end the wind scan, NaN would poison the save)', () => {
    const s = midGame(8);
    expect(advance(s, Number.POSITIVE_INFINITY).state).toBe(s);
    expect(advance(s, Number.NaN).state).toBe(s);
  });

  it('across a wind change each side earns at its own wind: the segment takes the wind at its start', () => {
    const base = millOnly(9);
    const b = windBreakpoints(base.seed, T0, T0 + 24 * HOUR).find((x) => rateAt(base, x - 1) !== rateAt(base, x));
    if (b === undefined) throw new Error('no wind change with a different windmill rate in 24 h');
    const SEC = 5;
    for (const from of [b - SEC * 1000, b, b - 600_000 + 1234]) {
      const s = at(base, from);
      const to = from + 2 * SEC * 1000;
      const earned = advance(s, to).state.currencies.ducats.sub(s.currencies.ducats).toNumber();
      // Integrate by hand at 1 ms resolution of the change point: before b at the old wind, from b at the new one.
      const before = Math.max(0, Math.min(to, b) - from) / 1000;
      const after = Math.max(0, to - Math.max(from, b)) / 1000;
      const expected = before * rateAt(s, b - 1) + after * rateAt(s, b);
      expect(Math.abs(earned - expected) / expected, `from = b${String(from - b)}`).toBeLessThan(1e-9);
    }
  });

  it('storm assertions are not vacuous: the seeds used do see storms', () => {
    expect(stormStarts(3, T0, T0 + 8 * HOUR).length).toBeGreaterThan(0);
    expect(advance(midGame(3), T0 + 8 * HOUR).state.village.mechanic.stormsSurvived).toBeGreaterThan(0);
    expect(stormStarts(5, T0, T0 + 24 * HOUR).length).toBeGreaterThan(0);
  });
});
