// Story beats, rewards and the new stats (plan M2-22, SPEC §2.5, §3.10).
import { describe, expect, it } from 'vitest';
import { FARM, TAP } from '../../../src/content/economy.ts';
import { REWARD, type Reward } from '../../../src/content/rewards.ts';
import { STORY_BEATS, type StoryBeatId } from '../../../src/content/story.ts';
import { FARM_BUILDING_IDS, KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { collectModifiers, farmIncomeRate } from '../../../src/core/modifiers.ts';
import { tick } from '../../../src/core/offline.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { gloryRate } from '../../../src/core/systems/army.ts';
import { grantReward, rewardAmount, rewardRates, type Granted } from '../../../src/core/systems/reward.ts';
import { windAt } from '../../../src/core/systems/village-mechanics/wind.ts';

const T0 = 1_763_400_000_000;
const SEC = 1000;
const HOUR = 3600 * SEC;

/** A game with money for anything and food for many Cossacks; no beat seen yet. */
function wealthy(seed = 5): GameState {
  const s = createInitialState({ seed, now: T0 });
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(1e30), glory: Big.from(1e30) },
    village: {
      ...s.village,
      levels: { field: 30, garden: 30, apiary: 30, windmill: 30, potter: 20, smithy: 10, tavern: 5, fair: 1 },
    },
  };
}

/** A mid game whose beats (all but the start) are due but not fired: what an online or offline step must fire. */
function pending(seed = 9): GameState {
  const s = wealthy(seed);
  const levels = Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, 25])) as GameState['village']['levels'];
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(5000), glory: Big.from(300) },
    army: { infantry: 12 },
    stats: { ...s.stats, hires: 12 },
    village: { ...s.village, levels, sichLevels: { ...s.village.sichLevels, maidan: 10, church: 1, kurins: 4 } },
  };
}

/** Relative difference (testing.md: Big values with a relative tolerance). */
const rel = (a: Big, b: Big): number => (b.isZero() ? (a.isZero() ? 0 : 1) : Math.abs(a.sub(b).div(b).toNumber()));
const TOL = 1e-9;

type Reached = Extract<GameEvent, { type: 'StoryBeatReached' }>;
const reached = (events: readonly GameEvent[]): Reached[] =>
  events.filter((e): e is Reached => e.type === 'StoryBeatReached');
const plainGrant = (g: Granted | null): unknown =>
  g === null ? null : { currency: g.currency, amount: typeof g.amount === 'number' ? g.amount : g.amount.toString() };
const summary = (events: readonly GameEvent[]): unknown[] =>
  reached(events).map((e) => ({ id: e.id, granted: plainGrant(e.granted) }));

