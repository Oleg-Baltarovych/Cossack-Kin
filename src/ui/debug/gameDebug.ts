// Dev/test game presets for screenshots (plan M1-17; M1-19 adds `showcase`). Only reached behind `__CK_DEBUG__`, so
// production drops it. URL values are untrusted: one known key, an allowlist of values, the shared length cap.
//   ?state=fresh|rich|mid|away|showcase — a new game (rich: with 1M ducats, its welcome beat seen), a mid-land farm, that farm back after 9 h away (the return window),
//                     or every plot built to the tier the M-ART scene shows (the e2e world shots use it)
//   ?state=raids      — the «Походи» block (M3-09; the full M3-16 preset may replace it): the mid farm whose army found a
//                     relic on 30-min raids (within a time budget), then squad 1 back from a 5-min scouting and squad 2
//                     on a 30-min one (back RAIDS_PRESET.leftMin after the preset's `now`) — all through the real actions
//   ?state=tiers&tier=N — every building at visual tier N (0 = empty plots … 6; the Sich tops out at IV, plan M2-05),
//                     locked ones too (the church at I–II: the scene ignores unlock conditions); invalid N: the top tier
//   ?freeze           — the game clock stands still (no loop) at FROZEN_NOW, so numbers and the wind are fixed
//   ?seed=<n>         — the game seed (the same param seeds the cosmetic RNG)
//   ?lang=uk|en       — the starting language
//   ?ui=0             — no DOM UI: world-only screenshots (the e2e helper adds it unless a test asks for ui=1)
import { START, TIER_LEVELS } from '../../content/economy.ts';
import { applyAction, type Action } from '../../core/actions.ts';
import { advance } from '../../core/advance.ts';
import { SICH_BUILDINGS } from '../../content/sich.ts';
import { FARM_BUILDING_IDS } from '../../content/villages/khortytsia.ts';
import { Big } from '../../core/big.ts';
import { createInitialState, LANGS, type GameState, type Lang } from '../../core/state.ts';
import { newQuests } from '../../core/systems/quests.ts';
import { dueBeats } from '../../core/systems/story.ts';
import type { GameStore } from '../../core/store.ts';
import { tier } from '../../core/economy.ts';
import { maxCossacks, sichUnlocked, villageOf } from '../../core/modifiers.ts';
import { visualTiers, type VisualTiers } from '../../core/selectors.ts';
import { applyOffline } from '../../core/offline.ts';
import { isDebugMode } from '../../render/debug/modes.ts';
import { MAX_PARAM_LENGTH, parseDebugParams } from '../../render/debug/params.ts';

const OFF_FLAGS: readonly string[] = ['0', 'false'];

export const PRESETS = ['fresh', 'rich', 'mid', 'away', 'showcase', 'tiers', 'raids'] as const;
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

/** Window onto the game for e2e (dev/test builds only; `pnpm check:dist` fails if it reaches dist/). */
export interface GameDebugHandle {
  /** The current state as its save JSON (Big → string), for `validateState` on the test side. */
  readonly state: () => string;
  /**
   * A player action through the store, as the UI would send it (M2-24: claiming a quest before its UI, M2-25). The
   * core still validates it; returns the event types it produced. Only `Action`s reach the store, and none of them grants
   * an ad reward or a purchase (those come from the SDK/billing callbacks, M8), so the hook cannot bypass those gates.
   */
  readonly dispatch: (action: Action) => readonly string[];
}

declare global {
  interface Window {
    __CK_GAME__?: GameDebugHandle;
  }
}

/** Exposes `store` as `window.__CK_GAME__`; returns the uninstall function. */
export function installGameDebug(store: GameStore, now: () => number): () => void {
  const handle: GameDebugHandle = {
    state: () => JSON.stringify(store.getState()),
    dispatch: (action) => store.dispatch(action, now()).map((e) => e.type),
  };
  window.__CK_GAME__ = handle;
  return () => {
    if (window.__CK_GAME__ === handle) delete window.__CK_GAME__;
  };
}

