// Save v2 → v3 (plan M2-23/M2-24, SPEC §3.10, rules/save.md): `quests` (the chain on its first unmet step, passed
// steps silently without rewards; fresh chores) and `settings.tzOffsetMin` (0 until the platform tells the zone).
// The migration tests assert invariants against the content, not content-derived numbers: M2-27 retunes goals and
// rewards without touching them (ids and order are frozen — content/quests.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHORES, QUEST_CHAIN } from '../../../src/content/quests.ts';
import { fnv1a32 } from '../../../src/core/save/checksum.ts';
import { migrate, MIGRATIONS } from '../../../src/core/save/migrations/index.ts';
import { decodeSave } from '../../../src/core/save/serialize.ts';
import { createInitialState, STATE_VERSION, validateState, type GameState } from '../../../src/core/state.ts';
import { chainQuest, dayAt } from '../../../src/core/systems/quests.ts';

const T0 = 1_763_400_000_000;
const DAY = 86_400_000;
const v2Raw = readFileSync('tests/fixtures/saves/v2.json', 'utf8').trim();
const payloadOf = (raw: string): Record<string, unknown> =>
  JSON.parse((JSON.parse(raw) as { payload: string }).payload) as Record<string, unknown>;
const v2Payload = (): Record<string, unknown> => payloadOf(v2Raw);
const envelope = (payload: unknown, version: number): string => {
  const p = JSON.stringify(payload);
  return JSON.stringify({ version, seq: 1, checksum: fnv1a32(p), payload: p });
};

/** A level goal of `step` met by the game's levels (a count goal never is before it begins). */
function met(s: GameState, index: number): boolean {
  const g = QUEST_CHAIN[index]?.goal;
  if (!g || g.kind === 'count') return false;
  return (g.kind === 'building' ? s.village.levels[g.id] : s.village.sichLevels[g.id]) >= g.level;
}

/** The migration's invariants on any v2 game it turned into `s`. */
function expectFreshQuests(s: GameState): void {
  const c = s.quests.chain;
  const at = c.kind === 'listed' ? c.index : QUEST_CHAIN.length;
  // Every step before the active one is met; the active one is not (or the list is through).
  for (let i = 0; i < at; i++) expect(met(s, i), `step ${String(i)}`).toBe(true);
  if (c.kind === 'listed') {
    expect(met(s, c.index)).toBe(false);
    expect(chainQuest(s)?.done).toBe(false);
  }
  const chores = s.quests.chores;
  const def = CHORES.pool.find((d) => d.id === chores.active);
  expect(def).toBeDefined();
  if (!def) return;
  expect(chores).toEqual({
    day: dayAt(s.time.maxSeen, 0),
    n: 0,
    active: def.id,
    base: s.stats[def.goal.stat],
    claims: 0,
  });
}

describe('migration v2 → v3 (M2-23)', () => {
  it('the v2 fixture: version 3, UTC, the chain on its first unmet step, fresh chores', () => {
    const m = migrate(v2Payload(), 2, MIGRATIONS, 3);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const v3 = m.value as { version: number; settings: Record<string, unknown> };
    expect(v3.version).toBe(3);
    expect(v3.settings['tzOffsetMin']).toBe(0);
    const v = validateState(v3);
    if (!v.ok) throw new Error(v.error.reason);
    expectFreshQuests(v.state);
    // The fixture is a played game: it is past the first step.
    expect(v.state.quests.chain.kind === 'listed' && v.state.quests.chain.index).toBeGreaterThan(0);
  });

  it('passed steps grant nothing: everything but quests and the zone is the v2 game', () => {
    const before = v2Payload();
    const m = migrate(v2Payload(), 2, MIGRATIONS, 3);
    if (!m.ok) throw new Error('migration');
    const after = m.value as Record<string, unknown>;
    for (const key of Object.keys(before).filter((k) => k !== 'version' && k !== 'settings'))
      expect(after[key], key).toEqual(before[key]);
    expect(after['settings']).toEqual({ ...(before['settings'] as object), tzOffsetMin: 0 });
  });

  it('a v2 game with nothing built starts the chain at its first step', () => {
    const fresh = JSON.parse(JSON.stringify(createInitialState({ seed: 3, now: T0 }))) as Record<string, unknown>;
    const asV2 = { ...fresh, version: 2, settings: { lang: 'uk', numberFormat: 'words' } };
    Reflect.deleteProperty(asV2, 'quests');
    const r = decodeSave(envelope(asV2, 2));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.quests.chain).toEqual({ kind: 'listed', index: 0, base: 0 });
    expectFreshQuests(r.state);
  });

  it('v1 → v2 → v3: the oldest fixture loads through the whole chain with the same invariants', () => {
    const r = decodeSave(readFileSync('tests/fixtures/saves/v1.json', 'utf8').trim());
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.version).toBe(STATE_VERSION);
    expectFreshQuests(r.state);
  });

  it('the v3 fixture decodes', () => {
    const r = decodeSave(readFileSync('tests/fixtures/saves/v3.json', 'utf8').trim());
    expect(r.ok).toBe(true);
  });

  it('a damaged v2 payload, or a v2 envelope around another version, is a migration failure', () => {
    for (const bad of [null, 5, [], { version: 2, village: 3 }, { version: 3 }, { ...v2Payload(), stats: null }]) {
      expect(migrate(bad, 2)).toEqual({ ok: false });
      expect(decodeSave(envelope(bad, 2))).toEqual({ ok: false, reason: 'migration' });
    }
  });

  it('v3 fields in a v4 envelope (or a v4 payload) are a newer game: never loaded', () => {
    const game = JSON.parse(JSON.stringify(createInitialState({ seed: 8, now: T0 }))) as Record<string, unknown>;
    expect(decodeSave(envelope(game, 4))).toEqual({ ok: false, reason: 'newer' });
    expect(decodeSave(envelope({ ...game, version: 4 }, 4))).toEqual({ ok: false, reason: 'newer' });
  });
});

