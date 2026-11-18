// Page lifecycle (SPEC §3.8, rules/platform.md «pause → save; resume → applyOffline → return window»; plan M1-18).
// A hidden page is away: browsers only throttle background timers, so the loop is stopped on `visibilitychange`
// hidden and on `pagehide`, and the first tick back counts the gap through `applyOffline` — the return window then
// shows the report. `onPause` is where the save goes (M1-13). Capacitor pause/resume map onto the same calls in M9.
import type { GameStore } from '../core/store.ts';
import { createLoop, type LoopOptions } from './loop.ts';

export interface DriveOptions extends LoopOptions {
  /** Called once each time the game pauses (page hidden or leaving). */
  readonly onPause?: () => void;
}

/** Runs the loop while the page is visible; returns the stop function. */
export function driveGame(store: GameStore, options: DriveOptions = {}): () => void {
  const loop = createLoop(store, options);
  const pause = (): void => {
    if (!loop.running()) return;
    loop.stop();
    options.onPause?.();
  };
  const resume = (): void => {
    loop.start();
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') resume();
    else pause();
  };
  // A page restored from the back/forward cache fires pageshow without a visibility change.
  const onPageShow = (): void => {
    if (document.visibilityState === 'visible') resume();
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', onPageShow);
  if (document.visibilityState === 'visible') resume();

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', pause);
    window.removeEventListener('pageshow', onPageShow);
    loop.stop();
  };
}
