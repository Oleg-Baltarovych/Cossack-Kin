// The hero beats of M4-08 (plan M4-08, SPEC §2.5 «Віхи-герої», ADR 013, Q4/Q5): «Кобзар біля шинку» (the tavern at a
// level → the Кобзар) and «Характерник на Січі» (raids won → the Характерник); both thresholds read from content. A trigger already met in an old save fires on
// the first check — the modal and the hero, never silently; `raidsWon` is raised by the claim, so time alone (a raid
// back on the road, an 8 h absence) never brings the Характерник; online steps = one offline step.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RAID_TIERS } from '../../../src/content/raids.ts';
import { STORY_BEATS, type StoryBeatId, type StoryTrigger } from '../../../src/content/story.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { applyOffline, tick } from '../../../src/core/offline.ts';
import { decodeSave } from '../../../src/core/save/serialize.ts';
import { fnv1a32 } from '../../../src/core/save/checksum.ts';
import { createInitialState, validateState, type GameState } from '../../../src/core/state.ts';
import type { RaidSlot } from '../../../src/core/systems/raids.ts';

const T0 = 1_763_400_000_000;
const SEC = 1000;
const HOUR = 3600 * SEC;
/** «Now» of the raid games: two hours after their creation (a raid must start after it). */
const NOW = T0 + 2 * HOUR;
type Json = Record<string, unknown>;

const raw = (v: number): string => readFileSync(`tests/fixtures/saves/v${String(v)}.json`, 'utf8').trim();
const payloadOf = (text: string): Json => JSON.parse((JSON.parse(text) as { payload: string }).payload) as Json;
const envelope = (payload: unknown, version: number): string => {
  const p = JSON.stringify(payload);
  return JSON.stringify({ version, seq: 1, checksum: fnv1a32(p), payload: p });
};

/** The story part of `events`: beats reached and heroes joined, in order. */
const story = (events: readonly GameEvent[]): unknown[] =>
  events.flatMap<unknown>((e) =>
    e.type === 'StoryBeatReached'
      ? [{ beat: e.id, granted: e.granted }]
      : e.type === 'HeroJoined'
        ? [{ hero: e.id }]
        : [],
  );

function trigger<K extends StoryTrigger['kind']>(id: StoryBeatId, kind: K): Extract<StoryTrigger, { kind: K }> {
  const t = STORY_BEATS.find((b) => b.id === id)?.trigger;
  if (t?.kind !== kind) throw new Error(`content: ${id} is not a ${kind} beat`);
  // Checked just above: the trigger's kind is K.
  return t as Extract<StoryTrigger, { kind: K }>;
}
/** The tavern level that brings the Кобзар and the raids won that bring the Характерник (content). */
const TAVERN = trigger('khortytsia.kobzar', 'building').level;
const WINS = trigger('khortytsia.kharakternyk', 'raidsWon').count;

const KOBZAR = [{ beat: 'khortytsia.kobzar', granted: null }, { hero: 'kobzar' }];
const KHARAKTERNYK = [{ beat: 'khortytsia.kharakternyk', granted: null }, { hero: 'kharakternyk' }];

