// Autosave (SPEC §9.5): every SAVE_EVERY_MS, and at once after an important step — M3-16 adds a raid's start and claim,
// so a squad on the road or a claimed chest is never lost to a closed tab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../../../src/core/events.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { SAVE_EVERY_MS, startAutosave } from '../../../src/platform/autosave.ts';
import type { Saver } from '../../../src/platform/saves.ts';

const NOW = 1_780_315_800_000;

function fakeStore(state: GameState) {
  const listeners = new Set<(events: readonly GameEvent[]) => void>();
  return {
    getState: () => state,
    onEvents(l: (events: readonly GameEvent[]) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** One commit: all its events in one batch, as the store delivers them. */
    emit: (...events: GameEvent[]) => {
      for (const l of listeners) l(events);
    },
  };
}

function spySaver(): Saver & { saved: GameState[] } {
  const saved: GameState[] = [];
  return { enabled: true, failures: () => 0, save: (s) => saved.push(s), saved };
}

const STARTED: GameEvent = { type: 'RaidStarted', slot: 0, region: 'samara', tier: 'm5', returnAt: NOW };
const CLAIMED = (state: GameState): GameEvent => ({
  type: 'RaidClaimed',
  slot: 0,
  tier: 'm5',
  region: 'samara',
  success: true,
  granted: { ducats: state.currencies.ducats, glory: state.currencies.glory, pysanky: 0 },
  relic: null,
});

describe('autosave (SPEC §9.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves every SAVE_EVERY_MS and stops on the stop function', () => {
    const store = fakeStore(createInitialState({ seed: 1, now: NOW }));
    const saver = spySaver();
    const stop = startAutosave(store, saver);
    vi.advanceTimersByTime(SAVE_EVERY_MS * 2);
    expect(saver.saved).toHaveLength(2);
    stop();
    vi.advanceTimersByTime(SAVE_EVERY_MS * 2);
    store.emit(STARTED);
    expect(saver.saved).toHaveLength(2);
  });

  it('saves at once after a raid starts and after it is claimed (M3-16)', () => {
    const state = createInitialState({ seed: 1, now: NOW });
    const store = fakeStore(state);
    const saver = spySaver();
    startAutosave(store, saver);
    store.emit(STARTED);
    expect(saver.saved).toEqual([state]);
    store.emit(CLAIMED(state));
    expect(saver.saved).toHaveLength(2);
  });

  it('a raid that only comes back (time, not the player) waits for the interval', () => {
    const store = fakeStore(createInitialState({ seed: 1, now: NOW }));
    const saver = spySaver();
    startAutosave(store, saver);
    store.emit({ type: 'RaidReturned', slot: 0, region: 'samara', success: true });
    expect(saver.saved).toHaveLength(0);
  });

  it('one commit with two important events writes once («Ще раз»: claim + start; M3-16 review)', () => {
    const state = createInitialState({ seed: 1, now: NOW });
    const store = fakeStore(state);
    const saver = spySaver();
    startAutosave(store, saver);
    store.emit(CLAIMED(state), STARTED);
    expect(saver.saved).toHaveLength(1);
  });
});
