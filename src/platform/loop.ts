// The game loop driver (SPEC §9.2; plan M1-17/M1-18). The core never reads the clock: this is where wall time enters.
// While running it ticks at 10 Hz; `start` (through `resume`) and `stop` each tick once, so the state is current the moment the page
// hides or comes back. When the loop is stopped, time is not lost — the next tick counts the gap through `applyOffline`
// (with its caps), which is how a hidden page becomes an absence. lifecycle.ts decides when to start and stop.
import type { GameStore } from '../core/store.ts';

/** Ticks per second (SPEC §9.2). */
export const LOOP_HZ = 10;
const MS_PER_SEC = 1000;

export interface LoopOptions {
  readonly now?: () => number;
  readonly hz?: number;
}

export interface Loop {
  readonly running: () => boolean;
  start(): void;
  stop(): void;
}

export function createLoop(store: GameStore, { now = Date.now, hz = LOOP_HZ }: LoopOptions = {}): Loop {
  let id: ReturnType<typeof setInterval> | null = null;
  const step = (): void => {
    store.tick(now());
  };
  return {
    running: () => id !== null,
    start() {
      if (id !== null) return;
      // The first tick back reports a clock set back; the running ticks stay quiet about it.
      store.resume(now());
      id = setInterval(step, MS_PER_SEC / hz);
    },
    stop() {
      if (id === null) return;
      clearInterval(id);
      id = null;
      step();
    },
  };
}

/** A new game's seed: uint32 from the platform CSPRNG (the core takes it as data, SPEC §9.1). */
export function newSeed(): number {
  const out = new Uint32Array(1);
  crypto.getRandomValues(out);
  return out[0] ?? 0;
}
