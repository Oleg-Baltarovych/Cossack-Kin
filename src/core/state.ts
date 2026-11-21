// GameState v3 (SPEC §9.3; plan §0, M1-04, M2-22, M2-23): v2 = v1 + `story` and the quest counters in `stats`; v3 adds
// `quests` and `settings.tzOffsetMin` — later fields come
// with a version bump and a migration (save/migrations). Derived values (kharch, defence, tier, wind, «unlocked») are computed, never stored.
// `validateState` is the gate a save passes through: it takes the JSON form (Big values as strings), rejects anything
// it does not know, and returns a typed error instead of throwing (rules: save.md, security.md).
import { FARM, OFFLINE, SICH, START, TAP } from '../content/economy.ts';
import { SAVE_MAX_EXPONENT } from '../content/numbers.ts';
import { CHORE_IDS, CHORES, type ChainStep, type ChoreId, type LevelGoal } from '../content/quests.ts';
import { SICH_BUILDING_IDS, type SichBuildingId } from '../content/sich.ts';
import { STORY_BEAT_IDS, type StoryBeatId } from '../content/story.ts';
import { FARM_BUILDING_IDS, type FarmBuildingId } from '../content/villages/khortytsia.ts';
import { Big } from './big.ts';
import { createRng, type Rng } from './rng.ts';
import { chainSteps, dayAt, newQuests } from './systems/quests.ts';

export const STATE_VERSION = 3;
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

/** Monotone counters (SPEC §3.10: quests count from them; story `hired` reads `hires`). */
export interface Stats {
  readonly taps: number;
  /** Buy actions (one per press, whatever the amount). */
  readonly purchases: number;
  /** Farm and Sich levels bought, all told. */
  readonly levelsBought: number;
  /** Cossacks hired, all told (never lowered by losses). */
  readonly hires: number;
  /** Seconds of income earned by taps: each tap adds its income share (TAP.incomeShare). */
  readonly tapIncomeSec: number;
}

/**
 * The active step of «Наказ кошового» (SPEC §3.10): a listed step of the land's chain (`base` = the counted stat when
 * it began, for a count goal), a generated one (its goal fixed when it began), or none left (every building at max).
 * The chain is the one of `village.id` (not stored twice). A crafted `index` pointing back at an earlier step is
 * accepted (SPEC §9.5: an export is trusted, checksum is no anti-cheat): it only replays small rewards in order.
 */
export type ChainState =
  | { readonly kind: 'listed'; readonly index: number; readonly base: number }
  | { readonly kind: 'generated'; readonly goal: LevelGoal }
  | { readonly kind: 'done' };

/** The active chore: `n` chores began before it; `claims` were claimed on the local `day` (SPEC §3.9). */
export interface ChoresState {
  readonly day: number;
  readonly n: number;
  readonly active: ChoreId;
  readonly base: number;
  readonly claims: number;
}

export interface QuestsState {
  readonly chain: ChainState;
  readonly chores: ChoresState;
}

export interface Settings {
  readonly lang: Lang;
  readonly numberFormat: NumberFormat;
  /** Local time minus UTC, in minutes (the platform writes it at start and on return, plan Q9): the quest day. */
  readonly tzOffsetMin: number;
}

/** Time zones run from UTC−12 to UTC+14 (minutes). */
export const TZ_OFFSET_MIN = { min: -12 * 60, max: 14 * 60 } as const;

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
  readonly stats: Stats;
  /** Story beats already fired, in firing order (SPEC §2.5): each fires once. */
  readonly story: { readonly seen: readonly StoryBeatId[] };
  /** «Наказ кошового» and the chores (SPEC §3.10); completion is derived from `stats` and the levels. */
  readonly quests: QuestsState;
  /** Taps counted in the current second (TAP.maxPerSec, plan Q8): the second's start (ms) and the count so far. */
  readonly tapWindow: { readonly start: number; readonly count: number };
  readonly settings: Settings;
}

