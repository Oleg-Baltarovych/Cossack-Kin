// The game store (SPEC §9.2; plan §0, M1-12). It holds the one GameState, applies actions and ticks through the pure
// core, and tells the outside world: `subscribe` for the UI (`useSyncExternalStore`: a stable snapshot, a new object
// only on change) and `onEvent` for render and audio, which react but never write state. The clock and the 10 Hz loop
// live in src/platform; the store only takes `now`.
// Every change goes through `tick` first, so the first click after a long absence counts that absence through
// `applyOffline` (with its caps) — an action can never integrate an uncapped gap.
import { applyAction, type Action } from './actions.ts';
import type { GameEvent } from './events.ts';
import { resume as resumeCore, tick as tickCore } from './offline.ts';
import type { GameState } from './state.ts';

export interface GameStore {
  /** The current state; the same object until something changes. */
  getState(): GameState;
  /** Applies a player action at `now` (ms); returns its events (also delivered to `onEvent`). */
  dispatch(action: Action, now: number): readonly GameEvent[];
  /** Moves time to `now` (the platform loop calls it at 10 Hz). */
  tick(now: number): readonly GameEvent[];
  /** The first tick after the page comes back or a save loads: also reports a clock set back (`clockBack`). */
  resume(now: number): readonly GameEvent[];
  /** Replaces the whole state (a loaded save or a reset); emits StateReplaced. */
  replace(state: GameState): void;
  /** Called after every state change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Called with every event, in order; returns the unsubscribe function. */
  onEvent(listener: (event: GameEvent) => void): () => void;
  /**
   * Called once per change that has events, with all of them, after every `onEvent` listener saw them (one action's
   * claims open one window — M3-12); returns the unsubscribe function.
   */
  onEvents(listener: (events: readonly GameEvent[]) => void): () => void;
}

export function createStore(initial: GameState): GameStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: GameEvent) => void>();
  const batchListeners = new Set<(events: readonly GameEvent[]) => void>();

  const commit = (next: GameState, events: readonly GameEvent[]): readonly GameEvent[] => {
    const changed = next !== state;
    state = next;
    for (const e of events) for (const l of [...eventListeners]) l(e);
    if (events.length > 0) for (const l of [...batchListeners]) l(events);
    if (changed) for (const l of [...listeners]) l();
    return events;
  };

  const tick = (now: number): readonly GameEvent[] => {
    const r = tickCore(state, now);
    return commit(r.state, r.events);
  };

  return {
    getState: () => state,
    tick,
    resume(now) {
      const r = resumeCore(state, now);
      return commit(r.state, r.events);
    },
    dispatch(action, now) {
      const moved = tickCore(state, now);
      const r = applyAction(moved.state, action, now);
      return commit(r.state, [...moved.events, ...r.events]);
    },
    replace(next) {
      commit(next, [{ type: 'StateReplaced' }]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onEvents(listener) {
      batchListeners.add(listener);
      return () => batchListeners.delete(listener);
    },
  };
}
