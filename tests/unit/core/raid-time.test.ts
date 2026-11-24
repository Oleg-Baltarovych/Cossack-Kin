// Raids and time (plan M3-05, AC M3 2, SPEC §3.8, ADR 012): `returnAt` is a breakpoint of `advance` (running →
// returned + RaidReturned, exactly once); 0.1-s ticks = one advance = applyOffline; applyOffline finishes raids to the
// real `now` (a forward jump too, Q8); a clock set back changes nothing; a day change leaves slots alone; time never
// claims (RaidClaimed / RelicFound only from an action).
import { describe, expect, it } from 'vitest';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { OFFLINE } from '../../../src/content/economy.ts';
import type { RaidTierId } from '../../../src/content/raids.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { applyOffline, resume, tick } from '../../../src/core/offline.ts';
import { createRng } from '../../../src/core/rng.ts';
import { createInitialState, validateState, type GameState } from '../../../src/core/state.ts';
import type { RaidRoll, RaidSlot } from '../../../src/core/systems/raids.ts';
import { windBreakpoints } from '../../../src/core/systems/village-mechanics/wind.ts';

const T0 = 1_763_400_000_000;
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IDLE: RaidSlot = { kind: 'idle' };

function game(rngSeed = 3): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    rng: createRng(rngSeed),
    story: { seen: [...STORY_BEAT_IDS] },
    village: { ...s.village, levels: { ...s.village.levels, field: 30, garden: 12, windmill: 8 } },
    army: { infantry: 2000 },
    stats: { ...s.stats, hires: 2000 },
  };
}
const of = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const rollIn = (s: GameState, slot: number): RaidRoll => {
  const x = s.raids.slots[slot];
  if (!x || x.kind === 'idle') throw new Error(`slot ${String(slot)} is idle`);
  return x.raid;
};
/** The test game with its clock at `at` (≥ T0). */
function gameAt(at: number): GameState {
  return { ...game(), time: { lastSeen: at, maxSeen: at, created: T0 } };
}
/** Two wind breakpoints of seed 5 after T0 more than `gapMs` apart. */
function windPair(gapMs: number): [number, number] {
  const cuts = windBreakpoints(5, T0, T0 + 7 * DAY);
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1];
    const b = cuts[i];
    if (a !== undefined && b !== undefined && a - T0 > HOUR && b - a > gapMs) return [a, b];
  }
  throw new Error('no wind breakpoints far enough apart in 7 days');
}
/** `tiers` sent into slots 0, 1, … at T0. */
function sending(...tiers: RaidTierId[]): GameState {
  return tiers.reduce((s, tier, slot) => applyAction(s, { type: 'startRaid', slot, tier }, T0).state, game());
}