function loaded(text: string): GameState {
  const r = decodeSave(text);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** A returned (or still running) raid of the lowest tier, a success or not. */
function raidIn(kind: 'returned' | 'running', startedAt: number, success: boolean): RaidSlot {
  const tier = RAID_TIERS[0];
  if (!tier) throw new Error('content: no raid tier');
  return {
    kind,
    raid: {
      region: 'porohy',
      tier: tier.id,
      startedAt,
      returnAt: startedAt + tier.durationSec * SEC,
      success,
      rumor: false,
      loot: { ducats: Big.from(10), glory: Big.from(5), pysanky: 0, relic: null },
    },
  };
}

/** A game one win short of the Характерник, the early beats seen, and `slot0` in the first raid slot. */
function oneShort(slot0: RaidSlot, seed = 3): GameState {
  const s = createInitialState({ seed, now: T0 });
  const slots = s.raids.slots.map((x, i) => (i === 0 ? slot0 : x));
  const r = validateState(
    JSON.parse(
      JSON.stringify({
        ...s,
        time: { lastSeen: NOW, maxSeen: NOW, created: T0 },
        army: { infantry: 12 },
        story: { seen: ['khortytsia.shore', 'khortytsia.messenger'] },
        stats: { ...s.stats, hires: 12, raidsSent: WINS + 1, raidsDone: WINS, raidsWon: WINS - 1 },
        raids: { ...s.raids, slots },
      }),
    ),
  );
  if (!r.ok) throw new Error(`${r.error.reason} at ${r.error.path}`);
  return r.state;
}

describe('old saves: a met hero trigger fires on the first check, with the modal and the hero (M4-08 AC)', () => {
  it('a v5 save with the tavern and the raids won at their thresholds: both beats fire on its first advance, each bringing his hero', () => {
    const p = payloadOf(raw(5));
    const village = p['village'] as Json;
    const levels = village['levels'] as Json;
    const stats = p['stats'] as Json;
    const tavern = Math.max(TAVERN, levels['tavern'] as number);
    const done = Math.max(WINS, stats['raidsDone'] as number);
    const save = {
      ...p,
      village: { ...village, levels: { ...levels, tavern } },
      stats: {
        ...stats,
        levelsBought: (stats['levelsBought'] as number) + tavern,
        raidsSent: (stats['raidsSent'] as number) + done,
        raidsDone: done,
        raidsWon: WINS,
      },
    };
    const s = loaded(envelope(save, 5));
    expect(s.story.seen).not.toContain('khortytsia.kobzar');
    expect(s.heroes).toEqual({ otaman: 1 });
    const r = advance(s, s.time.lastSeen + SEC);
    expect(story(r.events)).toEqual([...KOBZAR, ...KHARAKTERNYK]);
    expect(r.state.heroes).toEqual({ otaman: 1, kobzar: 1, kharakternyk: 1 });
    expect(r.state.stats.heroLevels).toBe(stats['heroLevels']);
  });

  it('the v1 fixture (tavern past the threshold): the v1 → v2 migration leaves «Кобзар біля шинку» unseen; it fires on the first check', () => {
    const s = loaded(raw(1));
    expect(s.village.levels.tavern).toBeGreaterThanOrEqual(TAVERN);
    expect(s.story.seen).not.toContain('khortytsia.kobzar');
    const r = applyOffline(s, s.time.lastSeen + SEC);
    expect(story(r.events)).toContainEqual(KOBZAR[0]);
    expect(r.state.heroes['kobzar']).toBe(1);
    expect(r.events).toContainEqual({ type: 'HeroJoined', id: 'kobzar' });
  });

  it('every older fixture whose tavern is at the threshold gets the Кобзар on its first advance', () => {
    for (const v of [1, 2, 3, 4, 5]) {
      const s = loaded(raw(v));
      if (s.village.levels.tavern < TAVERN) continue;
      const r = advance(s, s.time.lastSeen + SEC);
      expect(r.state.heroes['kobzar'], `v${String(v)}`).toBe(1);
    }
  });
});

describe('«Кобзар біля шинку»: the tavern level of the threshold bought (M4-08)', () => {
  it('the purchase that reaches the threshold fires the beat and brings the Кобзар at level 1', () => {
    const s0 = createInitialState({ seed: 2, now: T0 });
    const s: GameState = {
      ...s0,
      currencies: { ...s0.currencies, ducats: Big.from(1e12) },
      story: { seen: ['khortytsia.shore'] },
      village: { ...s0.village, levels: { ...s0.village.levels, tavern: TAVERN - 1 } },
    };
    const r = applyAction(s, { type: 'buyBuilding', id: 'tavern', mode: 1 }, T0 + SEC);
    expect(r.state.village.levels.tavern).toBe(TAVERN);
    expect(story(r.events)).toEqual(KOBZAR);
    expect(r.state.heroes).toEqual({ kobzar: 1 });
  });
});

describe('«Характерник на Січі»: the last raid won is counted at the claim, never at the return (M4-08, M4-05 review)', () => {
  it('a won raid back on the road: neither one 8 h advance, ticks nor applyOffline bring him — the claim does', () => {
    const s = oneShort(raidIn('running', NOW - 10 * SEC, true));
    const end = NOW + 8 * HOUR;
    const one = advance(s, end);
    let ticked = s;
    const tickEvents: GameEvent[] = [];
    for (let t = NOW + 60 * SEC; t <= end; t += 60 * SEC) {
      const r = tick(ticked, t);
      tickEvents.push(...r.events);
      ticked = r.state;
    }
    const away = applyOffline(s, end);
    for (const [how, r] of [
      ['advance', one],
      ['ticks', { state: ticked, events: tickEvents }],
      ['applyOffline', away],
    ] as const) {
      expect(r.state.raids.slots[0]?.kind, how).toBe('returned');
      expect(r.state.stats.raidsWon, how).toBe(WINS - 1);
      expect(r.state.heroes['kharakternyk'], how).toBeUndefined();
      expect(story(r.events), how).toEqual([]);
    }
    const claimed = applyAction(one.state, { type: 'claimRaid', slot: 0 }, end + SEC);
    expect(claimed.state.stats.raidsWon).toBe(WINS);
    expect(story(claimed.events)).toEqual(KHARAKTERNYK);
    expect(claimed.state.heroes['kharakternyk']).toBe(1);
  });

  it('a lost raid claimed one win short brings nobody (raidsWon, not raidsDone)', () => {
    const s = oneShort(raidIn('returned', T0, false));
    const r = applyAction(s, { type: 'claimRaid', slot: 0 }, NOW + SEC);
    expect(r.state.stats.raidsDone).toBe(WINS + 1);
    expect(r.state.stats.raidsWon).toBe(WINS - 1);
    expect(story(r.events)).toEqual([]);
  });

  it('«Забрати все» and «Ще раз» claim too: the winning claim brings him once', () => {
    for (const action of [{ type: 'claimAllRaids' }, { type: 'claimRaid', slot: 0, again: true }] as const) {
      const s = oneShort(raidIn('returned', T0, true));
      const r = applyAction(s, action, NOW + SEC);
      expect(story(r.events), action.type).toEqual(KHARAKTERNYK);
      const again = advance(r.state, NOW + HOUR);
      expect(story(again.events), action.type).toEqual([]);
    }
  });

  it('online = offline after he came: 5 s steps and one 8 h advance give the same purse and the same heroes', () => {
    const s = oneShort(raidIn('returned', T0, true));
    const c = applyAction(s, { type: 'claimRaid', slot: 0 }, NOW + SEC).state;
    expect(c.heroes['kharakternyk']).toBe(1);
    const end = NOW + SEC + 8 * HOUR;
    const offline = advance(c, end).state;
    let online = c;
    for (let t = NOW + 6 * SEC; t <= end; t += 5 * SEC) online = advance(online, t).state;
    expect(online.heroes).toEqual(offline.heroes);
    const rel = (a: Big, b: Big): number => Math.abs(a.sub(b).div(b).toNumber());
    expect(rel(online.currencies.ducats, offline.currencies.ducats)).toBeLessThan(1e-9);
    expect(rel(online.currencies.glory, offline.currencies.glory)).toBeLessThan(1e-9);
  });
});
