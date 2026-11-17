import { describe, expect, it } from 'vitest';
import { FARM, OFFLINE, SICH, START } from '../../../src/content/economy.ts';
import { SAVE_MAX_EXPONENT } from '../../../src/content/numbers.ts';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, MAX_DATE_MS, validateState, type GameState } from '../../../src/core/state.ts';
import { createCosmeticRng } from '../../../src/render/clock.ts';

const NOW = 1_763_400_000_000;
/** A state as it comes out of a save: JSON (Big values as strings). */
const plain = (s: GameState): unknown => JSON.parse(JSON.stringify(s)) as unknown;

/** Marks a key to delete in `variant`. */
const REMOVE = Symbol('remove');
type Edit = readonly [path: string, value: unknown];

/** A new game's JSON with `edits` applied: each sets (or REMOVEs) the value at a dotted path — also invalid values. */
function variant(...edits: Edit[]): unknown {
  const root = plain(createInitialState({ seed: 7, now: NOW }));
  for (const [path, value] of edits) {
    const keys = path.split('.');
    const last = keys.pop() ?? '';
    let node: unknown = root;
    for (const k of keys) node = (node as Record<string, unknown>)[k];
    const target = node as Record<string, unknown>;
    if (value === REMOVE) Reflect.deleteProperty(target, last);
    else target[last] = value;
  }
  return root;
}

