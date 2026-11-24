// Save v3 → v4 (plan M3-04, §0, Q7; SPEC §9.3, §9.5; ADR 012): raids, relics and the raid counters; the `raid1` chain
// step inserted after `hire1` (saves already past it shift by one, the step passes silently, no reward). And the v4
// gate: every invariant of plan §0 has its own refusal, so a crafted save cannot farm a relic or pysanky through the
// pity counter or the slots (platform review M2-22/23: an export is trusted only as far as validateState checks it).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAIN_STEP_IDS, QUEST_CHAIN } from '../../../src/content/quests.ts';
import { RAID_TIERS, RAIDS } from '../../../src/content/raids.ts';
import { pityThreshold } from '../../../src/content/relics.ts';
import { fnv1a32 } from '../../../src/core/save/checksum.ts';
import { chooseSave } from '../../../src/core/save/load.ts';
import { migrate, MIGRATIONS } from '../../../src/core/save/migrations/index.ts';
import { decodeSave, encodeSave } from '../../../src/core/save/serialize.ts';
import { createInitialState, STATE_VERSION, V4_RAID_SLOTS, validateState } from '../../../src/core/state.ts';
import { dayAt } from '../../../src/core/systems/quests.ts';

const T0 = 1_763_400_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DIR = 'tests/fixtures/saves';
const raw = (v: number): string => readFileSync(`${DIR}/v${String(v)}.json`, 'utf8').trim();
const payloadOf = (text: string): Record<string, unknown> =>
  JSON.parse((JSON.parse(text) as { payload: string }).payload) as Record<string, unknown>;
const envelope = (payload: unknown, version: number): string => {
  const p = JSON.stringify(payload);
  return JSON.stringify({ version, seq: 1, checksum: fnv1a32(p), payload: p });
};
const migrated = (payload: unknown): Record<string, unknown> => {
  const m = migrate(payload, 3, MIGRATIONS, 4);
  if (!m.ok) throw new Error('migration');
  return m.value as Record<string, unknown>;
};