/**
 * Every plot at the tier the M-ART scene was made at: the potter's khata III (level 25), the windmill; in the Sich the
 * second kurin, cannon and tower and the belfry (Sich tier II = level 10). The church needs every farm building at 25.
 */
/**
 * The host of `showcase` and `tiers` (≥ the 16 the scene shows, plan Q11), held to what the food feeds (M2-30): play
 * never hires past `maxCossacks` (`canHire`), so showcase has 37, tiers I and II 2 and 21.
 */
const SHOWCASE_ARMY = 40;

const fedHost = (s: GameState): GameState => ({ ...s, army: { infantry: Math.min(SHOWCASE_ARMY, maxCossacks(s)) } });

function showcase(s: GameState): GameState {
  const farm = Object.fromEntries(Object.keys(s.village.levels).map((id) => [id, 25]));
  const sich = Object.fromEntries(Object.keys(s.village.sichLevels).map((id) => [id, id === 'cannonry' ? 0 : 10]));
  return fedHost({
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(2.5e9), glory: Big.from(4_200) },
    village: {
      ...s.village,
      levels: { ...s.village.levels, ...farm },
      sichLevels: { ...s.village.sichLevels, ...sich },
    },
  });
}

/**
 * Every building at visual tier `n` (plan M2-05): the level where tier n starts (content TIER_LEVELS), the Sich capped
 * at its top tier. A Sich building the game keeps locked has no level (M2-30: play cannot buy it) — the church below
 * farm level 25, one held back for a later land; the scene shows the church anyway through `tiersIgnoringUnlocks`.
 */
function atTier(s: GameState, n: number): GameState {
  const level = (levels: readonly number[]): number => (n === 0 ? 0 : (levels[Math.min(n, levels.length) - 1] ?? 0));
  const levels = {
    ...s.village.levels,
    ...Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, level(TIER_LEVELS.farm)])),
  };
  const facts = { village: { ...s.village, levels } };
  const sich = Object.fromEntries(
    SICH_BUILDINGS.map((b) => [b.id, sichUnlocked(b, facts) ? level(TIER_LEVELS.sich) : 0]),
  );
  // A full host on the scene (M2-19): the Sich's people at the tier shown — its guards, both fires — as with `showcase`.
  return fedHost({ ...s, village: { ...s.village, levels, sichLevels: { ...s.village.sichLevels, ...sich } } });
}

/**
 * `?state=tiers` only: every Sich building of the land at the Sich's tier, even one the game keeps locked and the
 * preset leaves unbuilt (the church before farm level 25). Buildings of a later land stay empty.
 */