describe('validateState: quests and the time zone (M2-23)', () => {
  const plain = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(createInitialState({ seed: 7, now: T0 }))) as Record<string, unknown>;
  const reason = (raw: unknown): string => {
    const r = validateState(raw);
    return r.ok ? 'ok' : `${r.error.reason} at ${r.error.path}`;
  };
  const withChain = (chain: unknown, stats?: Record<string, number>): unknown => {
    const p = plain();
    return {
      ...p,
      ...(stats ? { stats: { ...(p['stats'] as object), ...stats } } : {}),
      quests: { ...(p['quests'] as object), chain },
    };
  };
  const withChores = (over: Record<string, unknown>, stats?: Record<string, number>): unknown => {
    const p = plain() as { quests: { chores: Record<string, unknown> }; stats: object };
    return {
      ...p,
      ...(stats ? { stats: { ...p.stats, ...stats } } : {}),
      quests: { ...p.quests, chores: { ...p.quests.chores, ...over } },
    };
  };

  it('a listed step inside the chain; a generated goal on a real building and level; done', () => {
    expect(reason(withChain({ kind: 'listed', index: QUEST_CHAIN.length - 1, base: 3.5 }))).toBe('ok');
    expect(reason(withChain({ kind: 'listed', index: QUEST_CHAIN.length, base: 0 }))).toBe(
      'range at quests.chain.index',
    );
    expect(reason(withChain({ kind: 'listed', index: 0, base: -1 }))).toBe('range at quests.chain.base');
    expect(reason(withChain({ kind: 'listed', land: 'khortytsia', index: 0, base: 0 }))).toBe(
      'unknownKey at quests.chain.land',
    );
    const goal = { kind: 'building', id: 'apiary', level: 75 };
    expect(reason(withChain({ kind: 'generated', goal }))).toBe('ok');
    expect(reason(withChain({ kind: 'generated', goal: { ...goal, id: 'maidan' } }))).toBe(
      'range at quests.chain.goal.id',
    );
    expect(reason(withChain({ kind: 'generated', goal: { kind: 'sich', id: 'maidan', level: 51 } }))).toBe(
      'range at quests.chain.goal.level',
    );
    expect(reason(withChain({ kind: 'done' }))).toBe('ok');
    expect(reason(withChain({ kind: 'done', index: 0 }))).toBe('unknownKey at quests.chain.index');
    expect(reason(withChain({ kind: 'later' }))).toBe('range at quests.chain.kind');
    expect(reason(withChain(null))).toBe('type at quests.chain');
  });

  it('a count step or a chore whose base is above its counter now is refused (counters only grow)', () => {
    const count = QUEST_CHAIN.findIndex((q) => q.goal.kind === 'count');
    const stat = QUEST_CHAIN[count]?.goal;
    if (stat?.kind !== 'count') throw new Error('no count step');
    expect(reason(withChain({ kind: 'listed', index: count, base: 5 }, { [stat.stat]: 5 }))).toBe('ok');
    expect(reason(withChain({ kind: 'listed', index: count, base: 6 }, { [stat.stat]: 5 }))).toBe(
      'range at quests.chain.base',
    );
    const chore = CHORES.pool[0];
    if (!chore) throw new Error('no chore');
    expect(reason(withChores({ active: chore.id, base: 7 }, { [chore.goal.stat]: 7 }))).toBe('ok');
    expect(reason(withChores({ active: chore.id, base: 8 }, { [chore.goal.stat]: 7 }))).toBe(
      'range at quests.chores.base',
    );
  });

  it('chores: a known id, whole counters ≤ 1e9, a day no later than the easternmost day of maxSeen + 1', () => {
    expect(reason(withChores({ active: 'chore.raid' }))).toBe('range at quests.chores.active');
    expect(reason(withChores({ claims: -1 }))).toBe('range at quests.chores.claims');
    expect(reason(withChores({ claims: 1e9 + 1 }))).toBe('range at quests.chores.claims');
    expect(reason(withChores({ n: 1.5 }))).toBe('range at quests.chores.n');
    expect(reason(withChores({ n: 1e9 + 1 }))).toBe('range at quests.chores.n');
    expect(reason(withChores({ extra: 1 }))).toBe('unknownKey at quests.chores.extra');
    const top = dayAt(T0, 840) + 1;
    expect(reason(withChores({ day: top }))).toBe('ok');
    expect(reason(withChores({ day: top + 1 }))).toBe('range at quests.chores.day');
    expect(Math.floor(T0 / DAY)).toBeLessThanOrEqual(top);
  });

  it('tzOffsetMin: whole minutes within UTC−12…+14', () => {
    const tz = (v: unknown): unknown => ({
      ...plain(),
      settings: { lang: 'uk', numberFormat: 'words', tzOffsetMin: v },
    });
    expect(reason(tz(-720))).toBe('ok');
    expect(reason(tz(840))).toBe('ok');
    expect(reason(tz(841))).toBe('range at settings.tzOffsetMin');
    expect(reason(tz(30.5))).toBe('range at settings.tzOffsetMin');
    expect(reason(tz('120'))).toBe('type at settings.tzOffsetMin');
  });
});
