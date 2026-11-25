// Autosave (SPEC §9.5; plan M1-13): every SAVE_EVERY_MS, and at once after an important step — a new tier (a building
// reached a milestone), a hired Cossack, a claimed return, a raid started or claimed (M3-16).
// Pausing the page saves too (lifecycle.ts `onPause`).
import type { GameEvent } from '../core/events.ts';
import type { GameStore } from '../core/store.ts';
import type { Saver } from './saves.ts';

/** SPEC §9.5: every 10 s. */
export const SAVE_EVERY_MS = 10_000;

const IMPORTANT: ReadonlySet<GameEvent['type']> = new Set([
  'TierReached',
  'CossackHired',
  'ReturnClaimed',
  'RaidStarted',
  'RaidClaimed',
]);

/** Starts saving `store` through `saver`; returns the stop function. */
export function startAutosave(store: Pick<GameStore, 'getState' | 'onEvents'>, saver: Saver): () => void {
  const save = (): void => {
    saver.save(store.getState());
  };
  const id = setInterval(save, SAVE_EVERY_MS);
  // One write per commit (a claim and a start of «Ще раз» are one): the batch arrives after the state changed, so
  // getState() is the new state.
  const off = store.onEvents((events) => {
    if (events.some((e) => IMPORTANT.has(e.type))) save();
  });
  return () => {
    clearInterval(id);
    off();
  };
}
