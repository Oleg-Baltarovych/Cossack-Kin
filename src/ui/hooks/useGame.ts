// The UI's window onto the store (SPEC §9.2; .claude/rules/ui.md). `useGame(selector, isEqual)` subscribes through
// `useSyncExternalStore` and keeps the previous value while `isEqual` says nothing changed, so a component re-renders
// only when its own slice does (10 Hz ticks change the ducats, not every row). The selectors are the core's
// (src/core/selectors.ts): the UI never computes economy. `useAct` dispatches with the provider's clock.
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Action } from '../../core/actions.ts';
import type { GameEvent } from '../../core/events.ts';
import { Big } from '../../core/big.ts';
import type { GameState } from '../../core/state.ts';
import type { GameStore } from '../../core/store.ts';

interface GameContext {
  readonly store: GameStore;
  readonly now: () => number;
}

const Context = createContext<GameContext | null>(null);

export function GameProvider({
  store,
  now = Date.now,
  children,
}: {
  store: GameStore;
  now?: () => number;
  children: ReactNode;
}) {
  const value = useRef<GameContext>({ store, now });
  if (value.current.store !== store || value.current.now !== now) value.current = { store, now };
  return createElement(Context.Provider, { value: value.current }, children);
}

function useGameContext(): GameContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useGame: no <GameProvider> above this component');
  return ctx;
}

/** Field-by-field equality of two plain views; `Big` fields compare by value. */
export function sameView<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  // Object.keys widens to string[]; the views are plain objects whose own keys are exactly keyof T.
  const keys = Object.keys(a) as (keyof T)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return x instanceof Big && y instanceof Big ? x.eq(y) : Object.is(x, y);
  });
}

type Primitive = string | number | boolean | bigint | null | undefined;

/**
 * A primitive slice compares with Object.is. An object slice must pass `isEqual` (`sameView`, …): selectors build a
 * fresh object every call, and without an equality React would see a new snapshot on every read and loop.
 */
export function useGame<T extends Primitive>(selector: (state: GameState) => T): T;
export function useGame<T>(selector: (state: GameState) => T, isEqual: (a: T, b: T) => boolean): T;
export function useGame<T>(selector: (state: GameState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  // `cache` is written inside getSnapshot (during render): idempotent for the same state and selector, so a
  // StrictMode or concurrent re-render reads the same value. Stable selectors (useCallback) keep it a hit.
  const { store } = useGameContext();
  const cache = useRef<{ state: GameState; selector: (state: GameState) => T; value: T } | null>(null);
  const getSnapshot = (): T => {
    const state = store.getState();
    const prev = cache.current;
    if (prev?.state === state && prev.selector === selector) return prev.value;
    const next = selector(state);
    const value = prev && isEqual(prev.value, next) ? prev.value : next;
    cache.current = { state, selector, value };
    return value;
  };
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Reads the state on demand, for handlers that need it once (coins measure an income against the rate now, M2-26):
 * no subscription, no re-render. Never call it during render — `useGame` is for that.
 */
export function useGameReader(): () => GameState {
  const { store } = useGameContext();
  return useCallback(() => store.getState(), [store]);
}

/** Dispatches a player action at the provider's `now`; returns its events (a tap shows its number from `Tapped`). */
export function useAct(): (action: Action) => readonly GameEvent[] {
  const { store, now } = useGameContext();
  return useCallback((action: Action) => store.dispatch(action, now()), [store, now]);
}

/**
 * Calls `listener` with every game event (plan M2-12: the tier banner reacts to `TierReached` from any action) and
 * the state right after it. The UI only reads here, never dispatches back.
 */
export function useGameEvent(listener: (e: GameEvent, state: GameState) => void): void {
  const { store } = useGameContext();
  // The latest listener, read at event time: the subscription itself depends only on the store.
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(
    () =>
      store.onEvent((e) => {
        latest.current(e, store.getState());
      }),
    [store],
  );
}
