// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE } from '../../../src/content/economy.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { driveGame } from '../../../src/platform/lifecycle.ts';
import { createLoop } from '../../../src/platform/loop.ts';

const T0 = 1_763_400_000_000;
let visibility: DocumentVisibilityState = 'visible';

function farm(): GameState {
  const s = createInitialState({ seed: 3, now: T0 });
  return { ...s, village: { ...s.village, levels: { ...s.village.levels, field: 10 } } };
}

function setVisibility(v: DocumentVisibilityState): void {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createLoop (M1-18)', () => {
  it('start ticks at once and then at 10 Hz with the injected clock; stop ticks once more and halts', () => {
    const store = createStore(farm());
    const clock = { now: T0 + 50 };
    const loop = createLoop(store, { now: () => clock.now });
    loop.start();
    expect(store.getState().time.lastSeen).toBe(T0 + 50);
    clock.now = T0 + 1050;
    vi.advanceTimersByTime(1000);
    expect(store.getState().time.lastSeen).toBe(T0 + 1050);
    clock.now = T0 + 1100;
    loop.stop();
    expect(store.getState().time.lastSeen).toBe(T0 + 1100);
    clock.now = T0 + 9000;
    vi.advanceTimersByTime(5000);
    expect(store.getState().time.lastSeen).toBe(T0 + 1100);
  });

  it('start with the clock set back reports clockBack once; the running ticks do not repeat it', () => {
    const store = createStore(farm());
    const clock = { now: T0 - 10 * 60_000 };
    const loop = createLoop(store, { now: () => clock.now });
    loop.start();
    expect(store.getState().returnReport?.reason).toBe('clockBack');
    store.dispatch({ type: 'claimReturn' }, clock.now);
    vi.advanceTimersByTime(2000);
    expect(store.getState().returnReport).toBeNull();
    expect(store.getState().time.lastSeen).toBe(T0);
    loop.stop();
  });

  it('start twice keeps one interval (a second start does not double the ticks)', () => {
    const store = createStore(farm());
    let ticks = 0;
    const counting: GameStore = {
      ...store,
      tick: (now) => {
        ticks += 1;
        return store.tick(now);
      },
    };
    const loop = createLoop(counting, { now: () => T0 });
    loop.start();
    loop.start();
    ticks = 0;
    vi.advanceTimersByTime(1000);
    expect(ticks).toBe(10);
    loop.stop();
  });
});

describe('driveGame: the page lifecycle (M1-18)', () => {
  it('a hidden page is away: no ticks while hidden, the return counts it through offline and waits in the report', () => {
    const store = createStore(farm());
    const clock = { now: T0 };
    const stop = driveGame(store, { now: () => clock.now });
    setVisibility('hidden');
    const hiddenAt = store.getState();
    clock.now = T0 + 2 * 60_000;
    vi.advanceTimersByTime(2 * 60_000);
    expect(store.getState()).toBe(hiddenAt);
    setVisibility('visible');
    const report = store.getState().returnReport;
    expect(report?.awaySec).toBe(120);
    expect(report?.ducats.gt(0)).toBe(true);
    // Not credited behind the player's back: the return window claims it.
    expect(store.getState().currencies.ducats.eq(hiddenAt.currencies.ducats)).toBe(true);
    stop();
  });

  it(`an absence under returnMinSec (${String(OFFLINE.returnMinSec)} s) earns straight in, without a report`, () => {
    const store = createStore(farm());
    const clock = { now: T0 };
    const stop = driveGame(store, { now: () => clock.now });
    setVisibility('hidden');
    const before = store.getState().currencies.ducats;
    clock.now = T0 + (OFFLINE.returnMinSec - 30) * 1000;
    setVisibility('visible');
    expect(store.getState().returnReport).toBeNull();
    expect(store.getState().currencies.ducats.gt(before)).toBe(true);
    stop();
  });

  it('pagehide pauses and calls onPause (the save hook); a page that starts hidden does not tick', () => {
    const store = createStore(farm());
    const onPause = vi.fn();
    visibility = 'hidden';
    const clock = { now: T0 + 500 };
    const stop = driveGame(store, { now: () => clock.now, onPause });
    vi.advanceTimersByTime(1000);
    expect(store.getState().time.lastSeen).toBe(T0);
    setVisibility('visible');
    expect(store.getState().time.lastSeen).toBe(T0 + 500);
    window.dispatchEvent(new Event('pagehide'));
    expect(onPause).toHaveBeenCalledOnce();
    clock.now = T0 + 5000;
    vi.advanceTimersByTime(5000);
    expect(store.getState().time.lastSeen).toBe(T0 + 500);
    stop();
  });

  it('hidden then pagehide (both fire when a tab closes) pause once; a bfcache pageshow resumes and counts the gap', () => {
    const store = createStore(farm());
    const onPause = vi.fn();
    const clock = { now: T0 };
    const stop = driveGame(store, { now: () => clock.now, onPause });
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    expect(onPause).toHaveBeenCalledOnce();
    clock.now = T0 + 10 * 60_000;
    visibility = 'visible';
    window.dispatchEvent(new Event('pageshow'));
    expect(store.getState().returnReport?.awaySec).toBe(600);
    setVisibility('hidden');
    expect(onPause).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stop removes the listeners and the interval', () => {
    const store = createStore(farm());
    const clock = { now: T0 };
    const stop = driveGame(store, { now: () => clock.now });
    stop();
    clock.now = T0 + 3000;
    vi.advanceTimersByTime(3000);
    setVisibility('hidden');
    setVisibility('visible');
    expect(store.getState().time.lastSeen).toBe(T0);
  });
});
