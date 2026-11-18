// Dev/test game presets for screenshots (plan M1-17; M1-19 adds `showcase`). Only reached behind `__CK_DEBUG__`, so
// production drops it. URL values are untrusted: one known key, an allowlist of values, the shared length cap.
//   ?state=fresh|mid|away — a new game, a mid-land farm, or that farm back after 9 h away (the return window)
//   ?freeze           — the game clock stands still (no loop) at FROZEN_NOW, so numbers and the wind are fixed
//   ?seed=<n>         — the game seed (the same param seeds the cosmetic RNG)
//   ?lang=uk|en       — the starting language
//   ?ui=0             — no DOM UI: world-only screenshots (the e2e helper adds it unless a test asks for ui=1)
import { Big } from '../../core/big.ts';
import { createInitialState, LANGS, type GameState, type Lang } from '../../core/state.ts';
import type { GameStore } from '../../core/store.ts';
import { applyOffline } from '../../core/offline.ts';
import { isDebugMode } from '../../render/debug/modes.ts';
import { MAX_PARAM_LENGTH, parseDebugParams } from '../../render/debug/params.ts';

const OFF_FLAGS: readonly string[] = ['0', 'false'];

export const PRESETS = ['fresh', 'mid', 'away'] as const;
export type Preset = (typeof PRESETS)[number];

/** `?state=away`: 9 h, over the 8 h offline limit, so the window shows the cap. */
const AWAY_MS = 9 * 3600_000;

/** 2026-06-01 12:00 UTC: the fixed game clock of `?freeze`. */
export const FROZEN_NOW = 1_780_315_200_000;

export interface GameDebug {
  readonly preset: Preset | null;
  readonly frozen: boolean;
  readonly seed: number | null;
  /** false: `?ui=0`. */
  readonly ui: boolean;
  /** `?lang=uk|en`: the starting language (screenshots of a window that covers the settings). */
  readonly lang: Lang | null;
}

const NO_DEBUG: GameDebug = { preset: null, frozen: false, seed: null, ui: true, lang: null };

export function parseGameDebug(search: string, mode: string): GameDebug {
  // Second line of defence (the caller is already behind __CK_DEBUG__): a release mode reads nothing.
  if (!isDebugMode(mode)) return NO_DEBUG;
  const render = parseDebugParams(search, mode);
  const query = new URLSearchParams(search);
  const raw = query.get('state');
  const preset = raw !== null && raw.length <= MAX_PARAM_LENGTH ? (PRESETS.find((p) => p === raw) ?? null) : null;
  if (raw !== null && preset === null) console.warn('debug param state=%o is invalid; using a new game', raw);
  const ui = !OFF_FLAGS.includes(query.get('ui') ?? '');
  const lang = LANGS.find((l) => l === query.get('lang')) ?? null;
  return { preset, frozen: render.freeze !== false, seed: render.seed, ui, lang };
}

/** Read-only window onto the game for e2e (dev/test builds only; `pnpm check:dist` fails if it reaches dist/). */
export interface GameDebugHandle {
  /** The current state as its save JSON (Big → string), for `validateState` on the test side. */
  readonly state: () => string;
}

declare global {
  interface Window {
    __CK_GAME__?: GameDebugHandle;
  }
}

/** Exposes `store` as `window.__CK_GAME__`; returns the uninstall function. */
export function installGameDebug(store: GameStore): () => void {
  const handle: GameDebugHandle = { state: () => JSON.stringify(store.getState()) };
  window.__CK_GAME__ = handle;
  return () => {
    if (window.__CK_GAME__ === handle) delete window.__CK_GAME__;
  };
}

/** The state of `preset` at `now` with `seed`. */
export function presetState(preset: Preset, seed: number, now: number): GameState {
  if (preset === 'away') return applyOffline(presetState('mid', seed, now - AWAY_MS), now).state;
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