describe('createInitialState (M1-04)', () => {
  const s = createInitialState({ seed: 0xdeadbeef, now: NOW });

  it('starts a new game: all buildings at 0, start ducats from content, time set to now, the seed kept', () => {
    for (const id of FARM_BUILDING_IDS) expect(s.village.levels[id]).toBe(0);
    for (const id of SICH_BUILDING_IDS) expect(s.village.sichLevels[id]).toBe(0);
    expect(s.currencies.ducats.toNumber()).toBe(START.ducats);
    expect(s.currencies.glory.isZero()).toBe(true);
    expect(s.time).toEqual({ lastSeen: NOW, maxSeen: NOW, created: NOW });
    expect(s.seed).toBe(0xdeadbeef);
    expect(s.rng.state).toBe(0xdeadbeef);
    expect(s.returnReport).toBeNull();
    expect(s.village.mechanic).toEqual({ kind: 'wind', stormsSurvived: 0 });
  });

  it('round-trips through JSON and validateState unchanged', () => {
    const r = validateState(plain(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(plain(r.state)).toEqual(plain(s));
  });
});

describe('validateState: the save gate (M1-04)', () => {
  const rejects = (raw: unknown): string => {
    const r = validateState(raw);
    expect(r.ok, 'should be rejected').toBe(false);
    return r.ok ? '' : `${r.error.reason} at ${r.error.path}`;
  };

  it('accepts a mid-game state (levels, Big strings, a return report)', () => {
    const r = validateState(
      variant(
        ['village.levels.field', 37],
        ['village.sichLevels.walls', 12],
        ['currencies.ducats', '1.5e42'],
        ['currencies.glory', '12345.5'],
        ['army.infantry', 14],
        [
          'returnReport',
          { awaySec: 30000, countedSec: 28800, capped: true, reason: 'normal', ducats: '9e20', glory: '400' },
        ],
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.village.levels.field).toBe(37);
      expect(r.state.currencies.ducats.eq(Big.fromString('1.5e42') ?? Big.ZERO)).toBe(true);
      expect(r.state.returnReport?.capped).toBe(true);
    }
  });

  it('rejects an unknown key, at any depth', () => {
    expect(rejects(variant(['cheat', true]))).toMatch(/^unknownKey at cheat/);
    expect(rejects(variant(['village.levels.castle', 3]))).toMatch(/^unknownKey at village\.levels\.castle/);
  });

  it('rejects __proto__ / constructor / prototype keys (prototype pollution)', () => {
    // JSON.parse creates an own "__proto__" key (as a hostile save would); assignment would not.
    const polluted = JSON.parse(
      JSON.stringify(plain(createInitialState({ seed: 1, now: NOW }))).replace(
        '"stats":{',
        '"stats":{"__proto__":{"isAdmin":true},',
      ),
    ) as unknown;
    expect(rejects(polluted)).toMatch(/^forbiddenKey at stats\.__proto__/);
    expect(rejects(variant(['settings.constructor', {}]))).toMatch(/^forbiddenKey/);
  });

  it('rejects a missing key', () => {
    expect(rejects(variant(['currencies.glory', REMOVE]))).toMatch(/^missing at currencies\.glory/);
    expect(rejects(variant(['village.levels.fair', REMOVE]))).toMatch(/^missing at village\.levels\.fair/);
  });

  it('rejects levels out of range or not whole', () => {
    expect(rejects(variant(['village.levels.field', FARM.levelMax + 1]))).toMatch(/^range at village\.levels\.field/);
    expect(rejects(variant(['village.levels.field', -1]))).toMatch(/^range/);
    expect(rejects(variant(['village.levels.field', 2.5]))).toMatch(/^range/);
    expect(rejects(variant(['village.sichLevels.church', SICH.levelMax + 1]))).toMatch(
      /^range at village\.sichLevels\.church/,
    );
  });

  it('rejects malformed or negative Big values', () => {
    expect(rejects(variant(['currencies.ducats', 'abc']))).toMatch(/^bigFormat at currencies\.ducats/);
    expect(rejects(variant(['currencies.ducats', 'NaN']))).toMatch(/^bigFormat/);
    expect(rejects(variant(['currencies.ducats', 1000]))).toMatch(/^type at currencies\.ducats/);
    expect(rejects(variant(['currencies.glory', '-5']))).toMatch(/^range at currencies\.glory/);
  });

  it('rejects broken times, seeds and enums', () => {
    expect(rejects(variant(['time.lastSeen', null]))).toMatch(/^type at time\.lastSeen/); // NaN becomes null in JSON
    expect(rejects(variant(['time.lastSeen', Number.NaN]))).toMatch(/^type at time\.lastSeen/);
    expect(rejects(variant(['time.lastSeen', -1]))).toMatch(/^range at time\.lastSeen/);
    expect(rejects(variant(['time.maxSeen', NOW - 1]))).toMatch(/^range at time\.maxSeen/);
    expect(rejects(variant(['seed', 2 ** 32]))).toMatch(/^range at seed/);
    expect(rejects(variant(['settings.lang', 'ru']))).toMatch(/^range at settings\.lang/);
    expect(rejects(variant(['village.id', 'moon']))).toMatch(/^range at village\.id/);
    expect(rejects(variant(['returnReport', { reason: 'normal' }]))).toMatch(/^missing at returnReport/);
  });

  it('rejects a version it does not own (migrations come first) and non-objects', () => {
    expect(rejects(variant(['version', 2]))).toMatch(/^version at version/);
    expect(rejects(null)).toMatch(/^type at \$/);
    expect(rejects('{}')).toMatch(/^type at \$/);
    expect(rejects([])).toMatch(/^type at \$/);
  });

  it('never throws, whatever it is given', () => {
    for (const raw of [undefined, 0, true, { version: 1 }, { version: 1, currencies: 5 }, new Array(3)]) {
      expect(() => validateState(raw)).not.toThrow();
    }
  });
});

describe('validateState: security review (M1-04)', () => {
  const reason = (raw: unknown): string => {
    const r = validateState(raw);
    return r.ok ? 'ok' : `${r.error.reason} at ${r.error.path}`;
  };

  it('rejects Big values a save may not hold: past SAVE_MAX_EXPONENT they would throw on the first arithmetic', () => {
    const huge = `1e${String(SAVE_MAX_EXPONENT + 1)}`;
    const tiny = `1e-${String(SAVE_MAX_EXPONENT + 1)}`;
    expect(reason(variant(['currencies.ducats', huge]))).toBe('range at currencies.ducats');
    expect(reason(variant(['village.lifetimeDucats', tiny]))).toBe('range at village.lifetimeDucats');
    expect(reason(variant(['currencies.ducats', `1e${String(SAVE_MAX_EXPONENT)}`]))).toBe('ok');
    // What passes the gate survives the arithmetic the game does on it.
    const r = validateState(variant(['currencies.ducats', `1e${String(SAVE_MAX_EXPONENT)}`]));
    if (r.ok) expect(() => r.state.currencies.ducats.mul(1e300).mul(1e300)).not.toThrow();
  });

  it('checks the version before the keys: a newer save with new fields reads as "version", not "unknownKey"', () => {
    expect(reason(variant(['version', 2], ['newField', 1]))).toBe('version at version');
    expect(reason(variant(['version', 2], ['stats', REMOVE]))).toBe('version at version');
  });

  it('keeps the return report self-consistent: counted ≤ away and ≤ the offline ceiling', () => {
    const report = (awaySec: number, countedSec: number): unknown =>
      variant(['returnReport', { awaySec, countedSec, capped: false, reason: 'normal', ducats: '0', glory: '0' }]);
    expect(reason(report(100, 100))).toBe('ok');
    expect(reason(report(1, 9e15))).toBe('range at returnReport.countedSec');
    expect(reason(report(1e9, OFFLINE.ceilingSec + 1))).toBe('range at returnReport.countedSec');
  });

  it('caps times at the Date range and keeps created ≤ lastSeen ≤ maxSeen', () => {
    expect(reason(variant(['time.maxSeen', MAX_DATE_MS + 1]))).toBe('range at time.maxSeen');
    expect(reason(variant(['time.created', NOW + 1], ['time.maxSeen', NOW + 5]))).toBe('range at time.created');
  });

  it('fuzz: a thousand seeded corruptions of a valid save never throw and always give ok or a typed error', () => {
    const rng = createCosmeticRng(2026);
    const junk: readonly unknown[] = [null, -1, 2.5, 'x', '1e999', true, [], {}, { __proto__: 1 }, Number.NaN, 2 ** 60];
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)] as T;
    const paths = [
      'version',
      'seed',
      'rng.state',
      'time.lastSeen',
      'time.maxSeen',
      'time.created',
      'currencies.ducats',
      'currencies.glory',
      'currencies.regalia',
      'village.id',
      'village.levels.field',
      'village.sichLevels.walls',
      'village.lifetimeDucats',
      'village.mechanic.kind',
      'army.infantry',
      'returnReport',
      'stats.taps',
      'settings.lang',
      'settings.numberFormat',
      'extra',
    ];
    const reasons = new Set([
      'type',
      'missing',
      'unknownKey',
      'forbiddenKey',
      'range',
      'bigFormat',
      'version',
      'internal',
    ]);
    for (let i = 0; i < 1000; i++) {
      const edits: Edit[] = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => [
        pick(paths),
        rng() < 0.2 ? REMOVE : pick(junk),
      ]);
      let r: ReturnType<typeof validateState> | undefined;
      expect(() => (r = validateState(variant(...edits)))).not.toThrow();
      if (r && !r.ok) expect(reasons.has(r.error.reason), r.error.reason).toBe(true);
    }
  });
});
