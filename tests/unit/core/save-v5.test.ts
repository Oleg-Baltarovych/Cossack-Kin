// Save v4 → v5 (plan M4-04, §0, Q12, Q16; SPEC §9.3, §9.5; ADR 013): sparse `culture` and `heroes`, the monotone
// `cultureRanks` / `heroLevels` counters, a level-1 hero for every unlock beat already seen (silently: no reward, no
// modal), and the `culture1` chain step inserted after `tavern1` (saves past it shift by one). And the v5 gate: ranks
// and levels inside the content, unknown ids dropped, the counters at least what the records hold, and the raid time
// window `returnAt − startedAt ∈ [ceil(dur × RAIDS.minTimeMult), dur]`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CULTURE_NODES } from '../../../src/content/culture.ts';
import { HEROES } from '../../../src/content/heroes.ts';
import { CHAIN_STEP_IDS, QUEST_CHAIN } from '../../../src/content/quests.ts';
import { RAID_TIERS, RAIDS } from '../../../src/content/raids.ts';
import { STORY_BEATS } from '../../../src/content/story.ts';
import { fnv1a32 } from '../../../src/core/save/checksum.ts';
import { chooseSave } from '../../../src/core/save/load.ts';
import { migrate, MIGRATIONS } from '../../../src/core/save/migrations/index.ts';
import { decodeSave, encodeSave } from '../../../src/core/save/serialize.ts';
import { createInitialState, STATE_VERSION, validateState } from '../../../src/core/state.ts';

const T0 = 1_763_400_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DIR = 'tests/fixtures/saves';
type Json = Record<string, unknown>;
const raw = (v: number): string => readFileSync(`${DIR}/v${String(v)}.json`, 'utf8').trim();
const payloadOf = (text: string): Json => JSON.parse((JSON.parse(text) as { payload: string }).payload) as Json;
const envelope = (payload: unknown, version: number): string => {
  const p = JSON.stringify(payload);
  return JSON.stringify({ version, seq: 1, checksum: fnv1a32(p), payload: p });
};
const migrated = (payload: unknown): Json => {
  const m = migrate(payload, 4, MIGRATIONS, 5);
  if (!m.ok) throw new Error('migration');
  return m.value as Json;
};
const reason = (value: unknown): string => {
  const r = validateState(value);
  return r.ok ? 'ok' : `${r.error.reason} at ${r.error.path}`;
};

/** The v4 chain as it shipped (pinned, not derived from live content: the migration is frozen to it). */
const V4_CHAIN = [
  'khortytsia.field1',
  'khortytsia.garden1',
  'khortytsia.hire1',
  'khortytsia.raid1',
  'khortytsia.field10',
  'khortytsia.apiary1',
  'khortytsia.hire3',
  'khortytsia.kurins1',
  'khortytsia.garden10',
  'khortytsia.windmill1',
  'khortytsia.apiary10',
  'khortytsia.field25',
  'khortytsia.windmill10',
  'khortytsia.potter1',
  'khortytsia.maidan1',
  'khortytsia.hire10',
  'khortytsia.smithy1',
  'khortytsia.maidan10',
  'khortytsia.potter10',
  'khortytsia.walls1',
  'khortytsia.tavern1',
  'khortytsia.treasury1',
  'khortytsia.smithy10',
  'khortytsia.fair1',
  'khortytsia.tavern10',
  'khortytsia.kurins10',
  'khortytsia.fair10',
  'khortytsia.church1',
  'khortytsia.field50',
] as const;

/** The v4 fixture's payload with `over` on top (a v4 game in its JSON form). */
const v4With = (over: Json = {}): Json => ({ ...payloadOf(raw(4)), ...over });
const withChain = (index: number): Json => {
  const v4 = payloadOf(raw(4)) as { quests: Json };
  return v4With({ quests: { ...v4.quests, chain: { kind: 'listed', index, base: 0 } } });
};

