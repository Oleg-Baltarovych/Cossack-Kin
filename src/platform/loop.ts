// The game loop driver (SPEC §9.2; plan M1-17, extended in M1-18 with autosave and lifecycle). The core never reads
// the clock: this is where wall time enters. 10 Hz ticks, plus one immediately when the page becomes visible again,
// so a return is counted at once rather than on the next interval.
import type { GameStore } from '../core/store.ts';

/** Ticks per second (SPEC §9.2). */
export const LOOP_HZ = 10;
const MS_PER_SEC = 1000;

export interface LoopOptions {
  readonly now?: () => number;
  readonly hz?: number;
}

/** Starts ticking `store`; returns the stop function. */
export function startLoop(store: GameStore, { now = Date.now, hz = LOOP_HZ }: LoopOptions = {}): () => void {
  const step = (): void => {
    store.tick(now());
    // TODO(M1-18): the return window replaces this. Until then the offline income is claimed at once, so it is never
    // left pending (tests/unit/platform/loop.test.ts pins it).
    if (store.getState().returnReport) store.dispatch({ type: 'claimReturn' }, now());
  };
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') step();
  };
  const id = setInterval(step, MS_PER_SEC / hz);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** A new game's seed: uint32 from the platform CSPRNG (the core takes it as data, SPEC §9.1). */
export function newSeed(): number {
  const out = new Uint32Array(1);
  crypto.getRandomValues(out);
  return out[0] ?? 0;
}
