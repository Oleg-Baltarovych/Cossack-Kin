// Debug URL params (plan M0-05, SPEC §12.2). Dev/test builds only: render/index.ts imports this module
// behind `__CK_DEBUG__`, so it is tree-shaken out of production. Any mode outside DEBUG_MODES still
// returns defaults as a second line of defence. URL values are untrusted (security.md): length-capped,
// strictly parsed, finite, and only known keys are read.
import { isDebugMode } from './modes.ts';
import {
  QUALITIES,
  SEASONS,
  WEATHERS,
  ZONES,
  type Quality,
  type RenderSettings,
  type Season,
  type Weather,
  type Zone,
} from '../settings.ts';
import type { ZoomLevel } from '../viewport.ts';

export interface DebugParams {
  /** Cosmetic RNG seed; `null` = random. */
  readonly seed: number | null;
  /** Time of day 'HH:MM'; `null` = local time. */
  readonly time: string | null;
  readonly weather: Weather;
  readonly season: Season;
  readonly zone: Zone;
  /** `false` = live animation; a number = animation frozen at that many seconds (`?freeze` = 0). */
  readonly freeze: false | number;
  /** `null` = automatic. */
  readonly quality: Quality | null;
  readonly overlay: boolean;
  /** Initial camera x in logical px; `null` = scene default. */
  readonly cam: number | null;
  /** Start at the closer zoom level (`?zoom=1`, M2-03). */
  readonly zoom: ZoomLevel;
  /** «Менше руху»: still plants. */
  readonly still: boolean;
  /** Every villager animation in two rows instead of the agents (M2-17 review shots). */
  readonly lineup: boolean;
}

export const DEBUG_DEFAULTS: DebugParams = {
  seed: null,
  time: null,
  weather: 'clear',
  season: 'summer',
  zone: 'farm',
  freeze: false,
  quality: null,
  overlay: false,
  cam: null,
  zoom: 0,
  still: false,
  lineup: false,
};

type Parser<T> = (raw: string) => T | undefined;

/** Longest raw value accepted for any param; longer values are rejected before parsing. */
export const MAX_PARAM_LENGTH = 16;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const TRUE_FLAGS = new Set(['', '1', 'true']);
const FALSE_FLAGS = new Set(['0', 'false']);

const oneOf =
  <T extends string>(values: readonly T[]): Parser<T> =>
  (raw) =>
    values.find((v) => v === raw);

const parseSeed: Parser<number> = (raw) => {
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
};

const parseTime: Parser<string> = (raw) => {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(raw);
  if (!match) return undefined;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const parseFreeze: Parser<false | number> = (raw) => {
  // A bare flag pins t=0; '1' is read as seconds below.
  if (raw === '' || raw === 'true') return 0;
  if (raw === 'false') return false;
  if (!DECIMAL.test(raw)) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
};

const parseFlag: Parser<boolean> = (raw) => {
  if (TRUE_FLAGS.has(raw)) return true;
  if (FALSE_FLAGS.has(raw)) return false;
  return undefined;
};

const parseCam: Parser<number> = (raw) => {
  if (!DECIMAL.test(raw)) return undefined;
  const x = Number(raw);
  return Number.isFinite(x) ? x : undefined;
};

const parseZoom: Parser<ZoomLevel> = (raw) => (raw === '1' || raw === '' ? 1 : raw === '0' ? 0 : undefined);

export function parseDebugParams(search: string, mode: string): DebugParams {
  if (!isDebugMode(mode)) return DEBUG_DEFAULTS;
  const query = new URLSearchParams(search);

  const read = <K extends keyof DebugParams>(key: K, parse: Parser<DebugParams[K]>): DebugParams[K] => {
    const raw = query.get(key);
    if (raw === null) return DEBUG_DEFAULTS[key];
    const value = raw.length <= MAX_PARAM_LENGTH ? parse(raw) : undefined;
    if (value !== undefined) return value;
    // Raw value as a format argument, never inside the format string.
    console.warn('debug param %s=%o is invalid; using default %o', key, raw, DEBUG_DEFAULTS[key]);
    return DEBUG_DEFAULTS[key];
  };

  return {
    seed: read('seed', parseSeed),
    time: read('time', parseTime),
    weather: read('weather', oneOf(WEATHERS)),
    season: read('season', oneOf(SEASONS)),
    zone: read('zone', oneOf(ZONES)),
    freeze: read('freeze', parseFreeze),
    quality: read('quality', oneOf(QUALITIES)),
    overlay: read('overlay', parseFlag),
    cam: read('cam', parseCam),
    zoom: read('zoom', parseZoom),
    still: read('still', parseFlag),
    lineup: read('lineup', parseFlag),
  };
}

/** 'HH:MM' → minutes after midnight. */
export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

export function toRenderSettings(params: DebugParams): RenderSettings {
  return {
    seed: params.seed,
    frozenAt: params.freeze === false ? null : params.freeze,
    fixedMinutes: params.time === null ? null : timeToMinutes(params.time),
    weather: params.weather,
    season: params.season,
    zone: params.zone,
    quality: params.quality,
    showOverlay: params.overlay,
    camX: params.cam,
    zoom: params.zoom,
    lessMotion: params.still,
    lineup: params.lineup,
  };
}
