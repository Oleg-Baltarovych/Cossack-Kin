import { describe, expect, it } from 'vitest';
import { SAVE } from '../../../src/content/numbers.ts';
import { Big } from '../../../src/core/big.ts';
import { fnv1a32 } from '../../../src/core/save/checksum.ts';
import { chooseSave } from '../../../src/core/save/load.ts';
import { migrate, type Migration } from '../../../src/core/save/migrations/index.ts';
import { decodeSave, encodeSave, exportSave, importSave, SAVE_VERSION } from '../../../src/core/save/serialize.ts';
import { createInitialState, STATE_VERSION, type GameState } from '../../../src/core/state.ts';

const T0 = 1_763_400_000_000;

function game(over: { ducats?: number; lastSeen?: number; field?: number } = {}): GameState {
  const s = createInitialState({ seed: 77, now: T0 });
  const lastSeen = over.lastSeen ?? T0;
  return {
    ...s,
    time: { ...s.time, lastSeen, maxSeen: Math.max(lastSeen, s.time.maxSeen) },
    currencies: { ...s.currencies, ducats: Big.from(over.ducats ?? 1234.5) },
    village: { ...s.village, levels: { ...s.village.levels, field: over.field ?? 12 } },
  };
}

/** Rewrites the envelope of a save (for corrupt / crafted cases). */
function envelope(raw: string): { version: unknown; checksum: unknown; payload: unknown } {
  return JSON.parse(raw) as { version: unknown; checksum: unknown; payload: unknown };
}

describe('fnv1a32 (M1-13)', () => {
  it('matches the published FNV-1a 32 test vectors, as 8 hex digits', () => {
    expect(fnv1a32('')).toBe('811c9dc5');
    expect(fnv1a32('a')).toBe('e40c292c');
    expect(fnv1a32('foobar')).toBe('bf9cf968');
  });

  it('hashes UTF-8 bytes, not UTF-16 code units: «є» (U+0454) = bytes d1 94', () => {
    // FNV-1a over the two bytes 0xd1, 0x94, computed by hand from the offset basis and prime.
    let h = 0x811c9dc5;
    for (const byte of [0xd1, 0x94]) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
    expect(fnv1a32('є')).toBe(h.toString(16).padStart(8, '0'));
  });
});

describe('encodeSave / decodeSave (M1-13, SPEC §9.5)', () => {
  it('round-trips a state exactly (Big as strings)', () => {
    const s = game({ ducats: 1.5e40 });
    const r = decodeSave(encodeSave(s));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.currencies.ducats.eq(s.currencies.ducats)).toBe(true);
    expect(r.state.village.levels).toEqual(s.village.levels);
    expect(r.state.time).toEqual(s.time);
    expect(encodeSave(r.state)).toBe(encodeSave(s));
  });

  it('the envelope is {version, checksum, payload} with the checksum over the payload string', () => {
    const e = envelope(encodeSave(game()));
    expect(Object.keys(e).sort()).toEqual(['checksum', 'payload', 'version']);
    expect(e.version).toBe(SAVE_VERSION);
    expect(typeof e.payload).toBe('string');
    expect(e.checksum).toBe(fnv1a32(e.payload as string));
  });

  it('a corrupted payload fails its checksum', () => {
    const e = envelope(encodeSave(game()));
    const broken = JSON.stringify({ ...e, payload: (e.payload as string).replace('"field":12', '"field":99') });
    expect(decodeSave(broken)).toMatchObject({ ok: false, reason: 'checksum' });
  });

  it('a save from a newer version is refused as «newer» (the player must update the game)', () => {
    const e = envelope(encodeSave(game()));
    expect(decodeSave(JSON.stringify({ ...e, version: SAVE_VERSION + 1 }))).toMatchObject({
      ok: false,
      reason: 'newer',
    });
  });

  it(`more than ${String(SAVE.maxChars)} chars is refused before parsing`, () => {
    const huge = ' '.repeat(SAVE.maxChars + 1);
    expect(decodeSave(huge)).toMatchObject({ ok: false, reason: 'tooLarge' });
  });

  it('poisoned keys are refused (in the payload and in the envelope)', () => {
    const payload = JSON.stringify({ ...JSON.parse(JSON.stringify(game())), __proto__x: 1 }).replace(
      '"__proto__x"',
      '"__proto__"',
    );
    const poisoned = JSON.stringify({ version: SAVE_VERSION, checksum: fnv1a32(payload), payload });
    expect(decodeSave(poisoned)).toMatchObject({ ok: false, reason: 'invalid' });
    const envPoison = encodeSave(game()).replace('{"version"', '{"__proto__":{"x":1},"version"');
    expect(decodeSave(envPoison)).toMatchObject({ ok: false, reason: 'envelope' });
  });

  it('garbage never throws: not JSON, wrong types, missing fields', () => {
    for (const raw of ['', 'null', '[]', '{', '{"version":1}', '{"version":"1","checksum":"x","payload":"{}"}']) {
      const r = decodeSave(raw);
      expect(r.ok, raw).toBe(false);
    }
  });
});