describe('advance: returnAt is a breakpoint (M3-05)', () => {
  it('before returnAt the raid runs; at returnAt it is returned with RaidReturned { slot, region, success }', () => {
    const s = sending('m30');
    const raid = rollIn(s, 0);
    const early = advance(s, raid.returnAt - 1);
    expect(early.state.raids.slots[0]).toEqual({ kind: 'running', raid });
    expect(of(early.events, 'RaidReturned')).toEqual([]);
    const back = advance(early.state, raid.returnAt);
    expect(back.state.raids.slots[0]).toEqual({ kind: 'returned', raid });
    expect(of(back.events, 'RaidReturned')).toEqual([
      { type: 'RaidReturned', slot: 0, region: raid.region, success: raid.success },
    ]);
  });

  it('RaidReturned comes exactly once: later advances leave the returned slot and say nothing', () => {
    const back = advance(sending('m5'), T0 + 10 * MIN);
    const again = advance(back.state, T0 + 3 * HOUR);
    expect(of(back.events, 'RaidReturned')).toHaveLength(1);
    expect(of(again.events, 'RaidReturned')).toEqual([]);
    expect(again.state.raids.slots[0]).toEqual(back.state.raids.slots[0]);
  });

  it('the income integral is the same with a raid on the way (a raid changes no rate)', () => {
    const plain = advance(game(), T0 + 2 * HOUR).state;
    const s = sending('h1');
    const withRaid = advance(s, T0 + 2 * HOUR).state;
    expect(
      withRaid.currencies.ducats.sub(s.currencies.ducats).eq(plain.currencies.ducats.sub(game().currencies.ducats)),
    ).toBe(true);
  });

  it('a return strictly between two wind changes comes between their events: [Wind, RaidReturned, Wind]', () => {
    const [c1, c2] = windPair(10 * MIN);
    // A 5-min raid sent 1 min before c1 is back 4 min after it, before c2.
    const s = applyAction(gameAt(c1 - MIN), { type: 'startRaid', slot: 0, tier: 'm5' }, c1 - MIN).state;
    const r = advance(s, c2 + 1);
    expect(r.events.map((e) => e.type)).toEqual(['WindChanged', 'RaidReturned', 'WindChanged']);
    expect(r.events.map((e) => (e.type === 'WindChanged' ? e.at : null))).toEqual([c1, null, c2]);
  });

  it('a return at the very moment of a wind change comes after the wind event (tie: wind first)', () => {
    const [c1, c2] = windPair(10 * MIN);
    const s = applyAction(gameAt(c1 - 5 * MIN), { type: 'startRaid', slot: 0, tier: 'm5' }, c1 - 5 * MIN).state;
    expect(rollIn(s, 0).returnAt).toBe(c1);
    expect(advance(s, c2 - 1).events.map((e) => e.type)).toEqual(['WindChanged', 'RaidReturned']);
  });

  it('two raids back in one advance: events in return order (the 5-min one first, whatever its slot)', () => {
    let s = applyAction(game(), { type: 'startRaid', slot: 0, tier: 'm30' }, T0).state;
    s = applyAction(s, { type: 'startRaid', slot: 1, tier: 'm5' }, T0).state;
    const r = advance(s, T0 + HOUR);
    expect(of(r.events, 'RaidReturned').map((e) => e.slot)).toEqual([1, 0]);
  });
});

describe('online ticks = one advance = applyOffline (AC M3 2)', () => {
  it('0.1-s ticks over a 30-min raid, one advance and applyOffline give the same slot and the same RaidReturned', () => {
    const s = sending('m30', 'm5');
    const end = T0 + 31 * MIN;
    let stepped = s;
    const ticked: GameEvent[] = [];
    for (let t = T0 + 100; t <= end; t += 100) {
      const r = tick(stepped, t);
      stepped = r.state;
      ticked.push(...r.events);
    }
    const once = advance(s, end);
    const away = applyOffline(s, end);
    expect(stepped.raids).toEqual(once.state.raids);
    expect(away.state.raids).toEqual(once.state.raids);
    const returned = of(once.events, 'RaidReturned');
    expect(returned).toHaveLength(2);
    expect(of(ticked, 'RaidReturned')).toEqual(returned);
    expect(of(away.events, 'RaidReturned')).toEqual(returned);
  });

  it('resume after a load past returnAt returns the raid as well', () => {
    const s = sending('h1');
    const r = resume(s, T0 + 5 * HOUR);
    expect(r.state.raids.slots[0]?.kind).toBe('returned');
    expect(of(r.events, 'RaidReturned')).toHaveLength(1);
  });
});

describe('a loaded save with a running raid already due (M3-05)', () => {
  it('the gate accepts it; the next forward move returns it once, a clock behind leaves it running', () => {
    // The game never writes this (a start is at lastSeen; every forward move returns up to its end), but the gate does
    // not forbid it: returnRaids takes «returnAt ≤ now», so such a raid returns instead of hanging.
    const sent = sending('m5');
    const raw: unknown = JSON.parse(
      JSON.stringify({ ...sent, time: { ...sent.time, lastSeen: T0 + HOUR, maxSeen: T0 + HOUR } }),
    );
    const loaded = validateState(raw);
    if (!loaded.ok) throw new Error(`gate: ${loaded.error.reason} at ${loaded.error.path}`);
    const s = loaded.state;
    expect(s.raids.slots[0]?.kind).toBe('running');
    expect(advance(s, T0).state.raids).toEqual(s.raids);
    const r = resume(s, T0 + HOUR + SEC);
    expect(r.state.raids.slots[0]?.kind).toBe('returned');
    expect(of(r.events, 'RaidReturned')).toHaveLength(1);
  });
});