describe('story beats fire once (M2-22, SPEC §2.5)', () => {
  it('the start beat fires on the first step of a new game, and never again', () => {
    const s = createInitialState({ seed: 1, now: T0 });
    const a = advance(s, T0 + 100);
    expect(summary(a.events)).toEqual([{ id: 'khortytsia.shore', granted: null }]);
    expect(a.state.story.seen).toEqual(['khortytsia.shore']);
    const b = advance(a.state, T0 + HOUR);
    expect(reached(b.events)).toEqual([]);
    expect(b.state.story.seen).toEqual(['khortytsia.shore']);
  });

  it('a whole land played through actions: every beat fires exactly once, in the turn its trigger first holds', () => {
    let s = wealthy();
    let now = T0;
    const all: GameEvent[] = [];
    const firedBy: Partial<Record<StoryBeatId, string>> = {};
    const act = (action: Action, label: string): void => {
      now += SEC;
      const r = applyAction(s, action, now);
      for (const e of reached(r.events)) firedBy[e.id] = label;
      all.push(...r.events);
      s = r.state;
    };
    act({ type: 'tap' }, 'tap');
    for (let i = 1; i <= 5; i++) act({ type: 'hire', n: 1 }, `hire ${String(i)}`);
    for (let i = 1; i <= 12; i++) act({ type: 'buySich', id: 'maidan', mode: 1 }, `maidan ${String(i)}`);
    for (const id of FARM_BUILDING_IDS) act({ type: 'buyBuilding', id, mode: 25 }, `farm ${id}`);
    for (let i = 1; i <= 3; i++) act({ type: 'buySich', id: 'church', mode: 1 }, `church ${String(i)}`);
    now += 8 * HOUR;
    all.push(...tick(s, now).events);

    const counts = new Map<string, number>();
    for (const e of reached(all)) counts.set(e.id, (counts.get(e.id) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual(Object.fromEntries(STORY_BEATS.map((b) => [b.id, 1])));
    expect(firedBy).toEqual({
      'khortytsia.shore': 'tap',
      'khortytsia.messenger': 'hire 3',
      'khortytsia.council': 'maidan 10',
      'khortytsia.pokrova': 'church 1',
    });
    expect(s.story.seen).toEqual(STORY_BEATS.map((b) => b.id));
  });

  it('a beat reward is credited at once: glory beats add their glory to the currency', () => {
    const s = pending();
    const r = advance(s, T0 + SEC);
    const granted = reached(r.events).map((e) => e.granted);
    let glory = Big.ZERO;
    for (const g of granted) if (g?.currency === 'glory') glory = glory.add(g.amount);
    expect(glory.gt(0)).toBe(true);
    const income = gloryRate(s, collectModifiers(s, T0)).mul(1);
    expect(rel(r.state.currencies.glory, s.currencies.glory.add(income).add(glory))).toBeLessThan(TOL);
  });
});

describe('online step by step = offline in one step (M2-22 AC)', () => {
  const end = T0 + 8 * HOUR;

  it('advance: 5 s steps and one 8 h advance fire the same beats with the same rewards and the same lastSeen', () => {
    const s = pending();
    const offline = advance(s, end);
    let online = s;
    const events: GameEvent[] = [];
    for (let t = T0 + 5 * SEC; t <= end; t += 5 * SEC) {
      const r = advance(online, t);
      events.push(...r.events);
      online = r.state;
    }
    expect(summary(offline.events).length).toBe(STORY_BEATS.length);
    expect(summary(events)).toEqual(summary(offline.events));
    expect(online.story.seen).toEqual(offline.state.story.seen);
    expect(online.time.lastSeen).toBe(offline.state.time.lastSeen);
    expect(online.time.lastSeen).toBe(end);
    // And the same purse: income + glory + the beat rewards, whichever way the 8 h went.
    expect(rel(online.currencies.ducats, offline.state.currencies.ducats)).toBeLessThan(TOL);
    expect(rel(online.currencies.glory, offline.state.currencies.glory)).toBeLessThan(TOL);
    expect(rel(online.village.lifetimeDucats, offline.state.village.lifetimeDucats)).toBeLessThan(TOL);
  });

  it('tick: 1 s ticks and one return after 8 h (applyOffline) fire the same beats with the same rewards', () => {
    const s = pending(13);
    const back = tick(s, end);
    expect(back.state.returnReport).not.toBeNull();
    let online = s;
    const events: GameEvent[] = [];
    for (let t = T0 + SEC; t <= end; t += SEC) {
      const r = tick(online, t);
      events.push(...r.events);
      online = r.state;
    }
    expect(summary(back.events)).toEqual(summary(events));
    expect(back.state.story.seen).toEqual(online.story.seen);
    expect(back.state.time.lastSeen).toBe(online.time.lastSeen);
    // The beat rewards are not held back in the return report: they are in the currency already.
    let glory = Big.ZERO;
    for (const e of reached(back.events)) if (e.granted?.currency === 'glory') glory = glory.add(e.granted.amount);
    expect(rel(back.state.currencies.glory, s.currencies.glory.add(glory))).toBeLessThan(TOL);
  });
});

describe('rewards in minutes (M2-22 AC, SPEC §3.10)', () => {
  const income: Reward = { kind: 'incomeMinutes', minutes: 10 };
  const glory: Reward = { kind: 'gloryMinutes', minutes: 4 };
  const amount = (g: Granted): number => (typeof g.amount === 'number' ? g.amount : g.amount.toNumber());

  it('N minutes = N × 60 s of the rate, whatever the scale: ×1000 scale and rates give exactly ×1000', () => {
    const rates = { income: Big.from(3), glory: Big.from(0.5) };
    const big = { income: Big.from(3000), glory: Big.from(500) };
    const land1 = { scale: 1, gloryScale: 1 };
    const land5 = { scale: 1000, gloryScale: 1000 };
    expect(rewardAmount(income, rates, land1)).toMatchObject({ currency: 'ducats' });
    expect(amount(rewardAmount(income, rates, land1))).toBeCloseTo(10 * 60 * 3, 9);
    expect(amount(rewardAmount(glory, rates, land1))).toBeCloseTo(4 * 60 * 0.5, 9);
    expect(amount(rewardAmount(income, big, land5)) / amount(rewardAmount(income, rates, land1))).toBeCloseTo(1000, 9);
    expect(amount(rewardAmount(glory, big, land5)) / amount(rewardAmount(glory, rates, land1))).toBeCloseTo(1000, 9);
  });

  it('with a rate near zero the floor holds, and it scales with the land too', () => {
    const zero = { income: Big.ZERO, glory: Big.ZERO };
    expect(amount(rewardAmount(income, zero, { scale: 1, gloryScale: 1 }))).toBe(10 * REWARD.minPerMinute.ducats);
    expect(amount(rewardAmount(income, zero, { scale: 1000, gloryScale: 7 }))).toBe(
      10 * REWARD.minPerMinute.ducats * 1000,
    );
    expect(amount(rewardAmount(glory, zero, { scale: 1000, gloryScale: 7 }))).toBe(4 * REWARD.minPerMinute.glory * 7);
  });

  it('pysanky are a plain count', () => {
    expect(rewardAmount({ kind: 'pysanky', n: 3 }, rewardRates(wealthy()), KHORTYTSIA)).toEqual({
      currency: 'pysanky',
      amount: 3,
    });
    const g = grantReward(wealthy(), { kind: 'pysanky', n: 3 });
    expect(g.state.currencies.pysanky).toBe(3);
  });

  it('the rates are the steady ones: the glory rate, and the income at a breeze (the wind of the moment does not count)', () => {
    const s = wealthy();
    let breeze = T0;
    while (windAt(s.seed, breeze) !== 'breeze') breeze += 60 * SEC;
    const r = rewardRates(s);
    expect(rel(r.income, farmIncomeRate(s, collectModifiers(s, breeze)))).toBeLessThan(TOL);
    expect(rel(r.glory, gloryRate(s, collectModifiers(s, breeze)))).toBeLessThan(TOL);
    // In a storm the windmill earns ×3 — the reward rate does not follow it: the same rates as at the breeze.
    let storm = T0;
    while (windAt(s.seed, storm) !== 'storm') storm += 60 * SEC;
    expect(rel(r.income, farmIncomeRate(s, collectModifiers(s, storm)))).toBeGreaterThan(0.01);
    expect(rel(r.glory, gloryRate(s, collectModifiers(s, storm)))).toBeLessThan(TOL);
    expect(rewardRates(s)).toEqual(r);
  });

  it('granting income adds the ducats to the currency and to the land lifetime', () => {
    const w = wealthy();
    const s = { ...w, currencies: { ...w.currencies, ducats: Big.from(100) } };
    const g = grantReward(s, income);
    expect(g.granted.currency).toBe('ducats');
    const got = amount(g.granted);
    expect(got).toBeCloseTo(rewardRates(s).income.toNumber() * 600, 6);
    expect(g.state.currencies.ducats.sub(s.currencies.ducats).toNumber()).toBeCloseTo(got, 0);
    expect(g.state.village.lifetimeDucats.toNumber()).toBeCloseTo(got, 6);
  });
});

describe('refusals do not change with the story (M2-22 AC)', () => {
  it('a refused action at lastSeen leaves the very same state and only ActionRejected, though beats are due', () => {
    const s = { ...pending(), currencies: { ...pending().currencies, ducats: Big.ZERO, glory: Big.ZERO } };
    for (const action of [
      { type: 'buyBuilding', id: 'field', mode: 1 },
      { type: 'buySich', id: 'walls', mode: 1 },
      { type: 'hire', n: 1 },
      { type: 'claimReturn' },
    ] as const) {
      const r = applyAction(s, action, T0);
      expect(r.state).toBe(s);
      expect(r.events.map((e) => e.type)).toEqual(['ActionRejected']);
    }
  });
});

describe('stats (M2-22, SPEC §3.10)', () => {
  it('levelsBought counts farm and Sich levels, hires counts Cossacks, tapIncomeSec the taps’ income share', () => {
    let s = wealthy();
    s = applyAction(s, { type: 'buyBuilding', id: 'field', mode: 10 }, T0 + SEC).state;
    s = applyAction(s, { type: 'buySich', id: 'walls', mode: 25 }, T0 + 2 * SEC).state;
    s = applyAction(s, { type: 'hire', n: 2 }, T0 + 3 * SEC).state;
    s = applyAction(s, { type: 'hire', n: 1 }, T0 + 4 * SEC).state;
    s = applyAction(s, { type: 'tap' }, T0 + 5 * SEC).state;
    s = applyAction(s, { type: 'tap' }, T0 + 5 * SEC + 1).state;
    expect(s.stats).toEqual({
      taps: 2,
      purchases: 2,
      levelsBought: 35,
      hires: 3,
      tapIncomeSec: 2 * TAP.incomeShare,
      // No raid action ran (v4 counters, M3-04).
      raidsSent: 0,
      raidsDone: 0,
      raidsWon: 0,
    });
  });

  it('a buy capped by the level maximum counts only the levels bought', () => {
    const w = wealthy();
    const s = { ...w, village: { ...w.village, levels: { ...w.village.levels, fair: FARM.levelMax - 3 } } };
    expect(applyAction(s, { type: 'buyBuilding', id: 'fair', mode: 25 }, T0 + SEC).state.stats.levelsBought).toBe(3);
  });

  it('refused actions and over-cap taps count nothing', () => {
    const w = wealthy();
    const poor = { ...w, currencies: { ...w.currencies, ducats: Big.ZERO, glory: Big.ZERO } };
    let s = poor;
    for (const action of [
      { type: 'buyBuilding', id: 'field', mode: 1 },
      { type: 'buySich', id: 'walls', mode: 1 },
      { type: 'hire', n: 1 },
    ] as const)
      s = applyAction(s, action, T0).state;
    expect(s.stats).toEqual(poor.stats);
    for (let i = 0; i < TAP.maxPerSec + 3; i++) s = applyAction(s, { type: 'tap' }, T0 + 10).state;
    expect(s.stats.tapIncomeSec).toBeCloseTo(TAP.maxPerSec * TAP.incomeShare, 9);
  });
});
