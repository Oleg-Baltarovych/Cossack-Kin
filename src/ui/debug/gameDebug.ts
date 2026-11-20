// Dev/test game presets for screenshots (plan M1-17; M1-19 adds `showcase`). Only reached behind `__CK_DEBUG__`, so
// production drops it. URL values are untrusted: one known key, an allowlist of values, the shared length cap.
//   ?state=fresh|rich|mid|away|showcase — a new game (rich: with 1M ducats), a mid-land farm, that farm back after 9 h away (the return window),
//                     or every plot built to the tier the M-ART scene shows (the e2e world shots use it)
//   ?state=tiers&tier=N — every building at visual tier N (0 = empty plots … 6; the Sich tops out at IV, plan M2-05),
//                     locked ones too (the church at I–II: the scene ignores unlock conditions); invalid N: the top tier
//   ?freeze           — the game clock stands still (no loop) at FROZEN_NOW, so numbers and the wind are fixed
//   ?seed=<n>         — the game seed (the same param seeds the cosmetic RNG)
//   ?lang=uk|en       — the starting language
//   ?ui=0             — no DOM UI: world-only screenshots (the e2e helper adds it unless a test asks for ui=1)
import { TIER_LEVELS } from '../../content/economy.ts';
import { SICH_BUILDINGS } from '../../content/sich.ts';
import { Big } from '../../core/big.ts';
import { createInitialState, LANGS, type GameState, type Lang } from '../../core/state.ts';
import type { GameStore } from '../../core/store.ts';
import { tier } from '../../core/economy.ts';
import { villageOf } from '../../core/modifiers.ts';
import { visualTiers, type VisualTiers } from '../../core/selectors.ts';
import { applyOffline } from '../../core/offline.ts';
import { isDebugMode } from '../../render/debug/modes.ts';
import { MAX_PARAM_LENGTH, parseDebugParams } from '../../render/debug/params.ts';

const OFF_FLAGS: readonly string[] = ['0', 'false'];

export const PRESETS = ['fresh', 'rich', 'mid', 'away', 'showcase', 'tiers'] as const;
export type Preset = (typeof PRESETS)[number];

/** `?state=away`: 9 h, over the 8 h offline limit, so the window shows the cap. */
const AWAY_MS = 9 * 3600_000;

/**
 * 2026-06-01 12:10 UTC: the fixed game clock of `?freeze`. Chosen so that seed 1 (every @screens shot) has a breeze —
 * the wind the M-ART frames were judged with (render WIND_STRENGTH.breeze); a pinned test keeps it so.
 */
export const FROZEN_NOW = 1_780_315_800_000;

export interface GameDebug {
  readonly preset: Preset | null;
  readonly frozen: boolean;
  readonly seed: number | null;
  /** false: `?ui=0`. */
  readonly ui: boolean;
  /** `?lang=uk|en`: the starting language (screenshots of a window that covers the settings). */
  readonly lang: Lang | null;
  /** `?tier=N` for `state=tiers`: 0 … the farm's top tier (TIER_LEVELS.farm.length). */
  readonly tier: number;
}

const TOP_TIER = TIER_LEVELS.farm.length;
const NO_DEBUG: GameDebug = { preset: null, frozen: false, seed: null, ui: true, lang: null, tier: TOP_TIER };

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
  // Allowlist of whole tiers 0…top: the raw value is only compared, never parsed.
  const rawTier = query.get('tier');
  const tier = Array.from({ length: TOP_TIER + 1 }, (_, n) => n).find((n) => String(n) === rawTier);
  if (preset === 'tiers' && tier === undefined)
    console.warn('debug param tier=%o is invalid; using the top tier', rawTier);
  return { preset, frozen: render.freeze !== false, seed: render.seed, ui, lang, tier: tier ?? TOP_TIER };
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

/**
 * Every plot at the tier the M-ART scene was made at: the potter's khata III (level 25), the windmill; in the Sich the
 * second kurin, cannon and tower and the belfry (Sich tier II = level 10). The church needs every farm building at 25.
 */
