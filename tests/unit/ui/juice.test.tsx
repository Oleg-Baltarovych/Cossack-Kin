// @vitest-environment jsdom
// UI juice (plan M2-26, SPEC §6.7/§6.8): a buy button hops once when it turns affordable (not on mount, a tick that
// keeps it so, or a buy-mode switch; never under «менше руху»); the HUD's exact amount for screen readers is the new
// one at once while the number on screen rolls; the button juice reaches CSS in whole logical px.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUTTON, COUNTER } from '../../../src/content/juice.ts';
import { Big } from '../../../src/core/big.ts';
import type { BuyMode } from '../../../src/core/economy.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { formatBig } from '../../../src/i18n/index.ts';
import { Hud } from '../../../src/ui/components/Hud.tsx';
import { FarmRow } from '../../../src/ui/components/Rows.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';
import { trackScale, uiScale } from '../../../src/ui/theme.ts';

const T0 = 1_763_400_000_000;

vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

function makeState(ducats: number, field = 20): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(ducats) },
    village: { ...s.village, levels: { ...s.village.levels, field } },
  };
}

function mount(store: GameStore, ui: ReactNode) {
  return render(
    <GameProvider store={store} now={() => T0}>
      {ui}
    </GameProvider>,
  );
}

const fieldButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /Пшеничне поле/ });
const hopping = () => fieldButton().dataset['hop'] !== undefined;

/** Ticks the store at 10 Hz until the field button turns on (20 fields earn; 150 ducats is a few ticks short). */
function tickUntilAffordable(store: GameStore): number {
  let at = T0;
  for (let i = 0; i < 600 && fieldButton().disabled; i += 1) {
    at += 100;
    act(() => {
      store.tick(at);
    });
  }
  expect(fieldButton().disabled).toBe(false);
  return at;
}

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['motion'];
});

describe('buy button hop (M2-26)', () => {
  it('hops once when it turns affordable; the ticks after it do not hop it again', () => {
    const store = createStore(makeState(150));
    mount(store, <FarmRow id="field" mode={1} />);
    expect(fieldButton().disabled).toBe(true);
    expect(hopping()).toBe(false);
    let at = tickUntilAffordable(store);
    expect(hopping()).toBe(true);
    fireEvent.animationEnd(fieldButton());
    expect(hopping()).toBe(false);
    for (let i = 0; i < 20; i += 1) {
      at += 100;
      act(() => {
        store.tick(at);
      });
    }
    expect(fieldButton().disabled).toBe(false);
    expect(hopping()).toBe(false);
  });

  it('turning off clears it, and turning affordable again hops again', () => {
    const store = createStore(makeState(150));
    mount(store, <FarmRow id="field" mode={1} />);
    const at = tickUntilAffordable(store);
    expect(hopping()).toBe(true);
    // Bought: too few ducats for the next level.
    fireEvent.click(fieldButton());
    expect(fieldButton().disabled).toBe(true);
    expect(hopping()).toBe(false);
    act(() => {
      store.tick(at + 100);
    });
    tickUntilAffordable(store);
    expect(hopping()).toBe(true);
  });

  it('no hop on mount, nor when a buy-mode switch enables it', () => {
    const store = createStore(makeState(1e6));
    const { rerender } = mount(store, <FarmRow id="field" mode={1} />);
    expect(fieldButton().disabled).toBe(false);
    expect(hopping()).toBe(false);
    act(() => {
      store.replace(makeState(200));
    });
    const row = (mode: BuyMode) => (
      <GameProvider store={store} now={() => T0}>
        <FarmRow id="field" mode={mode} />
      </GameProvider>
    );
    rerender(row(10));
    expect(fieldButton().disabled).toBe(true);
    rerender(row(1));
    expect(fieldButton().disabled).toBe(false);
    expect(hopping()).toBe(false);
  });

  it('not rendered (the sheet collapsed): no mark, so no late hop when the sheet opens', () => {
    // jsdom has no layout: say every element is not rendered, as a collapsed sheet's list is.
    const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'checkVisibility');
    Object.defineProperty(HTMLElement.prototype, 'checkVisibility', { value: () => false, configurable: true });
    try {
      const store = createStore(makeState(150));
      mount(store, <FarmRow id="field" mode={1} />);
      tickUntilAffordable(store);
      expect(hopping()).toBe(false);
    } finally {
      if (own) Object.defineProperty(HTMLElement.prototype, 'checkVisibility', own);
      else Reflect.deleteProperty(HTMLElement.prototype, 'checkVisibility');
    }
  });

  it('unmounted: every listener it put on the button is taken off', () => {
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    try {
      const store = createStore(makeState(150));
      const { unmount } = mount(store, <FarmRow id="field" mode={1} />);
      const button = fieldButton();
      const on = (spy: typeof add) =>
        spy.mock.calls
          .map((call, i) => ({ type: call[0], fn: call[1], target: spy.mock.contexts[i] }))
          .filter((c) => c.target === button && c.type.startsWith('animation'));
      const added = on(add);
      expect(added.length).toBeGreaterThan(0);
      unmount();
      const removed = on(remove);
      for (const a of added) expect(removed.some((r) => r.type === a.type && r.fn === a.fn)).toBe(true);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('«менше руху»: the button turns on without a hop', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    const store = createStore(makeState(150));
    mount(store, <FarmRow id="field" mode={1} />);
    tickUntilAffordable(store);
    expect(hopping()).toBe(false);
  });
});

describe('HUD amounts (M2-26)', () => {
  it('screen readers get the new amount at once while the number on screen rolls to it', () => {
    vi.useFakeTimers();
    try {
      const store = createStore(makeState(100, 0));
      mount(store, <Hud />);
      const hud = screen.getByRole('banner');
      const old = formatBig(Big.from(100), 'uk', 'words');
      const next = formatBig(Big.from(900), 'uk', 'words');
      act(() => {
        store.replace(makeState(900, 0));
      });
      // The exact twin is the only element with the new amount; the rolling one still says the old.
      expect(within(hud).getByText(next).getAttribute('aria-hidden')).toBeNull();
      expect(within(hud).getByText(old).getAttribute('aria-hidden')).toBe('true');
      act(() => {
        vi.advanceTimersByTime(COUNTER.lerpMs + 20);
      });
      expect(within(hud).getAllByText(next)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('«менше руху»: the number on screen is the new amount at once', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    const store = createStore(makeState(100, 0));
    mount(store, <Hud />);
    act(() => {
      store.replace(makeState(900, 0));
    });
    expect(within(screen.getByRole('banner')).getAllByText(formatBig(Big.from(900), 'uk', 'words'))).toHaveLength(2);
  });
});

describe('button juice in CSS (M2-26)', () => {
  it('the pressed offset and the hop are whole logical px from content', () => {
    const root = document.createElement('div');
    const stop = trackScale(root, window);
    try {
      const px = uiScale(window.innerWidth, window.innerHeight, window.devicePixelRatio).px;
      expect(parseFloat(root.style.getPropertyValue('--press-y'))).toBeCloseTo(BUTTON.pressPx * px, 9);
      expect(parseFloat(root.style.getPropertyValue('--hop-y'))).toBeCloseTo(BUTTON.hopPx * px, 9);
      expect(root.style.getPropertyValue('--hop-ms')).toBe(`${String(BUTTON.hopMs)}ms`);
    } finally {
      stop();
    }
  });
});
