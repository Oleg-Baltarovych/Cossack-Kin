// GameState v1 (SPEC §9.3; plan §0, M1-04): only the fields M1 uses — later fields come with a version bump and a
// migration. Derived values (kharch, defence, tier, wind, «unlocked») are computed, never stored.
// `validateState` is the gate a save passes through: it takes the JSON form (Big values as strings), rejects anything
// it does not know, and returns a typed error instead of throwing (rules: save.md, security.md).
import { FARM, OFFLINE, SICH, START, TAP } from '../content/economy.ts';
import { SAVE_MAX_EXPONENT } from '../content/numbers.ts';
import { SICH_BUILDING_IDS, type SichBuildingId } from '../content/sich.ts';
import { FARM_BUILDING_IDS, type FarmBuildingId } from '../content/villages/khortytsia.ts';
import { Big } from './big.ts';
import { createRng, type Rng } from './rng.ts';

export const STATE_VERSION = 1;
export const LANGS = ['uk', 'en'] as const;
export const NUMBER_FORMATS = ['words', 'short'] as const;
export const RETURN_REASONS = ['normal', 'clockBack', 'forwardJump'] as const;

export type Lang = (typeof LANGS)[number];
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export interface VillageState {
  readonly id: 'khortytsia';
  readonly levels: Readonly<Record<FarmBuildingId, number>>;
  readonly sichLevels: Readonly<Record<SichBuildingId, number>>;
  readonly lifetimeDucats: Big;
  readonly mechanic: { readonly kind: 'wind'; readonly stormsSurvived: number };
}

/** What the player earned while away, kept until `claimReturn` (plan §0: room for the M8 doubling). */
export interface ReturnReport {
  readonly awaySec: number;
  readonly countedSec: number;
  readonly capped: boolean;
  readonly reason: (typeof RETURN_REASONS)[number];
  readonly ducats: Big;
  readonly glory: Big;
}

export interface GameState {
  readonly version: typeof STATE_VERSION;
  /** uint32; the new game's seed comes from the platform layer (crypto), never from the core. */
  readonly seed: number;
  readonly rng: Rng;
  /** Milliseconds (epoch). `maxSeen` ≥ `lastSeen`: the clock-cheat guard (SPEC §3.8). */
  readonly time: { readonly lastSeen: number; readonly maxSeen: number; readonly created: number };
  readonly currencies: {
    readonly ducats: Big;
    readonly glory: Big;
    readonly regalia: number;
    readonly pysanky: number;
  };
  readonly village: VillageState;
  readonly army: { readonly infantry: number };
  readonly returnReport: ReturnReport | null;
  readonly stats: { readonly taps: number; readonly purchases: number };
  /** Taps counted in the current second (TAP.maxPerSec, plan Q8): the second's start (ms) and the count so far. */
  readonly tapWindow: { readonly start: number; readonly count: number };
  readonly settings: { readonly lang: Lang; readonly numberFormat: NumberFormat };
}

function zeros<K extends string>(ids: readonly K[]): Record<K, number> {
  const out: Partial<Record<K, number>> = {};
  for (const id of ids) out[id] = 0;
  return out as Record<K, number>;
}

/** A new game at `now` (ms) with `seed` (any integer, taken as uint32). */
export function createInitialState({ seed, now }: { seed: number; now: number }): GameState {
  const s = seed >>> 0;
  return {
    version: STATE_VERSION,
    seed: s,
    rng: createRng(s),
    time: { lastSeen: now, maxSeen: now, created: now },
    currencies: { ducats: Big.from(START.ducats), glory: Big.ZERO, regalia: 0, pysanky: 0 },
    village: {
      id: 'khortytsia',
      levels: zeros(FARM_BUILDING_IDS),
      sichLevels: zeros(SICH_BUILDING_IDS),
      lifetimeDucats: Big.ZERO,
      mechanic: { kind: 'wind', stormsSurvived: 0 },
    },
    army: { infantry: 0 },
    returnReport: null,
    stats: { taps: 0, purchases: 0 },
    tapWindow: { start: now, count: 0 },
    settings: { lang: START.lang, numberFormat: START.numberFormat },
  };
}

