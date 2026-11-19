// @vitest-environment jsdom
// The «new tier» banner (plan M2-12): a polite live region that names the building and its tier, in the player's
// language, and clears itself.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { TierBanner } from '../../../src/ui/components/TierBanner.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;

function rich(lang: GameState['settings']['lang']): GameState {
  const s = createInitialState({ seed: 3, now: T0 });
  return { ...s, currencies: { ...s.currencies, ducats: Big.from(1e9) }, settings: { ...s.settings, lang } };
}

function mount(state: GameState) {
  const store = createStore(state);
  render(
    <GameProvider store={store} now={() => T0}>
      <TierBanner />
    </GameProvider>,
  );
  return store;
}

afterEach(cleanup);

/**
 * The banner's CSS animation ending. jsdom has no CSS animations (nor `AnimationEvent`), so React listens for the
 * vendor-prefixed name there; send both so the test does not depend on which one React picked.
 */
function animationEnds(el: Element): void {
  act(() => {
    for (const type of ['animationend', 'webkitAnimationEnd']) el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

describe('TierBanner (M2-12)', () => {
  it('is an empty polite status region until a tier is reached; the first level alone shows nothing', () => {
    const store = mount(rich('uk'));
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 10);
    });
    expect(region.textContent).toBe('');
  });

  it('a milestone names the building and its tier (II at level 10), then clears when its animation ends', () => {
    const store = mount(rich('uk'));
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'apiary', mode: 10 }, T0 + 10);
    });
    expect(screen.getByRole('status').textContent).toBe('Пасіка — тір II');
    const banner = screen.getByText('Пасіка — тір II');
    animationEnds(banner);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('speaks English when the game does', () => {
    const store = mount(rich('en'));
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'field', mode: 25 }, T0 + 10);
    });
    expect(screen.getByRole('status').textContent).toBe('Wheat field — tier III');
  });

  it('a newer tier replaces the banner; the old animation ending does not clear the new one', () => {
    const store = mount(rich('uk'));
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'field', mode: 10 }, T0 + 10);
    });
    const old = screen.getByText('Пшеничне поле — тір II');
    act(() => {
      store.dispatch({ type: 'buyBuilding', id: 'garden', mode: 10 }, T0 + 20);
    });
    animationEnds(old);
    expect(screen.getByRole('status').textContent).toBe('Город — тір II');
  });
});