/** The v3 chain as it shipped (pinned, not derived from live content: the migration is frozen to it). */
const V3_CHAIN = [
  'khortytsia.field1',
  'khortytsia.garden1',
  'khortytsia.hire1',
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

const FRESH_RAIDS = {
  slots: Array.from({ length: RAIDS.maxSlots }, () => ({ kind: 'idle' })),
  rumorDay: -1,
  pity: 0,
};

describe('migration v3 → v4 (M3-04)', () => {
  it('the v3 fixture: version 4, every slot idle, no rumour used, pity 0, no relics, raid counters 0', () => {
    const v4 = migrated(payloadOf(raw(3)));
    expect(v4['version']).toBe(4);
    expect(v4['raids']).toEqual(FRESH_RAIDS);
    expect(v4['relics']).toEqual([]);
    const stats = v4['stats'] as Record<string, unknown>;
    expect([stats['raidsSent'], stats['raidsDone'], stats['raidsWon']]).toEqual([0, 0, 0]);
    expect(validateState(v4).ok).toBe(true);
  });

  it('grants nothing: everything but the version, the new fields, the counters and the chain index is the v3 game', () => {
    const before = payloadOf(raw(3));
    const after = migrated(payloadOf(raw(3)));
    for (const key of Object.keys(before).filter((k) => !['version', 'stats', 'quests'].includes(k)))
      expect(after[key], key).toEqual(before[key]);
    expect(after['stats']).toEqual({ ...(before['stats'] as object), raidsSent: 0, raidsDone: 0, raidsWon: 0 });
    const q0 = before['quests'] as { chores: unknown; chain: { base: number } };
    const q1 = after['quests'] as { chores: unknown; chain: { base: number } };
    expect(q1.chores).toEqual(q0.chores);
    expect(q1.chain.base).toBe(q0.chain.base);
  });

  it('Q7: `raid1` sits right after `hire1`; a v3 index keeps its step — those past `hire1` shift by one', () => {
    expect(CHAIN_STEP_IDS.indexOf('khortytsia.raid1')).toBe(CHAIN_STEP_IDS.indexOf('khortytsia.hire1') + 1);
    expect(QUEST_CHAIN.map((q) => q.id)).toEqual([...CHAIN_STEP_IDS]);
    const v3 = payloadOf(raw(3)) as { quests: Record<string, unknown> };
    expect(V3_CHAIN).toHaveLength(28);
    V3_CHAIN.forEach((id, index) => {
      const base = 0;
      const out = migrated({ ...v3, quests: { ...v3.quests, chain: { kind: 'listed', index, base } } }) as {
        quests: { chain: { kind: string; index: number; base: number } };
      };
      expect(out.quests.chain.kind).toBe('listed');
      expect(CHAIN_STEP_IDS[out.quests.chain.index], `v3 step ${String(index)}`).toBe(id);
    });
    // On `hire1` itself the step stays: the player meets `raid1` next.
    const onHire = migrated({ ...v3, quests: { ...v3.quests, chain: { kind: 'listed', index: 2, base: 0 } } }) as {
      quests: { chain: { index: number } };
    };
    expect(onHire.quests.chain.index).toBe(CHAIN_STEP_IDS.indexOf('khortytsia.hire1'));
  });

  it('Q7 boundaries pass the gate: `hire1` stays at 2, the last v3 step 27 becomes 28 (still the last step)', () => {
    const v3 = payloadOf(raw(3)) as { quests: Record<string, unknown> };
    const at = (index: number): unknown => {
      const r = validateState(migrated({ ...v3, quests: { ...v3.quests, chain: { kind: 'listed', index, base: 0 } } }));
      if (!r.ok) throw new Error(`${r.error.reason} at ${r.error.path}`);
      return r.state.quests.chain;
    };
    expect(at(2)).toEqual({ kind: 'listed', index: 2, base: 0 });
    expect(at(27)).toEqual({ kind: 'listed', index: 28, base: 0 });
    expect(CHAIN_STEP_IDS[28]).toBe(V3_CHAIN[27]);
    expect(CHAIN_STEP_IDS).toHaveLength(29);
  });

  it('Q7: a generated step and a finished chain pass unchanged', () => {
    const v3 = payloadOf(raw(3)) as { quests: Record<string, unknown> };
    for (const chain of [{ kind: 'generated', goal: { kind: 'building', id: 'field', level: 75 } }, { kind: 'done' }]) {
      const out = migrated({ ...v3, quests: { ...v3.quests, chain } }) as { quests: { chain: unknown } };
      expect(out.quests.chain).toEqual(chain);
    }
  });

  it('v1 → … → v4 and v2 → … → v4: the older fixtures load with fresh raids', () => {
    for (const v of [1, 2]) {
      const r = decodeSave(raw(v));
      if (!r.ok) throw new Error(`v${String(v)}: ${r.reason}`);
      expect(r.state.version).toBe(STATE_VERSION);
      expect(JSON.parse(JSON.stringify(r.state.raids))).toEqual(FRESH_RAIDS);
      expect(r.state.relics).toEqual([]);
    }
  });

  it('a damaged v3 payload, or a v3 envelope around another version, is a migration failure', () => {
    const v3 = payloadOf(raw(3));
    for (const bad of [null, 5, [], { version: 3 }, { ...v3, version: 2 }, { ...v3, stats: null }]) {
      expect(migrate(bad, 3)).toEqual({ ok: false });
      expect(decodeSave(envelope(bad, 3))).toEqual({ ok: false, reason: 'migration' });
    }
  });
});

describe('v4 saves load, and a newer one is never touched (M3-04)', () => {
  it('v4.json passes chooseSave and holds a played game with raids in the slots', () => {
    const boot = chooseSave(raw(4), null);
    if (boot.kind !== 'loaded') throw new Error(boot.kind);
    const s = boot.state;
    expect(s.version).toBe(4);
    expect(s.army.infantry).toBeGreaterThan(0);
    const kinds = s.raids.slots.map((slot) => slot.kind);
    expect(kinds).toContain('running');
    expect(kinds).toContain('returned');
    expect(s.stats.raidsSent).toBeGreaterThanOrEqual(kinds.filter((k) => k !== 'idle').length);
  });

  it('a v5 save (envelope or payload) is «newer»: refused and blocks both slots', () => {
    const v4 = payloadOf(raw(4));
    expect(decodeSave(envelope(v4, 5))).toEqual({ ok: false, reason: 'newer' });
    expect(decodeSave(envelope({ ...v4, version: 5 }, 4))).toEqual({ ok: false, reason: 'newer' });
    expect(chooseSave(raw(4), envelope({ ...v4, version: 5 }, 5))).toEqual({ kind: 'newer' });
  });

  it('decode → encode → decode leaves the v4 save unchanged', () => {
    const first = decodeSave(raw(4));
    if (!first.ok) throw new Error(first.reason);
    const again = decodeSave(encodeSave(first.state, first.seq));
    if (!again.ok) throw new Error(again.reason);
    expect(again.state).toEqual(first.state);
    expect(encodeSave(again.state, again.seq)).toBe(raw(4));
  });
});

// --- the v4 gate ----------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;
const big = (n: number): string => String(n);

/** A raid roll in its JSON form: a 30-minute success started at T0, ducats and glory only. */
function roll(over: Json = {}, loot: Json = {}): Json {
  return {
    region: 'porohy',
    tier: 'm30',
    startedAt: T0,
    returnAt: T0 + 30 * MIN,
    success: true,
    rumor: false,
    loot: { ducats: big(100), glory: big(5), pysanky: 0, relic: null, ...loot },
    ...over,
  };
}
const running = (r: Json = roll()): Json => ({ kind: 'running', raid: r });
const returned = (r: Json = roll()): Json => ({ kind: 'returned', raid: r });
const idle = { kind: 'idle' };

/** A fresh v4 game, two hours in, with `slots` (padded with idle), `stats` / `relics` / raids fields over it. */
function game(
  slots: readonly Json[] = [],
  over: { stats?: Json; relics?: unknown; pity?: unknown; rumorDay?: unknown; time?: Json } = {},
): Json {
  const g = JSON.parse(JSON.stringify(createInitialState({ seed: 7, now: T0 }))) as Json;
  const busy = slots.filter((s) => s['kind'] !== 'idle').length;
  // Every found relic came from a won (claimed) raid.
  const won = Array.isArray(over.relics) ? over.relics.length : 0;
  const padded = [...slots, ...Array.from({ length: RAIDS.maxSlots - slots.length }, () => idle)];
  return {
    ...g,
    time: { lastSeen: T0 + 2 * HOUR, maxSeen: T0 + 2 * HOUR, created: T0, ...over.time },
    stats: { ...(g['stats'] as Json), raidsSent: busy + won, raidsDone: won, raidsWon: won, ...over.stats },
    relics: over.relics ?? [],
    raids: { slots: padded, rumorDay: over.rumorDay ?? -1, pity: over.pity ?? 0 },
  };
}
const reason = (value: unknown): string => {
  const r = validateState(value);
  return r.ok ? 'ok' : `${r.error.reason} at ${r.error.path}`;
};

describe('validateState v4: one refusal per invariant of plan §0 (M3-04)', () => {
  it('a running, a returned and an idle slot pass; the state built from them round-trips', () => {
    const g = game([running(roll({ startedAt: T0 + HOUR, returnAt: T0 + 90 * MIN })), returned()]);
    expect(reason(g)).toBe('ok');
    const s = validateState(g);
    if (!s.ok) throw new Error('invalid');
    const back = decodeSave(encodeSave(s.state));
    expect(back.ok && back.state).toEqual(s.state);
  });

  it('slots: exactly RAIDS.maxSlots of them, each a known kind with exactly its keys', () => {
    const g = game();
    const raids = g['raids'] as Json;
    expect(reason({ ...g, raids: { ...raids, slots: [idle, idle] } })).toBe('range at raids.slots');
    expect(reason({ ...g, raids: { ...raids, slots: [idle, idle, idle, idle] } })).toBe('range at raids.slots');
    expect(reason(game([{ kind: 'lost' }]))).toBe('range at raids.slots.0.kind');
    expect(reason(game([{ kind: 'idle', raid: roll() }]))).toBe('unknownKey at raids.slots.0.raid');
    expect(reason(game([{ ...running(), extra: 1 }]))).toBe('unknownKey at raids.slots.0.extra');
    expect(reason({ ...g, raids: { ...raids, extra: 1 } })).toBe('unknownKey at raids.extra');
  });

  it('a raid names a known tier and region', () => {
    expect(reason(game([running(roll({ tier: 'd1' }))]))).toBe('range at raids.slots.0.raid.tier');
    expect(reason(game([running(roll({ region: 'krym' }))]))).toBe('range at raids.slots.0.raid.region');
  });

  it('startedAt ≤ returnAt', () => {
    expect(reason(game([running(roll({ returnAt: T0 - 1 }))]))).toBe('range at raids.slots.0.raid.returnAt');
  });

  it('returnAt = startedAt + the duration of its tier, exactly (no time modifier before M4)', () => {
    const m30 = RAID_TIERS.find((t) => t.id === 'm30')?.durationSec ?? 0;
    expect(reason(game([running(roll({ returnAt: T0 + m30 * 1000 }))]))).toBe('ok');
    expect(reason(game([running(roll({ returnAt: T0 + m30 * 1000 + 1 }))]))).toBe(
      'range at raids.slots.0.raid.returnAt',
    );
    // An 8-hour raid back at once.
    expect(reason(game([running(roll({ tier: 'h8', returnAt: T0 }))]))).toBe('range at raids.slots.0.raid.returnAt');
  });

  it('created ≤ startedAt ≤ maxSeen: no raid from before the game or from the future', () => {
    expect(reason(game([running(roll({ startedAt: T0 + 2 * HOUR, returnAt: T0 + 2 * HOUR + 30 * MIN }))]))).toBe('ok');
    expect(reason(game([running(roll({ startedAt: T0 + 2 * HOUR + 1, returnAt: T0 + 2 * HOUR + 30 * MIN }))]))).toBe(
      'range at raids.slots.0.raid.startedAt',
    );
    expect(reason(game([running(roll({ startedAt: T0 - 1 }))]))).toBe('range at raids.slots.0.raid.startedAt');
  });

  it('a returned raid has come back by maxSeen (no claim before its time)', () => {
    const late = roll({ startedAt: T0 + 2 * HOUR, returnAt: T0 + 2 * HOUR + 30 * MIN });
    expect(reason(game([running(late)]))).toBe('ok');
    expect(reason(game([returned(late)]))).toBe('range at raids.slots.0.raid.returnAt');
  });

  it('loot: ducats and glory are save-safe Bigs, pysanky a whole number', () => {
    expect(reason(game([running(roll({}, { ducats: '-1' }))]))).toBe('range at raids.slots.0.raid.loot.ducats');
    expect(reason(game([running(roll({}, { glory: '1e' }))]))).toBe('bigFormat at raids.slots.0.raid.loot.glory');
    expect(reason(game([running(roll({}, { ducats: 100 }))]))).toBe('type at raids.slots.0.raid.loot.ducats');
    expect(reason(game([running(roll({}, { pysanky: 1.5 }))]))).toBe('range at raids.slots.0.raid.loot.pysanky');
  });

  it('pysanky: at most RAIDS.pysanky.max, only on a success, only on a tier that can give them', () => {
    const h1 = { tier: 'h1', returnAt: T0 + HOUR };
    expect(reason(game([running(roll(h1, { pysanky: RAIDS.pysanky.max }))]))).toBe('ok');
    expect(reason(game([running(roll(h1, { pysanky: RAIDS.pysanky.max + 1 }))]))).toBe(
      'range at raids.slots.0.raid.loot.pysanky',
    );
    expect(reason(game([running(roll({ ...h1, success: false }, { pysanky: 1 }))]))).toBe(
      'range at raids.slots.0.raid.loot.pysanky',
    );
    // The 5-minute scouting has neither a pysanky nor a relic chance (all relics found turns the latter into pysanky).
    expect(reason(game([running(roll({ tier: 'm5', returnAt: T0 + 5 * MIN }, { pysanky: 1 }))]))).toBe(
      'range at raids.slots.0.raid.loot.pysanky',
    );
  });

  it('pysanky on a tier without a pysanky chance (30 min): only once every relic is held, only on a success', () => {
    const p = { pysanky: 1 };
    expect(reason(game([running(roll({}, p))]))).toBe('range at raids.slots.0.raid.loot.pysanky');
    expect(reason(game([running(roll({}, p))], { relics: ['pernach'] }))).toBe(
      'range at raids.slots.0.raid.loot.pysanky',
    );
    expect(reason(game([running(roll({}, p))], { relics: ['pernach', 'porokhivnytsia'] }))).toBe('ok');
    // The other relic on its way home counts as held (it was rolled before: this roll could not draw it).
    expect(
      reason(game([running(roll({}, { relic: 'porokhivnytsia' })), running(roll({}, p))], { relics: ['pernach'] })),
    ).toBe('ok');
    expect(reason(game([running(roll({ success: false }, p))], { relics: ['pernach', 'porokhivnytsia'] }))).toBe(
      'range at raids.slots.0.raid.loot.pysanky',
    );
  });

  it('a rumour start sets rumorDay to its day: rumor = true with a rumorDay before that day is refused', () => {
    const r = running(roll({ rumor: true }));
    expect(reason(game([r], { rumorDay: dayAt(T0, 840) }))).toBe('ok');
    expect(reason(game([r], { rumorDay: -1 }))).toBe('range at raids.slots.0.raid.rumor');
  });

  it('relics need wins: no more relics found than raids won', () => {
    expect(reason(game([], { relics: ['pernach'] }))).toBe('ok');
    expect(reason(game([], { relics: ['pernach'], stats: { raidsWon: 0 } }))).toBe('range at relics');
  });

  it('the slot count is part of the v4 shape: content RAIDS.maxSlots matches it', () => {
    expect(RAIDS.maxSlots).toBe(V4_RAID_SLOTS);
  });

  it('a slot relic: only on a success, only on a tier with a relic chance', () => {
    expect(reason(game([running(roll({}, { relic: 'pernach' }))]))).toBe('ok');
    expect(reason(game([running(roll({ success: false }, { relic: 'pernach' }))]))).toBe(
      'range at raids.slots.0.raid.loot.relic',
    );
    expect(reason(game([running(roll({ tier: 'm5', returnAt: T0 + 5 * MIN }, { relic: 'pernach' }))]))).toBe(
      'range at raids.slots.0.raid.loot.relic',
    );
  });

  it('a slot relic is not one already found', () => {
    expect(reason(game([running(roll({}, { relic: 'pernach' }))], { relics: ['pernach'] }))).toBe(
      'range at raids.slots.0.raid.loot.relic',
    );
  });

  it('two slots never hold the same relic', () => {
    const r = running(roll({}, { relic: 'pernach' }));
    expect(reason(game([r, returned(roll({}, { relic: 'porokhivnytsia' }))]))).toBe('ok');
    expect(reason(game([r, returned(roll({}, { relic: 'pernach' }))]))).toBe('range at raids.slots.1.raid.loot.relic');
  });

  it('an unknown slot relic is dropped (a removed relic never bricks a save), never granted', () => {
    const s = validateState(game([running(roll({}, { relic: 'kobza' }))]));
    if (!s.ok) throw new Error('invalid');
    const slot = s.state.raids.slots[0];
    expect(slot?.kind === 'running' && slot.raid.loot.relic).toBeNull();
  });

  it('relics: known ids in finding order, an unknown one dropped, a duplicate refused', () => {
    const s = validateState(game([], { relics: ['porokhivnytsia', 'kobza', 'pernach'] }));
    expect(s.ok && s.state.relics).toEqual(['porokhivnytsia', 'pernach']);
    expect(reason(game([], { relics: ['pernach', 'pernach'] }))).toBe('range at relics.1');
    expect(reason(game([], { relics: [1] }))).toBe('type at relics.0');
    expect(reason(game([], { relics: 'pernach' }))).toBe('type at relics');
  });

  it('raidsWon ≤ raidsDone ≤ raidsSent', () => {
    expect(reason(game([], { stats: { raidsSent: 3, raidsDone: 3, raidsWon: 3 } }))).toBe('ok');
    expect(reason(game([], { stats: { raidsSent: 3, raidsDone: 4, raidsWon: 0 } }))).toBe('range at stats.raidsDone');
    expect(reason(game([], { stats: { raidsSent: 3, raidsDone: 2, raidsWon: 3 } }))).toBe('range at stats.raidsWon');
    expect(reason(game([], { stats: { raidsSent: -1 } }))).toBe('range at stats.raidsSent');
  });

  it('running and returned slots ≤ raidsSent − raidsDone (a crafted slot is not a free raid)', () => {
    const two = [running(), returned()];
    expect(reason(game(two, { stats: { raidsSent: 5, raidsDone: 3 } }))).toBe('ok');
    expect(reason(game(two, { stats: { raidsSent: 5, raidsDone: 4, raidsWon: 0 } }))).toBe('range at raids.slots');
  });

  it('a slot past the open ones is idle', () => {
    const slots = Array.from({ length: RAIDS.slots }, () => idle);
    expect(reason(game([...slots, running()]))).toBe(`range at raids.slots.${String(RAIDS.slots)}.kind`);
  });

  it('0 ≤ pity < pityThreshold(relics held): found ones and those already rolled into a slot', () => {
    const first = pityThreshold(0);
    expect(reason(game([], { pity: first - 1 }))).toBe('ok');
    expect(reason(game([], { pity: first }))).toBe('range at raids.pity');
    expect(reason(game([], { pity: -1 }))).toBe('range at raids.pity');
    expect(reason(game([], { pity: 0.5 }))).toBe('range at raids.pity');
    // A relic on its way home already counts: the next threshold holds (the roll reset the pity, then it ran on).
    const next = pityThreshold(1);
    expect(reason(game([running(roll({}, { relic: 'pernach' }))], { pity: next - 1 }))).toBe('ok');
    expect(reason(game([running(roll({}, { relic: 'pernach' }))], { pity: next }))).toBe('range at raids.pity');
    expect(reason(game([], { relics: ['pernach'], pity: next - 1 }))).toBe('ok');
  });

  it('−1 ≤ rumorDay ≤ the easternmost day of maxSeen + 1', () => {
    const top = dayAt(T0 + 2 * HOUR, 840) + 1;
    expect(reason(game([], { rumorDay: top }))).toBe('ok');
    expect(reason(game([], { rumorDay: top + 1 }))).toBe('range at raids.rumorDay');
    expect(reason(game([], { rumorDay: -2 }))).toBe('range at raids.rumorDay');
  });

  it('a v4 game must carry raids, relics and the counters', () => {
    const g = game();
    const without = (key: string): Json => Object.fromEntries(Object.entries(g).filter(([k]) => k !== key));
    expect(reason(without('raids'))).toBe('missing at raids');
    expect(reason(without('relics'))).toBe('missing at relics');
    const stats = { ...(g['stats'] as Json) };
    Reflect.deleteProperty(stats, 'raidsWon');
    expect(reason({ ...g, stats })).toBe('missing at stats.raidsWon');
  });
});