describe('migration v4 → v5 (M4-04)', () => {
  it('the v4 fixture: version 5, no culture, the otaman of the seen «Рада на майдані» at level 1, counters 0', () => {
    const v4 = payloadOf(raw(4));
    expect((v4['story'] as { seen: string[] }).seen).toContain('khortytsia.council');
    const v5 = migrated(v4);
    expect(v5['version']).toBe(5);
    expect(v5['culture']).toEqual({});
    expect(v5['heroes']).toEqual({ otaman: 1 });
    const stats = v5['stats'] as Json;
    expect([stats['cultureRanks'], stats['heroLevels']]).toEqual([0, 0]);
    expect(reason(v5)).toBe('ok');
  });

  it('grants nothing else: everything but the version, the new fields, the counters and the chain index is the v4 game', () => {
    const before = payloadOf(raw(4));
    const after = migrated(payloadOf(raw(4)));
    for (const key of Object.keys(before).filter((k) => !['version', 'stats', 'quests'].includes(k)))
      expect(after[key], key).toEqual(before[key]);
    expect(after['stats']).toEqual({ ...(before['stats'] as object), cultureRanks: 0, heroLevels: 0 });
    const q0 = before['quests'] as { chores: unknown; chain: { base: number } };
    const q1 = after['quests'] as { chores: unknown; chain: { base: number } };
    expect(q1.chores).toEqual(q0.chores);
    expect(q1.chain.base).toBe(q0.chain.base);
  });

  it('a hero only for a seen unlock beat: none before «Рада на майдані», unknown beat ids ignored', () => {
    const seen = (ids: string[]): unknown => migrated(v4With({ story: { seen: ids } }))['heroes'];
    expect(seen(['khortytsia.shore', 'khortytsia.messenger'])).toEqual({});
    expect(seen(['khortytsia.shore', 'khortytsia.gone', 'khortytsia.council'])).toEqual({ otaman: 1 });
    // Every hero of an unlock beat, whichever beats carry one.
    const all = STORY_BEATS.map((b) => b.id);
    const heroes = STORY_BEATS.flatMap((b) => (b.reward?.kind === 'unlock' ? [b.reward.hero] : []));
    expect(seen(all)).toEqual(Object.fromEntries(heroes.map((h) => [h, 1])));
  });

  it('Q12: `culture1` sits right after `tavern1`; a v4 index keeps its step — those past `tavern1` shift by one', () => {
    expect(CHAIN_STEP_IDS.indexOf('khortytsia.culture1')).toBe(CHAIN_STEP_IDS.indexOf('khortytsia.tavern1') + 1);
    expect(QUEST_CHAIN.map((q) => q.id)).toEqual([...CHAIN_STEP_IDS]);
    expect(CHAIN_STEP_IDS.filter((id) => id !== 'khortytsia.culture1')).toEqual([...V4_CHAIN]);
    V4_CHAIN.forEach((id, index) => {
      const out = migrated(withChain(index)) as { quests: { chain: { kind: string; index: number; base: number } } };
      expect(out.quests.chain.kind).toBe('listed');
      expect(out.quests.chain.base).toBe(0);
      expect(CHAIN_STEP_IDS[out.quests.chain.index], `v4 step ${String(index)}`).toBe(id);
    });
  });

  it('Q12 boundaries pass the gate: `tavern1` stays (culture1 comes next), the last v4 step stays the last step', () => {
    const at = (index: number): unknown => {
      const r = validateState(migrated(withChain(index)));
      if (!r.ok) throw new Error(`${r.error.reason} at ${r.error.path}`);
      return r.state.quests.chain;
    };
    const tavern = V4_CHAIN.indexOf('khortytsia.tavern1');
    expect(at(tavern)).toEqual({ kind: 'listed', index: tavern, base: 0 });
    expect(at(tavern + 1)).toEqual({ kind: 'listed', index: tavern + 2, base: 0 });
    expect(at(V4_CHAIN.length - 1)).toEqual({ kind: 'listed', index: CHAIN_STEP_IDS.length - 1, base: 0 });
  });

  it('a generated step and a finished chain pass unchanged', () => {
    const v4 = payloadOf(raw(4)) as { quests: Json };
    for (const chain of [{ kind: 'generated', goal: { kind: 'building', id: 'field', level: 75 } }, { kind: 'done' }]) {
      const out = migrated(v4With({ quests: { ...v4.quests, chain } })) as { quests: { chain: unknown } };
      expect(out.quests.chain).toEqual(chain);
    }
  });

  it('a v4 raid with the exact duration of its tier passes the v5 gate (the fixture’s raids load unchanged)', () => {
    const v4 = payloadOf(raw(4));
    const r = validateState(migrated(v4));
    if (!r.ok) throw new Error(`${r.error.reason} at ${r.error.path}`);
    expect(JSON.parse(JSON.stringify(r.state.raids))).toEqual(v4['raids']);
    expect(r.state.raids.slots.some((s) => s.kind === 'running')).toBe(true);
  });

  it('v1 … v4 → v5: every older fixture loads; its heroes follow its seen beats', () => {
    for (const v of [1, 2, 3, 4]) {
      const r = decodeSave(raw(v));
      if (!r.ok) throw new Error(`v${String(v)}: ${r.reason}`);
      expect(r.state.version).toBe(STATE_VERSION);
      expect(r.state.culture).toEqual({});
      expect(r.state.heroes).toEqual(r.state.story.seen.includes('khortytsia.council') ? { otaman: 1 } : {});
      expect([r.state.stats.cultureRanks, r.state.stats.heroLevels]).toEqual([0, 0]);
    }
  });

  it('a damaged v4 payload, or a v4 envelope around another version, is a migration failure', () => {
    const v4 = payloadOf(raw(4));
    for (const bad of [
      null,
      5,
      [],
      { version: 4 },
      { ...v4, version: 3 },
      { ...v4, stats: null },
      { ...v4, story: 1 },
    ]) {
      expect(migrate(bad, 4)).toEqual({ ok: false });
      expect(decodeSave(envelope(bad, 4))).toEqual({ ok: false, reason: 'migration' });
    }
  });
});

