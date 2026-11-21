import { describe, expect, it } from 'vitest';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { OFFLINE } from '../../../src/content/economy.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';

const T0 = 1_763_400_000_000;

function game(ducats = 1e6): GameState {
  const s = createInitialState({ seed: 31, now: T0 });
  return {
    ...s,
    // Every story beat already seen: beats have their own tests (story.test.ts), these are about the economy.
    story: { seen: [...STORY_BEAT_IDS] },
    currencies: { ...s.currencies, ducats: Big.from(ducats) },
    village: { ...s.village, levels: { ...s.village.levels, field: 20 } },
  };
}

describe('createStore (M1-12)', () => {
  it('getState is a stable snapshot between changes (useSyncExternalStore)', () => {
    const store = createStore(game());
    const a = store.getState();
    expect(store.getState()).toBe(a);
    store.tick(T0); // no time passed: nothing changes
    expect(store.getState()).toBe(a);
    store.tick(T0 + 100);
    expect(store.getState()).not.toBe(a);
  });

  it('subscribers are called only when the state changes, and can unsubscribe', () => {
    const store = createStore(game());
    let calls = 0;
    const off = store.subscribe(() => (calls += 1));
    store.tick(T0);
    expect(calls).toBe(0);
    store.tick(T0 + 100);
    expect(calls).toBe(1);
    store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 100);
    expect(calls).toBe(2);
    off();
    store.tick(T0 + 200);
    expect(calls).toBe(2);
  });

  it('a refused action changes nothing and calls no subscriber, but its ActionRejected event is delivered', () => {
    const store = createStore(game(0));
    let calls = 0;
    store.subscribe(() => (calls += 1));
    const events: GameEvent[] = [];
    store.onEvent((e) => events.push(e));
    const before = store.getState();
    const out = store.dispatch({ type: 'buyBuilding', id: 'fair', mode: 1 }, T0);
    expect(store.getState()).toBe(before);
    expect(calls).toBe(0);
    expect(out.map((e) => e.type)).toEqual(['ActionRejected']);
    expect(events).toEqual(out);
  });

  it('delivers events in the order the core produced them, deterministically', () => {
    const run = (): string[] => {
      const store = createStore(game(1e9));
      const seen: string[] = [];
      store.onEvent((e) => seen.push(e.type));
      store.dispatch({ type: 'buyBuilding', id: 'field', mode: 10 }, T0 + 1000);
      store.dispatch({ type: 'tap' }, T0 + 2000);
      return seen;
    };
    const first = run();
    expect(first).toEqual(['BuildingUpgraded', 'TierReached', 'Tapped']);
    expect(run()).toEqual(first);
  });

  it('an action after a long absence counts the absence through offline first (caps apply, no bypass)', () => {
    const store = createStore(game(0));
    const seen: string[] = [];
    store.onEvent((e) => seen.push(e.type));
    store.dispatch({ type: 'tap' }, T0 + 20 * 3600_000);
    const report = store.getState().returnReport;
    expect(report?.countedSec).toBe(OFFLINE.capSec);
    expect(seen).toEqual(['OfflineApplied', 'Tapped']);
  });

  it('tick with a gap longer than onlineGapSec goes through offline (a return report appears)', () => {
    const store = createStore(game());
    store.tick(T0 + (OFFLINE.onlineGapSec + 1) * 1000 + OFFLINE.returnMinSec * 1000);
    expect(store.getState().returnReport).not.toBeNull();
    const near = createStore(game());
    near.tick(T0 + OFFLINE.onlineGapSec * 1000);
    expect(near.getState().returnReport).toBeNull();
  });

  it('replace swaps the whole state (load / reset) and emits StateReplaced', () => {
    const store = createStore(game());
    const events: string[] = [];
    store.onEvent((e) => events.push(e.type));
    let calls = 0;
    store.subscribe(() => (calls += 1));
    const fresh = createInitialState({ seed: 99, now: T0 });
    store.replace(fresh);
    expect(store.getState()).toBe(fresh);
    expect(calls).toBe(1);
    expect(events).toEqual(['StateReplaced']);
  });
});

describe('store.resume (clock set back, M1-18 review)', () => {
  it('reports clockBack and keeps lastSeen; a plain tick behind the clock stays quiet', () => {
    const store = createStore(game());
    store.tick(T0 - 10 * 60_000);
    expect(store.getState().returnReport).toBeNull();
    store.resume(T0 - 10 * 60_000);
    expect(store.getState().returnReport?.reason).toBe('clockBack');
    expect(store.getState().time.lastSeen).toBe(T0);
  });
});
