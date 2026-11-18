// Starting the game (plan M1-13): load the player's save (or start fresh), build the store, pick the clock. Runs once
// in main.tsx before React renders, so a StrictMode double mount never loads twice. Debug presets (dev/test only)
// play in memory: a screenshot state must never be saved over the player's game.
import { createInitialState } from '../core/state.ts';
import { createStore, type GameStore } from '../core/store.ts';
import { newSeed } from '../platform/loop.ts';
import { bootGame, createSaver, type BootNotice, type Saver } from '../platform/saves.ts';
import { memoryStorage, webStorage } from '../platform/storage.ts';
import { FROZEN_NOW, parseGameDebug, presetState } from './debug/gameDebug.ts';

export interface Game {
  readonly store: GameStore;
  readonly now: () => number;
  /** false: `?freeze` — the clock stands still, no loop, no autosave. */
  readonly live: boolean;
  /** false: `?ui=0` (world-only screenshots). */
  readonly ui: boolean;
  readonly saver: Saver;
  /** What to tell the player about the save (damaged, restored, from a newer game). */
  readonly notice: BootNotice;
}

export async function initGame(): Promise<Game> {
  if (__CK_DEBUG__) {
    const d = parseGameDebug(window.location.search, import.meta.env.MODE);
    if (d.preset || d.frozen) {
      const seed = d.seed ?? newSeed();
      const now = d.frozen ? () => FROZEN_NOW : Date.now;
      const base = d.preset ? presetState(d.preset, seed, now()) : createInitialState({ seed, now: now() });
      const state = d.lang ? { ...base, settings: { ...base.settings, lang: d.lang } } : base;
      const saver = createSaver(memoryStorage(), null);
      return { store: createStore(state), now, live: !d.frozen, ui: d.ui, saver, notice: 'none' };
    }
  }
  const now = Date.now;
  const boot = await bootGame(webStorage(), () => createInitialState({ seed: newSeed(), now: now() }));
  return { store: createStore(boot.state), now, live: true, ui: true, saver: boot.saver, notice: boot.notice };
}