describe('v5 saves load, and a newer one is never touched (M4-04)', () => {
  it('v5.json passes chooseSave: a played game, the otaman arrived, a raid on the road', () => {
    const boot = chooseSave(raw(5), null);
    if (boot.kind !== 'loaded') throw new Error(boot.kind);
    const s = boot.state;
    expect(s.version).toBe(5);
    expect(s.army.infantry).toBeGreaterThan(0);
    expect(s.story.seen).toContain('khortytsia.council');
    expect(s.heroes).toEqual({ otaman: 1 });
    expect(s.raids.slots.map((slot) => slot.kind)).toContain('running');
  });

  it('a v6 save (envelope or payload) is «newer»: refused and blocks both slots', () => {
    const v5 = payloadOf(raw(5));
    expect(decodeSave(envelope(v5, 6))).toEqual({ ok: false, reason: 'newer' });
    expect(decodeSave(envelope({ ...v5, version: 6 }, 5))).toEqual({ ok: false, reason: 'newer' });
    expect(chooseSave(raw(5), envelope({ ...v5, version: 6 }, 6))).toEqual({ kind: 'newer' });
  });

  it('decode → encode → decode leaves the v5 save unchanged', () => {
    const first = decodeSave(raw(5));
    if (!first.ok) throw new Error(first.reason);
    const again = decodeSave(encodeSave(first.state, first.seq));
    if (!again.ok) throw new Error(again.reason);
    expect(again.state).toEqual(first.state);
    expect(encodeSave(again.state, again.seq)).toBe(raw(5));
  });
});

// --- the v5 gate ----------------------------------------------------------------------------------------------

/** A fresh v5 game, two hours in, with `over` on top (JSON form). */
function game(over: Json = {}, stats: Json = {}): Json {
  const g = JSON.parse(JSON.stringify(createInitialState({ seed: 7, now: T0 }))) as Json;
  return {
    ...g,
    time: { lastSeen: T0 + 2 * HOUR, maxSeen: T0 + 2 * HOUR, created: T0 },
    ...over,
    stats: { ...(g['stats'] as Json), ...stats },
  };
}

const dumy = CULTURE_NODES.find((n) => n.id === 'music.dumy');
const otaman = HEROES.find((h) => h.id === 'otaman');

