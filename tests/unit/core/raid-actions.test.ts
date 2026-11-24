// Raid actions (plan M3-05, SPEC §3.4, ADR 012): startRaid / claimRaid / claimAllRaids — the roll comes from the state
// advanced to `now` and is stored as rolled; the claim grants exactly what was rolled (shown = granted); refusals leave
// the state as it is and say why; the start time is the effective time (never a raw clock behind the game's time).
import { describe, expect, it } from 'vitest';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { RELIC_IDS } from '../../../src/content/relics.ts';
import type { RaidTierId } from '../../../src/content/raids.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { createRng } from '../../../src/core/rng.ts';
import { createInitialState, validateState, type GameState } from '../../../src/core/state.ts';
import { chainSteps, questDay } from '../../../src/core/systems/quests.ts';
import { previewRaid, raidBoard, rollRaid, type RaidRoll, type RaidSlot } from '../../../src/core/systems/raids.ts';

const T0 = 1_763_400_000_000; // 2025-11-17 17:20 UTC
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IDLE: RaidSlot = { kind: 'idle' };

/** A land-1 game with an army that can send any tier, every story beat seen (beats are story.test's business). */
function game(o: { infantry?: number; rngSeed?: number; slots?: readonly RaidSlot[]; at?: number } = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  const at = o.at ?? T0;
  return {
    ...s,
    rng: createRng(o.rngSeed ?? 3),
    time: { lastSeen: at, maxSeen: at, created: T0 },
    story: { seen: [...STORY_BEAT_IDS] },
    village: { ...s.village, levels: { ...s.village.levels, field: 30, garden: 12, windmill: 8 } },
    army: { infantry: o.infantry ?? 2000 },
    stats: { ...s.stats, hires: o.infantry ?? 2000 },
    raids: { slots: o.slots ?? [IDLE, IDLE, IDLE], rumorDay: -1, pity: 0 },
  };
}

const start = (slot: number, tier: RaidTierId): Action => ({ type: 'startRaid', slot, tier });
const claim = (slot: number): Action => ({ type: 'claimRaid', slot });
const of = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const rejected = (events: readonly GameEvent[]): string | undefined => of(events, 'ActionRejected')[0]?.reason;
const gate = (s: GameState): string => {
  const r = validateState(JSON.parse(JSON.stringify(s)));
  return r.ok ? 'ok' : `${r.error.reason} at ${r.error.path}`;
};
const rollIn = (s: GameState, slot: number): RaidRoll => {
  const x = s.raids.slots[slot];
  if (!x || x.kind === 'idle') throw new Error(`slot ${String(slot)} is idle`);
  return x.raid;
};
/** Sends `tier` into `slot` and lets it come back (advance past returnAt). */
function sentAndBack(s: GameState, slot: number, tier: RaidTierId, now = s.time.lastSeen): GameState {
  const sent = applyAction(s, start(slot, tier), now).state;
  return advance(sent, rollIn(sent, slot).returnAt).state;
}

/** A game on a day after which the h4 offer moves to another region; throws if none within 30 days. */
function dayWithH4Change(): GameState {
  const h4 = (day: number) => raidBoard(5, day).find((o) => o.tier === 'h4')?.region;
  for (let i = 0; i < 30; i++) {
    const g = game({ at: T0 + i * DAY });
    const d = questDay(g);
    if (h4(d) !== h4(d + 1)) return g;
  }
  throw new Error('the h4 region never changes between two days in 30 days');
}

