// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { startLoop } from '../../../src/platform/loop.ts';

const T0 = 1_763_400_000_000;

afterEach(() => {
  vi.useRealTimers();
});

describe('startLoop (M1-17)', () => {
  it('ticks the store at 10 Hz with the injected clock, and stops', () => {
    vi.useFakeTimers();
    const s = createInitialState({ seed: 3, now: T0 });
    const store = createStore({ ...s, village: { ...s.village, levels: { ...s.village.levels, field: 10 } } });
    let now = T0;
    const stop = startLoop(store, { now: () => now });
    now += 1000;
    vi.advanceTimersByTime(1000);
    expect(store.getState().time.lastSeen).toBe(now);
    stop();
    now += 1000;
    vi.advanceTimersByTime(1000);
    expect(store.getState().time.lastSeen).toBe(T0 + 1000);
  });

  it('a long gap is counted and its income credited at once (no return window until M1-18)', () => {
    vi.useFakeTimers();
    const s = createInitialState({ seed: 3, now: T0 });
    const store = createStore({ ...s, village: { ...s.village, levels: { ...s.village.levels, field: 10 } } });
    const now = T0 + 3600_000;
    const stop = startLoop(store, { now: () => now });
    vi.advanceTimersByTime(100);
    stop();
    expect(store.getState().returnReport).toBeNull();
    expect(store.getState().currencies.ducats.gt(Big.from(1000))).toBe(true);
  });
});