describe('validateState v5: culture and heroes (M4-04, SPEC §9.3)', () => {
  it('a new game: empty records, counters 0', () => {
    const s = createInitialState({ seed: 1, now: T0 });
    expect(s.version).toBe(5);
    expect(s.culture).toEqual({});
    expect(s.heroes).toEqual({});
    expect([s.stats.cultureRanks, s.stats.heroLevels]).toEqual([0, 0]);
  });

  it('ranks and levels inside the content pass and round-trip', () => {
    const max = dumy?.maxRank ?? 0;
    const top = otaman?.levelMax ?? 0;
    const g = game(
      { culture: { 'music.dumy': max }, heroes: { otaman: top } },
      { cultureRanks: max, heroLevels: top - 1 },
    );
    const r = validateState(g);
    if (!r.ok) throw new Error(`${r.error.reason} at ${r.error.path}`);
    expect(r.state.culture).toEqual({ 'music.dumy': max });
    expect(r.state.heroes).toEqual({ otaman: top });
    const back = decodeSave(encodeSave(r.state));
    expect(back.ok && back.state).toEqual(r.state);
  });

  it('a rank is a whole number in 1…maxRank of its node (0 is not stored: a missing node is rank 0)', () => {
    const max = dumy?.maxRank ?? 0;
    const at = (rank: unknown): string => reason(game({ culture: { 'music.dumy': rank } }, { cultureRanks: 100 }));
    expect(at(1)).toBe('ok');
    expect(at(max + 1)).toBe('range at culture.music.dumy');
    expect(at(0)).toBe('range at culture.music.dumy');
    expect(at(1.5)).toBe('range at culture.music.dumy');
    expect(at('1')).toBe('type at culture.music.dumy');
  });

  it('a level is a whole number in 1…levelMax of its hero', () => {
    const top = otaman?.levelMax ?? 0;
    const at = (level: unknown): string => reason(game({ heroes: { otaman: level } }, { heroLevels: 100 }));
    expect(at(1)).toBe('ok');
    expect(at(top + 1)).toBe('range at heroes.otaman');
    expect(at(0)).toBe('range at heroes.otaman');
    expect(at(-1)).toBe('range at heroes.otaman');
    expect(at(null)).toBe('type at heroes.otaman');
  });

  it('an unknown node or hero id is dropped (rename-safe, as story.seen), never counted', () => {
    const r = validateState(
      game({ culture: { 'music.gone': 9, 'music.dumy': 1 }, heroes: { hetman: 7 } }, { cultureRanks: 1 }),
    );
    if (!r.ok) throw new Error(`${r.error.reason} at ${r.error.path}`);
    expect(r.state.culture).toEqual({ 'music.dumy': 1 });
    expect(r.state.heroes).toEqual({});
  });

  it('records are plain objects without forbidden keys', () => {
    expect(reason(game({ culture: [] }))).toBe('type at culture');
    expect(reason(game({ heroes: null }))).toBe('type at heroes');
    expect(reason(game({ heroes: JSON.parse('{"__proto__": 1}') as unknown }))).toBe(
      'forbiddenKey at heroes.__proto__',
    );
    expect(reason(game({ culture: JSON.parse('{"constructor": 1}') as unknown }))).toBe(
      'forbiddenKey at culture.constructor',
    );
  });

  it('cultureRanks ≥ Σ ranks: a crafted rank is not a bought one', () => {
    const culture = { 'music.dumy': 3, 'music.maidan': 2 };
    expect(reason(game({ culture }, { cultureRanks: 5 }))).toBe('ok');
    expect(reason(game({ culture }, { cultureRanks: 4 }))).toBe('range at stats.cultureRanks');
  });

  it('heroLevels ≥ Σ (level − 1): the free first level is not counted', () => {
    const heroes = { otaman: 4, kobzar: 1 };
    expect(reason(game({ heroes }, { heroLevels: 3 }))).toBe('ok');
    expect(reason(game({ heroes }, { heroLevels: 2 }))).toBe('range at stats.heroLevels');
    expect(reason(game({}, { heroLevels: -1 }))).toBe('range at stats.heroLevels');
  });

  it('a v5 game must carry culture, heroes and both counters', () => {
    const g = game();
    const without = (key: string): Json => Object.fromEntries(Object.entries(g).filter(([k]) => k !== key));
    expect(reason(without('culture'))).toBe('missing at culture');
    expect(reason(without('heroes'))).toBe('missing at heroes');
    for (const key of ['cultureRanks', 'heroLevels']) {
      const stats = { ...(g['stats'] as Json) };
      Reflect.deleteProperty(stats, key);
      expect(reason({ ...g, stats })).toBe(`missing at stats.${key}`);
    }
  });
});

describe('validateState v5: the raid time window (M4-04, SPEC §3.4 «Час походу»)', () => {
  const durMs = (RAID_TIERS.find((t) => t.id === 'm30')?.durationSec ?? 0) * 1000;
  const shortest = Math.ceil(durMs * RAIDS.minTimeMult);
  const withRaid = (returnAt: number): Json =>
    game(
      {
        raids: {
          slots: [
            {
              kind: 'running',
              raid: {
                region: 'porohy',
                tier: 'm30',
                startedAt: T0,
                returnAt,
                success: true,
                rumor: false,
                loot: { ducats: '100', glory: '5', pysanky: 0, relic: null },
              },
            },
            ...Array.from({ length: RAIDS.maxSlots - 1 }, () => ({ kind: 'idle' })),
          ],
          rumorDay: -1,
          pity: 0,
        },
      },
      { raidsSent: 1 },
    );

  it('returnAt − startedAt ∈ [ceil(dur × minTimeMult), dur]: both ends pass, one ms outside either is refused', () => {
    expect(RAIDS.minTimeMult).toBeLessThan(1);
    expect(reason(withRaid(T0 + durMs))).toBe('ok');
    expect(reason(withRaid(T0 + shortest))).toBe('ok');
    expect(reason(withRaid(T0 + durMs + 1))).toBe('range at raids.slots.0.raid.returnAt');
    expect(reason(withRaid(T0 + shortest - 1))).toBe('range at raids.slots.0.raid.returnAt');
    expect(reason(withRaid(T0))).toBe('range at raids.slots.0.raid.returnAt');
  });
});