describe('applyOffline finishes raids to the real now (M3-05, §3.8)', () => {
  it('an 8-h raid returns within a 20-h absence; the income stays within the offline cap', () => {
    const s = sending('h8');
    const now = T0 + 20 * HOUR;
    const r = applyOffline(s, now);
    expect(r.state.raids.slots[0]?.kind).toBe('returned');
    expect(r.state.returnReport).toMatchObject({ countedSec: OFFLINE.capSec, capped: true });
  });

  it('a forward clock jump (past forwardJumpCapSec) finishes raids, income counts exactly the cap (Q8)', () => {
    const s = sending('h8', 'm5');
    const r = applyOffline(s, T0 + 30 * DAY);
    expect(r.state.raids.slots.map((x) => x.kind)).toEqual(['returned', 'returned', 'idle']);
    expect(r.state.returnReport).toMatchObject({ reason: 'forwardJump', countedSec: OFFLINE.capSec });
    expect(of(r.events, 'RaidReturned')).toHaveLength(2);
  });
});

describe('clock set back changes nothing (M3-05)', () => {
  it('advance, tick, applyOffline and resume with the clock behind leave a running raid running', () => {
    const s = advance(sending('h1'), T0 + 30 * MIN).state;
    for (const r of [
      advance(s, T0 - DAY),
      tick(s, T0 + 29 * MIN),
      applyOffline(s, T0 - DAY),
      resume(s, T0 - 3 * HOUR),
    ]) {
      expect(r.state.raids).toEqual(s.raids);
      expect(of(r.events, 'RaidReturned')).toEqual([]);
    }
  });

  it('a returned raid is not taken back by a clock set back', () => {
    const back = advance(sending('m5'), T0 + HOUR).state;
    expect(applyOffline(back, T0).state.raids).toEqual(back.raids);
    expect(resume(back, T0 - DAY).state.raids).toEqual(back.raids);
  });
});

describe('a day change does not touch raids (§0.1 П2)', () => {
  it('a running and a returned raid keep their rolls across several days', () => {
    const s = sending('m5', 'h8');
    const a = rollIn(s, 0);
    const b = rollIn(s, 1);
    const mid = advance(s, T0 + HOUR).state;
    expect(mid.raids.slots.slice(0, 2)).toEqual([
      { kind: 'returned', raid: a },
      { kind: 'running', raid: b },
    ]);
    const later = applyOffline(mid, T0 + 3 * DAY).state;
    expect(later.raids.slots.slice(0, 2)).toEqual([
      { kind: 'returned', raid: a },
      { kind: 'returned', raid: b },
    ]);
    expect(later.raids.rumorDay).toBe(s.raids.rumorDay);
    expect(later.raids.pity).toBe(s.raids.pity);
  });
});

describe('time never claims and never levels (M3-05)', () => {
  it('ticks, offline and resume over returning raids: no RaidClaimed, RelicFound, QuestCompleted or TierReached', () => {
    const s = sending('h8', 'm5');
    const banned = new Set(['RaidClaimed', 'RelicFound', 'RaidStarted', 'QuestCompleted', 'TierReached']);
    for (const r of [
      tick(s, T0 + 2 * SEC),
      advance(s, T0 + 9 * HOUR),
      applyOffline(s, T0 + 9 * HOUR),
      resume(s, T0 + 3 * DAY),
    ]) {
      expect(r.events.filter((e) => banned.has(e.type))).toEqual([]);
      expect(r.state.stats).toEqual(s.stats);
      expect(r.state.relics).toEqual(s.relics);
      expect(r.state.raids.slots[2]).toEqual(IDLE);
    }
  });
});