// --- validation ------------------------------------------------------------------------------------------------

/** `internal`: an unexpected exception inside the validator (a bug, never the player's fault). */
export type StateErrorReason =
  'type' | 'missing' | 'unknownKey' | 'forbiddenKey' | 'range' | 'bigFormat' | 'version' | 'internal';
export interface StateError {
  readonly reason: StateErrorReason;
  /** Dotted path of the offending value (`$` = the root). */
  readonly path: string;
}
export type ValidateResult =
  { readonly ok: true; readonly state: GameState } | { readonly ok: false; readonly error: StateError };

/** Thrown inside the validator only; `validateState` turns it into a result. */
class Invalid extends Error {
  readonly detail: StateError;
  constructor(detail: StateError) {
    super(`${detail.reason} at ${detail.path}`);
    this.detail = detail;
  }
}
function fail(reason: StateErrorReason, path: string): never {
  throw new Invalid({ reason, path });
}

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
/** Largest whole number accepted for counters: Number's exact-integer range. */
const MAX_INT = Number.MAX_SAFE_INTEGER;
/** Largest time (ms) a Date can hold: beyond it formatting a time throws. */
export const MAX_DATE_MS = 8.64e15;
const UINT32_MAX = 0xffffffff;

type Obj = Readonly<Record<string, unknown>>;

/** A plain object with exactly `keys`: none unknown, none forbidden, none missing. */
function object(value: unknown, path: string, keys: readonly string[]): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('type', path);
  const o = value as Obj;
  for (const k of Object.keys(o)) {
    if (FORBIDDEN.has(k)) fail('forbiddenKey', `${path}.${k}`);
    if (!keys.includes(k)) fail('unknownKey', `${path}.${k}`);
  }
  for (const k of keys) if (!Object.prototype.hasOwnProperty.call(o, k)) fail('missing', `${path}.${k}`);
  return o;
}

function int(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail('type', path);
  if (!Number.isInteger(value) || value < min || value > max) fail('range', path);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail('type', path);
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (typeof value !== 'string') return fail('type', path);
  const found = options.find((o) => o === value);
  return found ?? fail('range', path);
}

/** A non-negative Big from its save string. */
function big(value: unknown, path: string): Big {
  if (typeof value !== 'string') return fail('type', path);
  const b = Big.fromString(value) ?? fail('bigFormat', path);
  if (b.lt(0)) fail('range', path);
  // Tighter than Big's own bound: what passes here survives the game's arithmetic (security review M1-04).
  if (!b.isZero() && Math.abs(b.log10()) > SAVE_MAX_EXPONENT) fail('range', path);
  return b;
}

function levels<K extends string>(value: unknown, path: string, ids: readonly K[], max: number): Record<K, number> {
  const o = object(value, path, ids);
  const out: Partial<Record<K, number>> = {};
  for (const id of ids) out[id] = int(o[id], `${path}.${id}`, 0, max);
  return out as Record<K, number>;
}

function parseReport(value: unknown): ReturnReport | null {
  if (value === null) return null;
  const p = '$.returnReport';
  const r = object(value, p, ['awaySec', 'countedSec', 'capped', 'reason', 'ducats', 'glory']);
  const awaySec = int(r['awaySec'], `${p}.awaySec`, 0, MAX_INT);
  return {
    awaySec,
    // Counted time is never more than the time away, nor more than the offline ceiling.
    countedSec: int(r['countedSec'], `${p}.countedSec`, 0, Math.min(awaySec, OFFLINE.ceilingSec)),
    capped: bool(r['capped'], `${p}.capped`),
    reason: oneOf(r['reason'], `${p}.reason`, RETURN_REASONS),
    ducats: big(r['ducats'], `${p}.ducats`),
    glory: big(r['glory'], `${p}.glory`),
  };
}

const ROOT_KEYS = [
  'version',
  'seed',
  'rng',
  'time',
  'currencies',
  'village',
  'army',
  'returnReport',
  'stats',
  'tapWindow',
  'settings',
] as const;