describe('startRaid (M3-05)', () => {
  it('stores what rollRaid rolls on the state advanced to now: the roll, the RNG, pity, rumorDay; raidsSent + 1', () => {
    const s = game();
    const now = T0 + 10 * MIN;
    const want = rollRaid(advance(s, now).state, 'h1', now);
    const r = applyAction(s, start(1, 'h1'), now);
    expect(r.state.raids.slots).toEqual([IDLE, { kind: 'running', raid: want.roll }, IDLE]);
    expect(r.state.rng).toEqual(want.rng);
    expect(r.state.raids.pity).toBe(want.pity);
    expect(r.state.raids.rumorDay).toBe(want.rumorDay);
    expect(r.state.stats.raidsSent).toBe(1);
    expect(want.roll.startedAt).toBe(now);
    expect(of(r.events, 'RaidStarted')).toEqual([
      { type: 'RaidStarted', slot: 1, region: want.roll.region, tier: 'h1', returnAt: want.roll.returnAt },
    ]);
    expect(gate(r.state)).toBe('ok');
  });

  it('the income up to the click is earned first, then the roll (its loot is at the advanced levels and time)', () => {
    const s = game();
    const now = T0 + 2 * HOUR;
    const r = applyAction(s, start(0, 'm5'), now);
    expect(r.state.currencies.ducats.gt(s.currencies.ducats)).toBe(true);
    expect(rollIn(r.state, 0).startedAt).toBe(now);
  });

  it('the board day comes from the time after advance: a start past midnight takes the new day’s region', () => {
    const before = dayWithH4Change();
    const dayNow = questDay(before);
    const nextDayAt = before.time.lastSeen + DAY;
    const r = applyAction(before, start(0, 'h4'), nextDayAt);
    const want = raidBoard(5, dayNow + 1).find((o) => o.tier === 'h4')?.region;
    expect(rollIn(r.state, 0).region).toBe(want);
    expect(rollIn(r.state, 0).region).not.toBe(raidBoard(5, dayNow).find((o) => o.tier === 'h4')?.region);
  });

  it('the card shown before the start is what the slot will grant (honest preview, §0.1 П3)', () => {
    for (let rngSeed = 1; rngSeed <= 12; rngSeed++) {
      const s = game({ rngSeed });
      const card = previewRaid(s, 'h4');
      const raid = rollIn(applyAction(s, start(0, 'h4'), T0).state, 0);
      const shown = raid.success ? card.success : card.failure;
      expect(raid.loot.ducats.eq(shown.ducats)).toBe(true);
      expect(raid.loot.glory.eq(shown.glory)).toBe(true);
      expect(raid.region).toBe(card.region);
    }
  });

  it('two starts on the same day use the rumour once (rumorDay), and the RNG moves on between them', () => {
    const s = game();
    const day = questDay(s);
    const tier = raidBoard(5, day).find((o) => o.rumor !== null)?.tier;
    if (!tier) throw new Error('no rumour');
    const first = applyAction(s, start(0, tier), T0).state;
    const second = applyAction(first, start(1, tier), T0).state;
    expect(rollIn(first, 0).rumor).toBe(true);
    expect(first.raids.rumorDay).toBe(day);
    expect(rollIn(second, 1).rumor).toBe(false);
    expect(second.rng).not.toEqual(first.rng);
    expect(second.stats.raidsSent).toBe(2);
  });

  it.each([
    ['a slot below 0', -1, 'm5', 'range'],
    ['a closed slot (past RAIDS.slots)', 2, 'm5', 'range'],
    ['a fractional slot', 0.5, 'm5', 'range'],
    ['an unknown tier', 0, 'd1' as RaidTierId, 'range'],
  ] as const)(
    'refuses %s: the state advanced to now (here = the input) + ActionRejected(%s)',
    (_, slot, tier, reason) => {
      const s = game();
      const r = applyAction(s, start(slot, tier), T0);
      expect(r.state).toBe(s);
      expect(r.events).toEqual([{ type: 'ActionRejected', action: 'startRaid', reason }]);
    },
  );

  it('refusal contract: the result is exactly advance(s, now).state — slots and RNG as they were, nothing else', () => {
    const busy = applyAction(game(), start(0, 'h8'), T0).state;
    const later = T0 + 20 * MIN;
    const advanced = advance(busy, later).state;
    const refusals: [Action, string][] = [
      [start(0, 'm5'), 'slotBusy'],
      [start(1, 'd1' as RaidTierId), 'range'],
      [claim(0), 'notReturned'],
      [claim(1), 'notReturned'],
      [{ type: 'claimAllRaids' }, 'notReturned'],
    ];
    for (const [action, reason] of refusals) {
      const r = applyAction(busy, action, later);
      expect(r.state, action.type).toEqual(advanced);
      expect(r.state.rng, action.type).toEqual(busy.rng);
      expect(r.state.raids, action.type).toEqual(busy.raids);
      expect(r.events.at(-1), action.type).toEqual({ type: 'ActionRejected', action: action.type, reason });
      expect(r.events.slice(0, -1), action.type).toEqual(advance(busy, later).events);
    }
    const weak = game({ infantry: 1 });
    const r = applyAction(weak, start(0, 'h8'), later);
    expect(r.state).toEqual(advance(weak, later).state);
    expect(rejected(r.events)).toBe('power');
  });

  it('refuses a busy slot (running or returned) and a weak army, with the state unchanged', () => {
    const busy = applyAction(game(), start(0, 'm5'), T0).state;
    const r1 = applyAction(busy, start(0, 'm5'), T0);
    expect(r1.state).toBe(busy);
    expect(rejected(r1.events)).toBe('slotBusy');
    const back = advance(busy, T0 + HOUR).state;
    expect(rejected(applyAction(back, start(0, 'm5'), T0 + HOUR).events)).toBe('slotBusy');
    const weak = game({ infantry: 1 });
    const r2 = applyAction(weak, start(0, 'h8'), T0);
    expect(r2.state).toBe(weak);
    expect(r2.events).toEqual([{ type: 'ActionRejected', action: 'startRaid', reason: 'power' }]);
  });

  it('clock set back: the raid starts at the effective time (lastSeen), and the save gate accepts the state', () => {
    // created = lastSeen: a raw `now` before it would be below `created` and the gate would refuse its own save.
    const s = { ...game({ at: T0 + HOUR }), time: { lastSeen: T0 + HOUR, maxSeen: T0 + 2 * HOUR, created: T0 + HOUR } };
    const r = applyAction(s, start(0, 'h1'), T0 - DAY);
    const raid = rollIn(r.state, 0);
    expect(raid.startedAt).toBe(T0 + HOUR);
    expect(raid.startedAt).toBeGreaterThanOrEqual(r.state.time.created);
    expect(raid.startedAt).toBeLessThanOrEqual(r.state.time.maxSeen);
    expect(r.state.time.lastSeen).toBe(T0 + HOUR);
    expect(gate(r.state)).toBe('ok');
  });

  it('completes the chain step «Відправ похід» (raid1) in the same turn', () => {
    const s = game();
    const index = chainSteps(s).findIndex((x) => x.id === 'khortytsia.raid1');
    const atStep: GameState = { ...s, quests: { ...s.quests, chain: { kind: 'listed', index, base: 0 } } };
    const r = applyAction(atStep, start(0, 'm5'), T0);
    expect(of(r.events, 'QuestCompleted')).toContainEqual({
      type: 'QuestCompleted',
      kind: 'chain',
      id: 'khortytsia.raid1',
    });
  });
});

