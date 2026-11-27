// Property-style check (plan M3-05): any save the raid actions and time produce passes the save gate, and the raid
// counters only grow. Random sequences of starts, claims, purchases, taps, ticks, absences and clocks set back,
// drawn from the seeded core RNG (reproducible: the failing seed and step are in the message). M4-06: some games have
// the Характерник (a stand-in beat brings him until M4-08, hero-beats.ts) and level him up between raids — raids he
// shortens at their start keep the v5 gate, and those on the road never change (checkStep: same kind = same raid).
import { describe, expect, it, vi } from 'vitest';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { RAID_TIER_IDS } from '../../../src/content/raids.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { applyOffline, resume, tick } from '../../../src/core/offline.ts';
import { createRng, next, type Rng } from '../../../src/core/rng.ts';
import { createInitialState, validateState, type GameState } from '../../../src/core/state.ts';

vi.mock('../../../src/content/story.ts', async (importOriginal) =>
  (await import('./hero-beats.ts')).withHeroBeats(await importOriginal()),
);

const T0 = 1_763_400_000_000;
const SEC = 1000;
const HOUR = 3600 * SEC;
const DAY = 24 * HOUR;
const STEPS = 150;
/** The gap of the per-step offline equivalence check: past the cap and past the longest raid. */
const OFFLINE_GAP = 9 * HOUR;

function start(seed: number): GameState {
  const s = createInitialState({ seed, now: T0 });
  // Some games with every beat seen, some fresh (beats then fire along the way); the seen ones have the heroes (the
  // Характерник at a level of the seed) — the others never get him (his stand-in beat cannot fire).
  const seen = seed % 2 === 0;
  const kharakternyk = 1 + ((seed * 7) % 20);
  return {
    ...s,
    story: seen ? { seen: [...STORY_BEAT_IDS] } : s.story,
    heroes: seen ? { otaman: 1, kobzar: 1, kharakternyk } : s.heroes,
    currencies: { ...s.currencies, ducats: Big.from(1e9), glory: Big.from(1e6) },
    army: { infantry: 40 + (seed % 5) * 300 },
    stats: { ...s.stats, hires: 40 + (seed % 5) * 300, heroLevels: seen ? kharakternyk - 1 : 0 },
  };
}

function pick<T>(rng: Rng, list: readonly T[]): [T, Rng] {
  const [u, r] = next(rng);
  const x = list[Math.floor(u * list.length)];
  if (x === undefined) throw new Error('empty list');
  return [x, r];
}

type Move = { kind: 'action'; action: Action; dt: number } | { kind: 'tick' | 'offline' | 'resume'; dt: number };

const GAPS = [0, 100, 2 * SEC, 6 * SEC, 5 * 60 * SEC, HOUR, 3 * HOUR, 9 * HOUR, 2 * DAY, 9 * DAY, -HOUR, -DAY];

function move(rng0: Rng): [Move, Rng] {
  const [dt, rng1] = pick(rng0, GAPS);
  const [k, rng2] = next(rng1);
  const [slot, rng3] = pick(rng2, [0, 1, 0, 1, 2, -1]);
  const [tier, rng4] = pick(rng3, RAID_TIER_IDS);
  if (k < 0.3) return [{ kind: 'action', action: { type: 'startRaid', slot, tier }, dt }, rng4];
  if (k < 0.5) return [{ kind: 'action', action: { type: 'claimRaid', slot }, dt }, rng4];
  if (k < 0.55) return [{ kind: 'action', action: { type: 'claimAllRaids' }, dt }, rng4];
  if (k < 0.6) return [{ kind: 'action', action: { type: 'buyBuilding', id: 'field', mode: 10 }, dt }, rng4];
  if (k < 0.62) return [{ kind: 'action', action: { type: 'claimReturn' }, dt }, rng4];
  if (k < 0.63) return [{ kind: 'action', action: { type: 'levelHero', id: 'kharakternyk', mode: 1 }, dt }, rng4];
  if (k < 0.66) return [{ kind: 'action', action: { type: 'tap' }, dt }, rng4];
  if (k < 0.8) return [{ kind: 'tick', dt }, rng4];
  if (k < 0.93) return [{ kind: 'offline', dt }, rng4];
  return [{ kind: 'resume', dt }, rng4];
}

function apply(s: GameState, m: Move, clock: number): { state: GameState; events: readonly GameEvent[] } {
  switch (m.kind) {
    case 'action':
      return applyAction(s, m.action, clock);
    case 'tick':
      return tick(s, clock);
    case 'offline':
      return applyOffline(s, clock);
    case 'resume':
      return resume(s, clock);
  }
}

const isClaim = (m: Move): boolean =>
  m.kind === 'action' && (m.action.type === 'claimRaid' || m.action.type === 'claimAllRaids');
const accepted = (events: readonly GameEvent[]): boolean => !events.some((e) => e.type === 'ActionRejected');
const count = (events: readonly GameEvent[], type: GameEvent['type']): number =>
  events.filter((e) => e.type === type).length;