export function tiersIgnoringUnlocks(s: GameState): VisualTiers {
  const land = villageOf(s).number;
  const out = { ...visualTiers(s) };
  const sichTier = Math.max(...SICH_BUILDINGS.map((b) => tier(s.village.sichLevels[b.id], TIER_LEVELS.sich)));
  for (const b of SICH_BUILDINGS) {
    const later = b.unlock.kind === 'land' && b.unlock.land > land;
    out[b.id] = later ? 0 : sichTier;
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

/** `?state=showcase` only: no visitors (plan M2-21) — the M-ART scene, and the people shots taken on it, stay as judged. */
export const noVisitors = (): null => null;

const MIN_MS = 60_000;
/**
 * `?state=raids`: the army hired up to `infantry` (30-min raids start from 10 power), raids of 30 min until a relic is
 * found (the pity makes it the 4th success at the latest; at chance 0.6 that is well inside `historyMin`), within a
 * time budget that leaves room for the two final starts — then squad 1 sent on a 5-min scouting `backMin` before
 * `now`'s 5 minutes ran out and squad 2 on a 30-min patrol that is back `leftMin` after `now`.
 */
const RAIDS_PRESET = { infantry: 12, historyMin: 12 * 60, backMin: 3, leftMin: 18 } as const;

function withRaids(seed: number, now: number): GameState {
  const m30 = 30 * MIN_MS;
  const m5 = 5 * MIN_MS;
  // The two final starts: squad 2's patrol (back `leftMin` after now), then squad 1's scouting (back `backMin` before).
  const patrolAt = now - m30 + RAIDS_PRESET.leftMin * MIN_MS;
  const scoutAt = now - m5 - RAIDS_PRESET.backMin * MIN_MS;
  let t = now - RAIDS_PRESET.historyMin * MIN_MS;
  let s = presetState('mid', seed, t);
  const step = (action: Action, at: number): void => {
    s = applyAction(s, action, at).state;
  };
  step({ type: 'hire', n: RAIDS_PRESET.infantry - s.army.infantry }, t);
  // 30-min raids on squad 1 until a relic comes, while one more still ends before the final starts (time budget).
  while (s.relics.length === 0 && t + m30 <= patrolAt) {
    step({ type: 'startRaid', slot: 0, tier: 'm30' }, t);
    t += m30;
    step({ type: 'claimRaid', slot: 0 }, t);
  }
  step({ type: 'startRaid', slot: 1, tier: 'm30' }, patrolAt);
  step({ type: 'startRaid', slot: 0, tier: 'm5' }, scoutAt);
  return advance(s, now).state;
}

/** The state of `preset` at `now` with `seed` (`tier`: the visual tier of `state=tiers`). */
export function presetState(preset: Preset, seed: number, now: number, tier = TOP_TIER): GameState {
  if (preset === 'raids') return withRaids(seed, now);
  if (preset === 'away') return applyOffline(presetState('mid', seed, now - AWAY_MS), now).state;
  const s = createInitialState({ seed, now });
  if (preset === 'fresh') return s;
  // Nothing built yet, but a purse for the first buildings (e2e: a purchase puts a building on its empty plot). The
  // welcome beat («Берег Дніпра») counts as seen: its modal (M2-25) would cover the first purchase of every rich shot.
  if (preset === 'rich')
    return earned({
      ...s,
      currencies: { ...s.currencies, ducats: Big.from(1e6), glory: Big.from(1e3) },
      story: { seen: dueBeats(s, s.story.seen).map((b) => b.id) },
    });
  if (preset === 'showcase') return played(showcase(s));
  if (preset === 'tiers') return played(atTier(s, tier));
  return played({
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(48_500), glory: Big.from(140) },
    village: {
      ...s.village,
      levels: { ...s.village.levels, field: 32, garden: 26, apiary: 14, windmill: 10, potter: 3 },
      sichLevels: { ...s.village.sichLevels, kurins: 3, walls: 2, maidan: 1 },
    },
    army: { infantry: 6 },
  });
}

/**
 * A preset of a game already played (M2-22): its Cossacks counted as hired and the story beats it has reached seen,
 * as the v1 → v2 migration does (levels bought = Σ levels) — the first click must not fire the beats (and their glory) of a past it never had.
 * Its quests start as the v2 → v3 migration starts them (M2-23): the chain on the first step not met yet. M2-30: one
 * purchase per building standing (the fewest that buy its levels), and its ducats earned (`earned`).
 */
function played(s: GameState): GameState {
  const all = [...Object.values(s.village.levels), ...Object.values(s.village.sichLevels)];
  const stats = {
    ...s.stats,
    hires: s.army.infantry,
    purchases: all.filter((l) => l > 0).length,
    levelsBought: all.reduce((a, b) => a + b, 0),
  };
  const due = dueBeats({ ...s, stats }, s.story.seen).map((b) => b.id);
  const quests = newQuests({ ...s, stats }, s.seed, s.time.maxSeen, s.settings.tzOffsetMin);
  return earned({ ...s, stats, story: { seen: [...s.story.seen, ...due] }, quests });
}

/** The purse of a preset as income (M2-30): play only adds ducats through `lifetimeDucats`, past the start money. */
function earned(s: GameState): GameState {
  const income = s.currencies.ducats.sub(START.ducats);
  const lifetimeDucats = income.gt(s.village.lifetimeDucats) ? income : s.village.lifetimeDucats;
  return { ...s, village: { ...s.village, lifetimeDucats } };
}
