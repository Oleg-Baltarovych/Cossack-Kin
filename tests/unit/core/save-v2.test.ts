// Save v1 → v2 (plan M2-22, SPEC §2.5 «Міграція v1 → v2», rules/save.md): `story.seen` = the beats whose triggers
// already hold, silently (no event, no reward); the new counters from what v1 knows.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import { advance } from '../../../src/core/advance.ts';
import { fnv1a32 } from '../../../src/core/save/checksum.ts';
import { migrate } from '../../../src/core/save/migrations/index.ts';
import { decodeSave, encodeSave } from '../../../src/core/save/serialize.ts';
import { createInitialState, validateState } from '../../../src/core/state.ts';

const T0 = 1_763_400_000_000;
const v1Raw = readFileSync('tests/fixtures/saves/v1.json', 'utf8').trim();
const v1Payload = (): Record<string, unknown> =>
  JSON.parse((JSON.parse(v1Raw) as { payload: string }).payload) as Record<string, unknown>;

/** A v1 envelope around `payload` (for crafted v1 saves). */
const v1Save = (payload: unknown): string => {
  const p = JSON.stringify(payload);
  return JSON.stringify({ version: 1, seq: 1, checksum: fnv1a32(p), payload: p });
};

describe('migration v1 → v2 (M2-22)', () => {
  it('the v1 fixture: version 2, the met beats seen silently, the counters from v1', () => {
    const v1 = v1Payload() as {
      village: { levels: Record<string, number>; sichLevels: Record<string, number> };
      army: { infantry: number };
      stats: { taps: number; purchases: number };
    };
    const m = migrate(v1Payload(), 1);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const v2 = m.value as Record<string, unknown>;
    expect(v2['version']).toBe(2);
    // The fixture: 89 Cossacks (≥ 3), maidan 17 (≥ 10), no church.
    expect(v2['story']).toEqual({ seen: ['khortytsia.shore', 'khortytsia.messenger', 'khortytsia.council'] });
    const levels =
      FARM_BUILDING_IDS.reduce((n, id) => n + (v1.village.levels[id] ?? 0), 0) +
      SICH_BUILDING_IDS.reduce((n, id) => n + (v1.village.sichLevels[id] ?? 0), 0);
    expect(v2['stats']).toEqual({
      taps: v1.stats.taps,
      purchases: v1.stats.purchases,
      levelsBought: levels,
      hires: v1.army.infantry,
      tapIncomeSec: 0,
    });
    expect(validateState(v2).ok).toBe(true);
  });

  it('after loading, the beats marked seen never fire: no event, no reward', () => {
    const r = decodeSave(v1Raw);
    if (!r.ok) throw new Error(r.reason);
    const a = advance(r.state, r.state.time.lastSeen + 60_000);
    expect(a.events.filter((e) => e.type === 'StoryBeatReached')).toEqual([]);
    expect(a.state.story.seen).toEqual(r.state.story.seen);
  });

  it('a new v1 game (nothing bought): only the start beat is seen; the church once it stands', () => {
    const fresh = JSON.parse(JSON.stringify(createInitialState({ seed: 3, now: T0 }))) as Record<string, unknown>;
    const asV1 = { ...fresh, version: 1, stats: { taps: 0, purchases: 0 } };
    Reflect.deleteProperty(asV1, 'story');
    const r = decodeSave(v1Save(asV1));
    expect(r.ok && r.state.story.seen).toEqual(['khortytsia.shore']);

    const p = v1Payload() as { village: { sichLevels: Record<string, number> } };
    p.village.sichLevels['church'] = 1;
    const c = decodeSave(v1Save(p));
    expect(c.ok && c.state.story.seen).toEqual([
      'khortytsia.shore',
      'khortytsia.messenger',
      'khortytsia.council',
      'khortytsia.pokrova',
    ]);
  });

  it('a damaged v1 payload is refused as a migration failure, never thrown', () => {
    for (const bad of [null, 5, [], { village: 3 }, { village: { levels: null } }]) {
      expect(migrate(bad, 1)).toEqual({ ok: false });
      expect(decodeSave(v1Save(bad))).toEqual({ ok: false, reason: 'migration' });
    }
  });

  it('bad v1 levels or a missing army are refused by the migration; a level over the max by validateState', () => {
    const withField = (field: unknown): unknown => {
      const p = v1Payload() as { village: { levels: Record<string, unknown> } };
      p.village.levels['field'] = field;
      return p;
    };
    for (const bad of [-1, 2.5, '10', null])
      expect(decodeSave(v1Save(withField(bad)))).toEqual({ ok: false, reason: 'migration' });
    const noArmy = v1Payload();
    Reflect.deleteProperty(noArmy, 'army');
    expect(decodeSave(v1Save(noArmy))).toEqual({ ok: false, reason: 'migration' });
    // A whole number the migration can count, but past the level cap: the gate after the chain refuses it.
    expect(decodeSave(v1Save(withField(101)))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a v1 envelope around a payload that is not v1 (here a v2 one) is refused, not migrated twice', () => {
    const v2Payload = JSON.parse(JSON.stringify(createInitialState({ seed: 4, now: T0 }))) as unknown;
    expect(migrate(v2Payload, 1)).toEqual({ ok: false });
    expect(decodeSave(v1Save(v2Payload))).toEqual({ ok: false, reason: 'migration' });
  });

  it('a migrated v1 survives decode → encode → decode unchanged', () => {
    const first = decodeSave(v1Raw);
    if (!first.ok) throw new Error(first.reason);
    const again = encodeSave(first.state, first.seq);
    const second = decodeSave(again);
    if (!second.ok) throw new Error(second.reason);
    expect(encodeSave(second.state, second.seq)).toBe(again);
    expect(JSON.parse(JSON.stringify(second.state))).toEqual(JSON.parse(JSON.stringify(first.state)));
  });
});

describe('decoding v2 saves (M2-22 review)', () => {
  const v2Save = (payload: unknown, version = 2): string => {
    const p = JSON.stringify(payload);
    return JSON.stringify({ version, seq: 1, checksum: fnv1a32(p), payload: p });
  };
  const game = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(createInitialState({ seed: 8, now: T0 }))) as Record<string, unknown>;

  it('a duplicate seen id is an invalid save', () => {
    const raw = v2Save({ ...game(), story: { seen: ['khortytsia.shore', 'khortytsia.shore'] } });
    expect(decodeSave(raw)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a v3 envelope (or payload) is a newer game: never loaded, never overwritten', () => {
    expect(decodeSave(v2Save({ ...game(), version: 3 }, 3))).toEqual({ ok: false, reason: 'newer' });
    expect(decodeSave(v2Save({ ...game(), version: 3 }, 2))).toEqual({ ok: false, reason: 'newer' });
  });
});

describe('validateState: story and stats (M2-22)', () => {
  const plain = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(createInitialState({ seed: 7, now: T0 }))) as Record<string, unknown>;
  const reason = (raw: unknown): string => {
    const r = validateState(raw);
    return r.ok ? 'ok' : `${r.error.reason} at ${r.error.path}`;
  };

  it('seen holds known beat ids, each once; an unknown id (a renamed beat) is dropped, not a broken save', () => {
    expect(reason({ ...plain(), story: { seen: ['khortytsia.shore', 'khortytsia.council'] } })).toBe('ok');
    const renamed = validateState({ ...plain(), story: { seen: ['khortytsia.old', 'khortytsia.shore', 'x'] } });
    expect(renamed.ok && renamed.state.story.seen).toEqual(['khortytsia.shore']);
    expect(reason({ ...plain(), story: { seen: [7] } })).toBe('type at story.seen.0');
    expect(reason({ ...plain(), story: { seen: ['khortytsia.shore', 'khortytsia.shore'] } })).toBe(
      'range at story.seen.1',
    );
    expect(reason({ ...plain(), story: { seen: 'khortytsia.shore' } })).toBe('type at story.seen');
    expect(reason({ ...plain(), story: { seen: [], extra: 1 } })).toBe('unknownKey at story.extra');
    const noStory = plain();
    Reflect.deleteProperty(noStory, 'story');
    expect(reason(noStory)).toBe('missing at story');
  });

  it('the counters are non-negative; tapIncomeSec may be fractional', () => {
    const stats = (over: Record<string, unknown>): unknown => ({
      ...plain(),
      stats: { taps: 0, purchases: 0, levelsBought: 0, hires: 0, tapIncomeSec: 0, ...over },
    });
    expect(reason(stats({ tapIncomeSec: 0.9 }))).toBe('ok');
    expect(reason(stats({ tapIncomeSec: -1 }))).toBe('range at stats.tapIncomeSec');
    expect(reason(stats({ tapIncomeSec: 'x' }))).toBe('type at stats.tapIncomeSec');
    expect(reason(stats({ hires: 1.5 }))).toBe('range at stats.hires');
    expect(reason(stats({ levelsBought: -2 }))).toBe('range at stats.levelsBought');
  });

  it('hires are never fewer than the infantry (every Cossack in the army was hired)', () => {
    const army = (infantry: number, hires: number): unknown => ({
      ...plain(),
      army: { infantry },
      stats: { taps: 0, purchases: 0, levelsBought: 0, hires, tapIncomeSec: 0 },
    });
    expect(reason(army(5, 5))).toBe('ok');
    expect(reason(army(5, 9))).toBe('ok');
    expect(reason(army(5, 4))).toBe('range at stats.hires');
  });
});