function zeros<K extends string>(ids: readonly K[]): Record<K, number> {
  const out: Partial<Record<K, number>> = {};
  for (const id of ids) out[id] = 0;
  // Every id of `ids` was set just above, so the partial record is complete.
  return out as Record<K, number>;
}

/** A new game at `now` (ms) with `seed` (any integer, taken as uint32). */
export function createInitialState({ seed, now }: { seed: number; now: number }): GameState {
  const s = seed >>> 0;
  const village: VillageState = {
    id: 'khortytsia',
    levels: zeros(FARM_BUILDING_IDS),
    sichLevels: zeros(SICH_BUILDING_IDS),
    lifetimeDucats: Big.ZERO,
    mechanic: { kind: 'wind', stormsSurvived: 0 },
  };
  const stats: Stats = { taps: 0, purchases: 0, levelsBought: 0, hires: 0, tapIncomeSec: 0 };
  return {
    version: STATE_VERSION,
    seed: s,
    rng: createRng(s),
    time: { lastSeen: now, maxSeen: now, created: now },
    currencies: { ducats: Big.from(START.ducats), glory: Big.ZERO, regalia: 0, pysanky: 0 },
    village,
    army: { infantry: 0 },
    returnReport: null,
    stats,
    story: { seen: [] },
    quests: newQuests({ village, stats }, s, now, START.tzOffsetMin),
    tapWindow: { start: now, count: 0 },
    settings: { lang: START.lang, numberFormat: START.numberFormat, tzOffsetMin: START.tzOffsetMin },
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

/** A finite number in [min, max] (not only whole). */
function real(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail('type', path);
  if (value < min || value > max) fail('range', path);
  return value;
}

/**
 * Beat ids, each at most once. An id this build does not know is dropped, not refused: a renamed or removed beat
 * must never brick a save (platform review M2-22); its beat, if it still exists under a new id, fires again once.
 */
function beats(value: unknown, path: string): StoryBeatId[] {
  if (!Array.isArray(value)) return fail('type', path);
  const out: StoryBeatId[] = [];
  value.forEach((v: unknown, i) => {
    const at = `${path}.${String(i)}`;
    if (typeof v !== 'string') fail('type', at);
    const id = STORY_BEAT_IDS.find((known) => known === v);
    if (id === undefined) return;
    if (out.includes(id)) fail('range', at);
    out.push(id);
  });
  return out;
}

/** Bound of the quest counters: far past any real play (a chore a second for 30 years), short of float trouble. */
const MAX_QUEST_COUNT = 1e9;

function levelGoal(value: unknown, path: string): LevelGoal {
  const g = object(value, path, ['kind', 'id', 'level']);
  const kind = oneOf(g['kind'], `${path}.kind`, ['building', 'sich'] as const);
  if (kind === 'building')
    return {
      kind,
      id: oneOf(g['id'], `${path}.id`, FARM_BUILDING_IDS),
      level: int(g['level'], `${path}.level`, 1, FARM.levelMax),
    };
  return {
    kind,
    id: oneOf(g['id'], `${path}.id`, SICH_BUILDING_IDS),
    level: int(g['level'], `${path}.level`, 1, SICH.levelMax),
  };
}

function parseChain(value: unknown, steps: readonly ChainStep[], stats: Stats): ChainState {
  const p = '$.quests.chain';
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('type', p);
  const kind = oneOf((value as Obj)['kind'], `${p}.kind`, ['listed', 'generated', 'done'] as const);
  switch (kind) {
    case 'listed': {
      const c = object(value, p, ['kind', 'index', 'base']);
      const index = int(c['index'], `${p}.index`, 0, steps.length - 1);
      const goal = steps[index]?.goal;
      // A count step counts from `base`: a base above the counter now is a crafted save (counters only grow).
      const max = goal?.kind === 'count' ? stats[goal.stat] : MAX_INT;
      return { kind, index, base: real(c['base'], `${p}.base`, 0, max) };
    }
    case 'generated': {
      const c = object(value, p, ['kind', 'goal']);
      return { kind, goal: levelGoal(c['goal'], `${p}.goal`) };
    }
    case 'done':
      object(value, p, ['kind']);
      return { kind };
  }
}

/** Quests against the counters and the clock they were read with: no base past its counter, no day past `maxSeen`. */
function parseQuests(value: unknown, steps: readonly ChainStep[], stats: Stats, maxSeen: number): QuestsState {
  const q = object(value, '$.quests', ['chain', 'chores']);
  const p = '$.quests.chores';
  const c = object(q['chores'], p, ['day', 'n', 'active', 'base', 'claims']);
  const active = oneOf(c['active'], `${p}.active`, CHORE_IDS);
  const stat = CHORES.pool.find((d) => d.id === active)?.goal.stat;
  return {
    chain: parseChain(q['chain'], steps, stats),
    chores: {
      // The easternmost zone's day of maxSeen, +1 for a zone change on the boundary.
      day: int(c['day'], `${p}.day`, 0, dayAt(maxSeen, TZ_OFFSET_MIN.max) + 1),
      n: int(c['n'], `${p}.n`, 0, MAX_QUEST_COUNT),
      active,
      base: real(c['base'], `${p}.base`, 0, stat === undefined ? MAX_INT : stats[stat]),
      claims: int(c['claims'], `${p}.claims`, 0, MAX_QUEST_COUNT),
    },
  };
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
  // Every id of `ids` was set just above (or the parse failed), so the partial record is complete.
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
  'story',
  'quests',
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
  const infantry = int(army['infantry'], '$.army.infantry', 0, MAX_INT);
  const stats = object(root['stats'], '$.stats', ['taps', 'purchases', 'levelsBought', 'hires', 'tapIncomeSec']);
  const story = object(root['story'], '$.story', ['seen']);
  const settings = object(root['settings'], '$.settings', ['lang', 'numberFormat', 'tzOffsetMin']);
  const tw = object(root['tapWindow'], '$.tapWindow', ['start', 'count']);
  const landId = oneOf(v['id'], '$.village.id', ['khortytsia'] as const);
  const counters: Stats = {
    taps: int(stats['taps'], '$.stats.taps', 0, MAX_INT),
    purchases: int(stats['purchases'], '$.stats.purchases', 0, MAX_INT),
    levelsBought: int(stats['levelsBought'], '$.stats.levelsBought', 0, MAX_INT),
    // Every Cossack in the army was hired: fewer hires than infantry is a crafted save (losses only lower infantry).
    hires: int(stats['hires'], '$.stats.hires', infantry, MAX_INT),
    tapIncomeSec: real(stats['tapIncomeSec'], '$.stats.tapIncomeSec', 0, MAX_INT),
  };
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
      id: landId,
      levels: levels(v['levels'], '$.village.levels', FARM_BUILDING_IDS, FARM.levelMax),
      sichLevels: levels(v['sichLevels'], '$.village.sichLevels', SICH_BUILDING_IDS, SICH.levelMax),
      lifetimeDucats: big(v['lifetimeDucats'], '$.village.lifetimeDucats'),
      mechanic: {
        kind: oneOf(m['kind'], '$.village.mechanic.kind', ['wind'] as const),
        stormsSurvived: int(m['stormsSurvived'], '$.village.mechanic.stormsSurvived', 0, MAX_INT),
      },
    },
    army: { infantry },
    returnReport: parseReport(root['returnReport']),
    stats: counters,
    story: { seen: beats(story['seen'], '$.story.seen') },
    quests: parseQuests(root['quests'], chainSteps({ village: { id: landId } }), counters, maxSeen),
    tapWindow: {
      start: int(tw['start'], '$.tapWindow.start', 0, MAX_DATE_MS),
      count: int(tw['count'], '$.tapWindow.count', 0, TAP.maxPerSec),
    },
    settings: {
      lang: oneOf(settings['lang'], '$.settings.lang', LANGS),
      numberFormat: oneOf(settings['numberFormat'], '$.settings.numberFormat', NUMBER_FORMATS),
      tzOffsetMin: int(settings['tzOffsetMin'], '$.settings.tzOffsetMin', TZ_OFFSET_MIN.min, TZ_OFFSET_MIN.max),
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