describe('claimRaid (M3-05)', () => {
  /** A returned raid of `tier` whose roll was a success (or not), searched over RNG seeds. */
  function returnedWith(tier: RaidTierId, pick: (r: RaidRoll) => boolean, infantry = 2000): GameState {
    for (let rngSeed = 1; rngSeed < 400; rngSeed++) {
      const back = sentAndBack(game({ rngSeed, infantry }), 0, tier);
      if (pick(rollIn(back, 0))) return back;
    }
    throw new Error('no such roll');
  }

  it('grants the loot exactly as rolled, adds the relic, counts the raid done and won, frees the slot', () => {
    const back = returnedWith('h8', (r) => r.success && r.loot.relic !== null && r.loot.pysanky > 0);
    const raid = rollIn(back, 0);
    const now = back.time.lastSeen;
    const r = applyAction(back, claim(0), now);
    const c = r.state.currencies;
    expect(c.ducats.eq(back.currencies.ducats.add(raid.loot.ducats))).toBe(true);
    expect(c.glory.eq(back.currencies.glory.add(raid.loot.glory))).toBe(true);
    expect(c.pysanky).toBe(back.currencies.pysanky + raid.loot.pysanky);
    expect(r.state.village.lifetimeDucats.eq(back.village.lifetimeDucats.add(raid.loot.ducats))).toBe(true);
    expect(r.state.relics).toEqual([raid.loot.relic]);
    expect(r.state.stats).toMatchObject({ raidsSent: 1, raidsDone: 1, raidsWon: 1 });
    expect(r.state.raids.slots[0]).toEqual(IDLE);
    expect(of(r.events, 'RaidClaimed')).toEqual([
      {
        type: 'RaidClaimed',
        slot: 0,
        success: true,
        granted: { ducats: raid.loot.ducats, glory: raid.loot.glory, pysanky: raid.loot.pysanky },
        relic: raid.loot.relic,
      },
    ]);
    expect(of(r.events, 'RelicFound')).toEqual([{ type: 'RelicFound', id: raid.loot.relic }]);
    expect(gate(r.state)).toBe('ok');
  });

  it('a failed raid grants its share, counts done but not won, and finds no relic', () => {
    // 600 against P 900: a chance below 1.
    const back = returnedWith('h8', (r) => !r.success, 600);
    const raid = rollIn(back, 0);
    const r = applyAction(back, claim(0), back.time.lastSeen);
    expect(raid.loot.ducats.gt(0)).toBe(true);
    expect(r.state.currencies.ducats.eq(back.currencies.ducats.add(raid.loot.ducats))).toBe(true);
    expect(r.state.stats).toMatchObject({ raidsDone: 1, raidsWon: 0 });
    expect(r.state.relics).toEqual([]);
    expect(of(r.events, 'RelicFound')).toEqual([]);
    expect(of(r.events, 'RaidClaimed')[0]).toMatchObject({ slot: 0, success: false, relic: null });
  });

  it('a raid claimed 30 days after it came back gives the same loot (it never spoils, Q9)', () => {
    const back = returnedWith('h4', (r) => r.success);
    const raid = rollIn(back, 0);
    const later = advance(back, back.time.lastSeen + 30 * DAY).state;
    expect(later.raids.slots[0]).toEqual({ kind: 'returned', raid });
    const now = later.time.lastSeen;
    const r = applyAction(later, claim(0), now);
    expect(r.state.currencies.ducats.eq(later.currencies.ducats.add(raid.loot.ducats))).toBe(true);
    expect(r.state.currencies.glory.eq(later.currencies.glory.add(raid.loot.glory))).toBe(true);
  });

  it('refuses an idle slot, a running one and a slot out of range, with the state unchanged', () => {
    const s = game();
    const r1 = applyAction(s, claim(0), T0);
    expect(r1.state).toBe(s);
    expect(r1.events).toEqual([{ type: 'ActionRejected', action: 'claimRaid', reason: 'notReturned' }]);
    const running = applyAction(s, start(0, 'h1'), T0).state;
    const r2 = applyAction(running, claim(0), T0 + MIN);
    expect(r2.state.raids).toBe(running.raids);
    expect(rejected(r2.events)).toBe('notReturned');
    for (const slot of [-1, 3, 1.5]) expect(rejected(applyAction(s, claim(slot), T0).events)).toBe('range');
  });

  it('claimAllRaids claims every returned slot in slot order and leaves the running one', () => {
    let s = applyAction(game(), start(0, 'm5'), T0).state;
    s = applyAction(s, start(1, 'm30'), T0).state;
    s = advance(s, T0 + 31 * MIN).state;
    const a = rollIn(s, 0);
    const b = rollIn(s, 1);
    const r = applyAction(s, { type: 'claimAllRaids' }, T0 + 31 * MIN);
    expect(of(r.events, 'RaidClaimed').map((e) => e.slot)).toEqual([0, 1]);
    expect(r.state.currencies.ducats.eq(s.currencies.ducats.add(a.loot.ducats).add(b.loot.ducats))).toBe(true);
    expect(r.state.raids.slots).toEqual([IDLE, IDLE, IDLE]);
    expect(r.state.stats.raidsDone).toBe(2);

    let mixed = applyAction(game(), start(0, 'm5'), T0).state;
    mixed = applyAction(mixed, start(1, 'h1'), T0).state;
    mixed = advance(mixed, T0 + 10 * MIN).state;
    const m = applyAction(mixed, { type: 'claimAllRaids' }, T0 + 10 * MIN);
    expect(of(m.events, 'RaidClaimed').map((e) => e.slot)).toEqual([0]);
    expect(m.state.raids.slots[1]?.kind).toBe('running');
  });

  it('claimAllRaids with nothing returned is refused (notReturned), the state unchanged', () => {
    const s = game();
    const r = applyAction(s, { type: 'claimAllRaids' }, T0);
    expect(r.state).toBe(s);
    expect(r.events).toEqual([{ type: 'ActionRejected', action: 'claimAllRaids', reason: 'notReturned' }]);
  });

  it('every relic once: claims over many raids never give a duplicate', () => {
    let s = game({ rngSeed: 9 });
    for (let i = 0; i < 60 && s.relics.length < RELIC_IDS.length; i++) {
      s = sentAndBack(s, 0, 'h8');
      s = applyAction(s, claim(0), s.time.lastSeen).state;
    }
    expect(new Set(s.relics).size).toBe(s.relics.length);
    expect(s.relics.length).toBe(RELIC_IDS.length);
    expect(gate(s)).toBe('ok');
  });
});