describe('migrate (M1-13)', () => {
  it('with the empty chain it is the identity for the current version', () => {
    const raw = JSON.parse(JSON.stringify(game())) as unknown;
    expect(migrate(raw, STATE_VERSION)).toEqual({ ok: true, value: raw });
  });

  it('runs every step in order from the save version up to the current one', () => {
    const chain: Migration[] = [
      { from: 1, to: 2, run: (v) => ({ ...(v as object), a: 1 }) },
      { from: 2, to: 3, run: (v) => ({ ...(v as object), b: 2 }) },
    ];
    expect(migrate({}, 1, chain, 3)).toEqual({ ok: true, value: { a: 1, b: 2 } });
    expect(migrate({}, 2, chain, 3)).toEqual({ ok: true, value: { b: 2 } });
    // A gap in the chain is an error, not a silent skip.
    expect(migrate({}, 1, [chain[1] as Migration], 3)).toEqual({ ok: false });
  });
});

describe('chooseSave: two rotating slots (M1-13)', () => {
  const older = encodeSave(game({ lastSeen: T0, field: 10 }));
  const newer = encodeSave(game({ lastSeen: T0 + 60_000, field: 11 }));
  const corrupt = newer.replace(/"checksum":"[0-9a-f]{8}"/, '"checksum":"00000000"');

  it('no saves: a fresh start, nothing to report', () => {
    expect(chooseSave(null, null)).toEqual({ kind: 'fresh', reason: 'empty' });
  });

  it('both readable: the later one (by lastSeen), whichever slot it is in', () => {
    const r = chooseSave(older, newer);
    expect(r.kind === 'loaded' && [r.slot, r.state.village.levels.field, r.fallback]).toEqual(['b', 11, false]);
    const s = chooseSave(newer, older);
    expect(s.kind === 'loaded' && s.slot).toBe('a');
  });

  it('a corrupted save_a falls back to save_b (and says so)', () => {
    const r = chooseSave(corrupt, older);
    expect(r.kind === 'loaded' && [r.slot, r.fallback]).toEqual(['b', true]);
  });

  it('both corrupted: a fresh game with the flag for the UI', () => {
    expect(chooseSave(corrupt, 'not json')).toEqual({ kind: 'fresh', reason: 'corrupt' });
  });

  it('a newer-version save in either slot blocks everything: nothing may overwrite it', () => {
    const e = envelope(older);
    const future = JSON.stringify({ ...e, version: SAVE_VERSION + 1 });
    expect(chooseSave(newer, future)).toEqual({ kind: 'newer' });
  });
});

describe('export / import as base64 (M1-13, SPEC §9.5)', () => {
  it('round-trips, and a mangled string is refused without a throw', () => {
    const s = game({ ducats: 42 });
    const text = exportSave(s);
    expect(text).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const r = importSave(text);
    expect(r.ok && r.state.currencies.ducats.eq(42)).toBe(true);
    expect(importSave(text.slice(5))).toMatchObject({ ok: false });
    expect(importSave('!!!')).toMatchObject({ ok: false });
  });
});