/** The checks of one step: slot transitions, events and exact grants (plan M3-05 review). */
function checkStep(
  before: GameState,
  m: Move,
  clock: number,
  after: GameState,
  events: readonly GameEvent[],
  where: string,
): void {
  const gate = validateState(JSON.parse(JSON.stringify(after)));
  expect(gate.ok ? 'ok' : `${gate.error.reason} at ${gate.error.path}`, where).toBe('ok');
  // Counters and the collection only grow.
  expect(after.stats.raidsSent, where).toBeGreaterThanOrEqual(before.stats.raidsSent);
  expect(after.stats.raidsDone, where).toBeGreaterThanOrEqual(before.stats.raidsDone);
  expect(after.stats.raidsWon, where).toBeGreaterThanOrEqual(before.stats.raidsWon);
  expect(after.relics.slice(0, before.relics.length), where).toEqual(before.relics);

  const ok = m.kind === 'action' && accepted(events);
  const returnedNow = new Set(events.flatMap((e) => (e.type === 'RaidReturned' ? [e.slot] : [])));
  const claimedNow = new Set(events.flatMap((e) => (e.type === 'RaidClaimed' ? [e.slot] : [])));
  let transitions = 0;
  before.raids.slots.forEach((b, i) => {
    const a = after.raids.slots[i];
    const at = `${where} slot ${String(i)} ${b.kind} → ${String(a?.kind)}`;
    if (!a) throw new Error(at);
    if (b.kind === 'running' && a.kind !== 'running') transitions += 1;
    if (b.kind === a.kind) {
      // Same kind: the same raid (a roll never changes in place), or still idle.
      expect(a, at).toEqual(b);
      return;
    }
    if (b.kind === 'idle' && a.kind === 'running') {
      expect(m.kind === 'action' && ok && m.action.type === 'startRaid' && m.action.slot === i, at).toBe(true);
    } else if (b.kind === 'running' && a.kind === 'returned') {
      expect(a.raid, at).toEqual(b.raid);
      expect(returnedNow.has(i), at).toBe(true);
    } else if (b.kind === 'returned' && a.kind === 'idle') {
      expect(ok && isClaim(m) && claimedNow.has(i), at).toBe(true);
    } else if (b.kind === 'running' && a.kind === 'idle') {
      // Back by the action's advance, then claimed by it.
      expect(ok && isClaim(m) && returnedNow.has(i) && claimedNow.has(i), at).toBe(true);
    } else {
      throw new Error(`illegal transition: ${at}`);
    }
  });
  expect(count(events, 'RaidReturned'), where).toBe(transitions);
  if (!isClaim(m) || !ok) {
    expect(count(events, 'RaidClaimed') + count(events, 'RelicFound'), where).toBe(0);
    return;
  }
  // A claim grants exactly the loot of the slots it claimed, on the state advanced to the action's time (a beat that
  // fires on the claim adds its own reward: those steps are skipped).
  if (events.some((e) => e.type === 'StoryBeatReached')) return;
  const advanced = advance(before, clock).state;
  let ducats = advanced.currencies.ducats;
  let glory = advanced.currencies.glory;
  let pysanky = advanced.currencies.pysanky;
  for (const i of claimedNow) {
    const x = advanced.raids.slots[i];
    if (x?.kind !== 'returned') throw new Error(`${where}: claimed slot ${String(i)} was not back`);
    ducats = ducats.add(x.raid.loot.ducats);
    glory = glory.add(x.raid.loot.glory);
    pysanky += x.raid.loot.pysanky;
  }
  expect(after.currencies.ducats.eq(ducats), where).toBe(true);
  expect(after.currencies.glory.eq(glory), where).toBe(true);
  expect(after.currencies.pysanky, where).toBe(pysanky);
}

interface Run {
  readonly final: GameState;
  readonly log: readonly (readonly GameEvent[])[];
  readonly returns: number;
  readonly claims: number;
}

function run(seed: number, check: boolean): Run {
  let s = start(seed);
  let rng = createRng(seed * 7919);
  let clock = T0;
  let returns = 0;
  let claims = 0;
  const log: (readonly GameEvent[])[] = [];
  for (let step = 0; step < STEPS; step++) {
    const [m, r] = move(rng);
    rng = r;
    clock += m.dt;
    const before = s;
    const out = apply(s, m, clock);
    s = out.state;
    log.push(out.events);
    returns += count(out.events, 'RaidReturned');
    claims += count(out.events, 'RaidClaimed');
    if (!check) continue;
    const where = `seed ${String(seed)} step ${String(step)} ${JSON.stringify(m)}`;
    checkStep(before, m, clock, s, out.events, where);
    // Offline equivalence on this state: the same gap through advance and through applyOffline ends with the same
    // slots and counters (income differs by design: the cap).
    const later = s.time.lastSeen + OFFLINE_GAP;
    const online = advance(s, later).state;
    const offline = applyOffline(s, later).state;
    expect(offline.raids, where).toEqual(online.raids);
    expect(offline.stats, where).toEqual(online.stats);
    expect(offline.relics, where).toEqual(online.relics);
  }
  return { final: s, log, returns, claims };
}

describe('random raid sequences (M3-05)', () => {
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
    'seed %i: every step keeps the save gate, legal slot transitions, exact grants; replay is the same',
    (seed) => {
      const first = run(seed, true);
      // The sequences do send, return and claim raids (otherwise the property says nothing about them).
      expect(first.final.stats.raidsSent).toBeGreaterThan(5);
      expect(first.returns).toBeGreaterThan(0);
      expect(first.claims).toBeGreaterThan(0);
      const again = run(seed, false);
      expect(again.final).toEqual(first.final);
      expect(again.log).toEqual(first.log);
    },
  );

  it('the games with the Характерник do level him up and send raids he shortens (else the M4-06 part says nothing)', () => {
    const logs = [2, 4, 6, 8, 10, 12].map((seed) => run(seed, false).log.flat());
    expect(logs.some((l) => l.some((e) => e.type === 'HeroLevelled'))).toBe(true);
    expect(logs.every((l) => l.some((e) => e.type === 'RaidStarted'))).toBe(true);
  });
});
