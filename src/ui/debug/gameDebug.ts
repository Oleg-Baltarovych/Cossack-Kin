// Dev/test game presets for screenshots (plan M1-17; M1-19 adds `showcase`). Only reached behind `__CK_DEBUG__`, so
// production drops it. URL values are untrusted: one known key, an allowlist of values, the shared length cap.
//   ?state=fresh|mid  — a new game or a mid-land farm
//   ?freeze           — the game clock stands still (no loop) at FROZEN_NOW, so numbers and the wind are fixed
//   ?seed=<n>         — the game seed (the same param seeds the cosmetic RNG)
//   ?ui=0             — no DOM UI: world-only screenshots (the e2e helper adds it unless a test asks for ui=1)
import { Big } from '../../core/big.ts';
import { createInitialState, type GameState } from '../../core/state.ts';
import { isDebugMode } from '../../render/debug/modes.ts';
import { MAX_PARAM_LENGTH, parseDebugParams } from '../../render/debug/params.ts';

const OFF_FLAGS: readonly string[] = ['0', 'false'];

export const PRESETS = ['fresh', 'mid'] as const;
export type Preset = (typeof PRESETS)[number];

/** 2026-06-01 12:00 UTC: the fixed game clock of `?freeze`. */
export const FROZEN_NOW = 1_780_315_200_000;

export interface GameDebug {
  readonly preset: Preset | null;
  readonly frozen: boolean;
  readonly seed: number | null;
  /** false: `?ui=0`. */
  readonly ui: boolean;
}

const NO_DEBUG: GameDebug = { preset: null, frozen: false, seed: null, ui: true };

export function parseGameDebug(search: string, mode: string): GameDebug {
  // Second line of defence (the caller is already behind __CK_DEBUG__): a release mode reads nothing.
  if (!isDebugMode(mode)) return NO_DEBUG;
  const render = parseDebugParams(search, mode);
  const query = new URLSearchParams(search);
  const raw = query.get('state');
  const preset = raw !== null && raw.length <= MAX_PARAM_LENGTH ? (PRESETS.find((p) => p === raw) ?? null) : null;
  if (raw !== null && preset === null) console.warn('debug param state=%o is invalid; using a new game', raw);
  const ui = !OFF_FLAGS.includes(query.get('ui') ?? '');
  return { preset, frozen: render.freeze !== false, seed: render.seed, ui };
}

/** The state of `preset` at `now` with `seed`. */
export function presetState(preset: Preset, seed: number, now: number): GameState {
  const s = createInitialState({ seed, now });
  if (preset === 'fresh') return s;
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(48_500), glory: Big.from(140) },
    village: {
      ...s.village,
      levels: { ...s.village.levels, field: 32, garden: 26, apiary: 14, windmill: 10, potter: 3 },
      sichLevels: { ...s.village.sichLevels, kurins: 3, walls: 2, maidan: 1 },
    },
    army: { infantry: 6 },
  };
}