function parse(raw: unknown): GameState {
  // The version first: a newer save (with fields this build does not know) must read as 'version', so the loader can
  // tell the player to update instead of overwriting it (save.md).
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return fail('type', '$');
  if ((raw as Obj)['version'] !== STATE_VERSION) fail('version', '$.version');
  const root = object(raw, '$', ROOT_KEYS);
  const t = object(root['time'], '$.time', ['lastSeen', 'maxSeen', 'created']);
  const lastSeen = int(t['lastSeen'], '$.time.lastSeen', 0, MAX_DATE_MS);
  const maxSeen = int(t['maxSeen'], '$.time.maxSeen', lastSeen, MAX_DATE_MS);
  const created = int(t['created'], '$.time.created', 0, lastSeen);
  const c = object(root['currencies'], '$.currencies', ['ducats', 'glory', 'regalia', 'pysanky']);
  const v = object(root['village'], '$.village', ['id', 'levels', 'sichLevels', 'lifetimeDucats', 'mechanic']);
  const m = object(v['mechanic'], '$.village.mechanic', ['kind', 'stormsSurvived']);
  const army = object(root['army'], '$.army', ['infantry']);
  const stats = object(root['stats'], '$.stats', ['taps', 'purchases']);
  const settings = object(root['settings'], '$.settings', ['lang', 'numberFormat']);
  const tw = object(root['tapWindow'], '$.tapWindow', ['start', 'count']);
  return {
    version: STATE_VERSION,
    seed: int(root['seed'], '$.seed', 0, UINT32_MAX),
    rng: { state: int(object(root['rng'], '$.rng', ['state'])['state'], '$.rng.state', 0, UINT32_MAX) },
    time: { lastSeen, maxSeen, created },
    currencies: {
      ducats: big(c['ducats'], '$.currencies.ducats'),
      glory: big(c['glory'], '$.currencies.glory'),
      regalia: int(c['regalia'], '$.currencies.regalia', 0, MAX_INT),
      pysanky: int(c['pysanky'], '$.currencies.pysanky', 0, MAX_INT),
    },
    village: {
      id: oneOf(v['id'], '$.village.id', ['khortytsia'] as const),
      levels: levels(v['levels'], '$.village.levels', FARM_BUILDING_IDS, FARM.levelMax),
      sichLevels: levels(v['sichLevels'], '$.village.sichLevels', SICH_BUILDING_IDS, SICH.levelMax),
      lifetimeDucats: big(v['lifetimeDucats'], '$.village.lifetimeDucats'),
      mechanic: {
        kind: oneOf(m['kind'], '$.village.mechanic.kind', ['wind'] as const),
        stormsSurvived: int(m['stormsSurvived'], '$.village.mechanic.stormsSurvived', 0, MAX_INT),
      },
    },
    army: { infantry: int(army['infantry'], '$.army.infantry', 0, MAX_INT) },
    returnReport: parseReport(root['returnReport']),
    stats: {
      taps: int(stats['taps'], '$.stats.taps', 0, MAX_INT),
      purchases: int(stats['purchases'], '$.stats.purchases', 0, MAX_INT),
    },
    tapWindow: {
      start: int(tw['start'], '$.tapWindow.start', 0, MAX_DATE_MS),
      count: int(tw['count'], '$.tapWindow.count', 0, TAP.maxPerSec),
    },
    settings: {
      lang: oneOf(settings['lang'], '$.settings.lang', LANGS),
      numberFormat: oneOf(settings['numberFormat'], '$.settings.numberFormat', NUMBER_FORMATS),
    },
  };
}

/** `$.a.b` → `a.b` (the root stays `$`). */
const clean = (path: string): string => (path === '$' ? '$' : path.replace(/^\$\./, ''));

/** Checks a save's JSON form and builds the state from it; never throws (a typed error instead). */
export function validateState(raw: unknown): ValidateResult {
  try {
    return { ok: true, state: parse(raw) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: { reason: e.detail.reason, path: clean(e.detail.path) } };
    return { ok: false, error: { reason: 'internal', path: '$' } };
  }
}
