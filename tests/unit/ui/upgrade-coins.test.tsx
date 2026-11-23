// @vitest-environment jsdom
// The coins of an ordinary upgrade (M2-29 D, SPEC §6.5): a level past the first sends UPGRADE_JUICE.coins coins of the
// currency spent from its HUD counter to the building where the player sees it; the first level (the construction),
// a building out of sight, a load and «менше руху» send none.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPGRADE_JUICE } from '../../../src/content/juice.ts';
import { Big } from '../../../src/core/big.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { CoinFlight, type BuildingAt } from '../../../src/ui/components/CoinFlight.tsx';
import { Hud } from '../../../src/ui/components/Hud.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;

function mount(buildingAt: BuildingAt | undefined): GameStore {
  const s = createInitialState({ seed: 3, now: T0 });
  const store = createStore({
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(1e9), glory: Big.from(1e9) },
  });
  render(
    <GameProvider store={store} now={() => T0}>
      <CoinFlight buildingAt={buildingAt}>
        <Hud />
      </CoinFlight>
    </GameProvider>,
  );
  return store;
}

const coins = (currency?: string): number =>
  document.querySelectorAll(currency ? `[data-coin="${currency}"]` : '[data-coin]').length;

beforeEach(() => {
  delete document.documentElement.dataset['motion'];
});
afterEach(cleanup);

describe('upgrade coins (M2-29 D)', () => {
  it('a level past the first sends coins of the currency spent to the building; the first level none', () => {
    const asked: string[] = [];
    const store = mount((b) => {
      asked.push(b);
      return { x: 120, y: 300 };
    });
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 100);
    });
    expect(coins()).toBe(0);
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 200);
    });
    expect(coins('ducats')).toBe(UPGRADE_JUICE.coins);
    act(() => {
      store.dispatch({ type: 'buySich', id: 'kurins', mode: 1 }, T0 + 300);
    });
    act(() => {
      store.dispatch({ type: 'buySich', id: 'kurins', mode: 1 }, T0 + 400);
    });
    expect(coins('glory')).toBe(UPGRADE_JUICE.coins);
    expect(asked).toEqual(['field', 'kurins']);
  });

  it('a building the player does not see (or no world) gets none', () => {
    for (const at of [() => null, undefined] as const) {
      cleanup();
      const store = mount(at);
      act(() => {
        store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 100);
      });
      act(() => {
        store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 200);
      });
      expect(coins()).toBe(0);
    }
  });

  it('«менше руху»: none', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    const store = mount(() => ({ x: 120, y: 300 }));
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 100);
    });
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 200);
    });
    expect(coins()).toBe(0);
  });

  it('the coins land and leave nothing behind', () => {
    vi.useFakeTimers();
    try {
      const store = mount(() => ({ x: 120, y: 300 }));
      act(() => {
        store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 100);
      });
      act(() => {
        store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 200);
      });
      expect(coins()).toBe(UPGRADE_JUICE.coins);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(coins()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
