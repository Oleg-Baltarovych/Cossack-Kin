// Starting the game (plan M1-13): load the player's save (or start fresh), build the store, pick the clock. Runs once
// in main.tsx before React renders, so a StrictMode double mount never loads twice. Debug presets (dev/test only)
// play in memory: a screenshot state must never be saved over the player's game.
import type { PlotVariants, VisualTiers } from '../core/selectors.ts';
import { createInitialState, type GameState } from '../core/state.ts';
import { createStore, type GameStore } from '../core/store.ts';
import { newSeed } from '../platform/loop.ts';
import { mockNotifications, type MockNotifications } from '../platform/notifications.ts';
import { bootGame, createSaver, type BootNotice, type Saver } from '../platform/saves.ts';
import { memoryStorage, webStorage } from '../platform/storage.ts';
import {
  FROZEN_NOW,
  noVariants,
  noVisitors,
  parseGameDebug,
  presetState,
  showcaseTiers,
  tiersIgnoringUnlocks,
} from './debug/gameDebug.ts';

export interface Game {
  readonly store: GameStore;
  readonly now: () => number;
  /** false: `?freeze` — the clock stands still, no loop, no autosave. */
  readonly live: boolean;
  /** false: `?ui=0` (world-only screenshots). */
  readonly ui: boolean;
  readonly saver: Saver;
  /** The «загін повернувся» plan (M3-16): web/dev show nothing; the Capacitor service and the permission come in M6/M9. */
  readonly notifications: MockNotifications;
  /** What to tell the player about the save (damaged, restored, from a newer game). */
  readonly notice: BootNotice;
  /** Dev/test only (`?state=tiers`): the plots' tiers with unlock conditions ignored. */
  readonly sceneTiers?: (state: GameState) => VisualTiers;
  /** Dev/test only (`?state=showcase`): no cosmetic variants, so the M-ART frames stay as signed off. */
  readonly sceneVariants?: (state: GameState) => PlotVariants | null;
  /** Dev/test only (`?state=showcase`): no visitors (M2-21), so the M-ART frames stay as signed off. */
  readonly sceneVisitors?: (state: GameState) => number | null;
}

export async function initGame(): Promise<Game> {
  if (__CK_DEBUG__) {
    const d = parseGameDebug(window.location.search, import.meta.env.MODE);
    if (d.preset || d.frozen) {
      const seed = d.seed ?? newSeed();
      const now = d.frozen ? () => FROZEN_NOW : Date.now;
      const base = d.preset ? presetState(d.preset, seed, now(), d.tier) : createInitialState({ seed, now: now() });
      const state = d.lang ? { ...base, settings: { ...base.settings, lang: d.lang } } : base;
      const saver = createSaver(memoryStorage(), null);
      const sceneTiers =
        d.preset === 'tiers'
          ? { sceneTiers: tiersIgnoringUnlocks }
          : d.preset === 'showcase'
            ? { sceneTiers: showcaseTiers, sceneVariants: noVariants, sceneVisitors: noVisitors }
            : {};
      const notifications = mockNotifications();
      return {
        store: createStore(state),
        now,
        live: !d.frozen,
        ui: d.ui,
        saver,
        notifications,
        notice: 'none',
        ...sceneTiers,
      };
    }
  }
  const now = Date.now;
  const boot = await bootGame(webStorage(), () => createInitialState({ seed: newSeed(), now: now() }));
  return {
    store: createStore(boot.state),
    now,
    live: true,
    ui: true,
    saver: boot.saver,
    notifications: mockNotifications(),
    notice: boot.notice,
  };
}