/** The host of `showcase` and `tiers` (≥ the 16 the scene shows, plan Q11). */
const SHOWCASE_ARMY = 40;

function showcase(s: GameState): GameState {
  const farm = Object.fromEntries(Object.keys(s.village.levels).map((id) => [id, 25]));
  const sich = Object.fromEntries(Object.keys(s.village.sichLevels).map((id) => [id, id === 'cannonry' ? 0 : 10]));
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(2.5e9), glory: Big.from(4_200) },
    village: {
      ...s.village,
      levels: { ...s.village.levels, ...farm },
      sichLevels: { ...s.village.sichLevels, ...sich },
    },
    army: { infantry: SHOWCASE_ARMY },
  };
}

/**
 * Every building at visual tier `n` (plan M2-05): the level where tier n starts (content TIER_LEVELS), the Sich capped
 * at its top tier. A Sich building held back for a later land stays empty. The game still keeps the church locked below
 * farm level 25; the scene shows it anyway through `tiersIgnoringUnlocks`.
 */
function atTier(s: GameState, n: number): GameState {
  const land = villageOf(s).number;
  const level = (levels: readonly number[]): number => (n === 0 ? 0 : (levels[Math.min(n, levels.length) - 1] ?? 0));
  const farm = Object.fromEntries(Object.keys(s.village.levels).map((id) => [id, level(TIER_LEVELS.farm)]));
  const sich = Object.fromEntries(
    SICH_BUILDINGS.map((b) => [b.id, b.unlock.kind === 'land' && b.unlock.land > land ? 0 : level(TIER_LEVELS.sich)]),
  );
  return {
    ...s,
    village: {
      ...s.village,
      levels: { ...s.village.levels, ...farm },
      sichLevels: { ...s.village.sichLevels, ...sich },
    },
    // A full host on the scene (M2-19): the Sich's people at the tier shown — its guards, both fires — as with `showcase`.
    army: { infantry: n === 0 ? 0 : SHOWCASE_ARMY },
  };
}

/**
 * `?state=tiers` only: the plots' visual tiers from the levels alone, so every Sich building of the land shows at its
 * tier even while the game keeps it locked (the church before farm level 25). Buildings of a later land stay empty.
 */
export function tiersIgnoringUnlocks(s: GameState): VisualTiers {
  const land = villageOf(s).number;
  const out = { ...visualTiers(s) };
  for (const b of SICH_BUILDINGS) {
    const later = b.unlock.kind === 'land' && b.unlock.land > land;
    out[b.id] = later ? 0 : tier(s.village.sichLevels[b.id], TIER_LEVELS.sich);
  }
  return out;
}

/**
 * `?state=showcase` only: the M-ART scene as it was judged — the windmill drawn at tier I (its M-ART sprite), though
 * the preset levels it to 25 with the rest of the farm (the church needs that). M2-07 drew the windmill's later tiers.
 */
export function showcaseTiers(s: GameState): VisualTiers {
  const out = visualTiers(s);
  return { ...out, windmill: Math.min(out.windmill, 1) };
}

/** `?state=showcase` only: no cosmetic plot variants (plan M2-10) — the M-ART frames were judged without them. */
export const noVariants = (): null => null;

/** The state of `preset` at `now` with `seed` (`tier`: the visual tier of `state=tiers`). */
export function presetState(preset: Preset, seed: number, now: number, tier = TOP_TIER): GameState {
  if (preset === 'away') return applyOffline(presetState('mid', seed, now - AWAY_MS), now).state;
  const s = createInitialState({ seed, now });
  if (preset === 'fresh') return s;
  // Nothing built yet, but a purse for the first buildings (e2e: a purchase puts a building on its empty plot).
  if (preset === 'rich') return { ...s, currencies: { ...s.currencies, ducats: Big.from(1e6), glory: Big.from(1e3) } };
  if (preset === 'showcase') return showcase(s);
  if (preset === 'tiers') return atTier(s, tier);
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
