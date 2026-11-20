// @vitest-environment jsdom
// The hire row under the shared picker and the HUD with icons (plan M2-14). The row's numbers are the selector's
// (`hireView`); the UI only sends the count it shows.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { hireView } from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { Hud } from '../../../src/ui/components/Hud.tsx';
import { Panel } from '../../../src/ui/components/Panel.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;

// The icon atlas stays «loading» here (the failure path has its own file): prices are read without fallbacks.
vi.stubGlobal('fetch', () => new Promise(() => undefined));

function makeState(over: { ducats: number; field: number; infantry?: number; lang?: 'uk' | 'en' }): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(over.ducats) },
    village: { ...s.village, levels: { ...s.village.levels, field: over.field } },
    army: { infantry: over.infantry ?? 0 },
    settings: { ...s.settings, lang: over.lang ?? 'uk' },
  };
}

function mountSich(store: GameStore) {
  render(
    <GameProvider store={store} now={() => T0}>
      <Panel />
    </GameProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Січ' }));
  return screen.getByRole('tabpanel');
}

const hireButton = (panel: HTMLElement) => within(panel).getByRole<HTMLButtonElement>('button', { name: /^Найняти/ });

afterEach(cleanup);

describe('hire row (M2-14)', () => {
  it('×10 hires ten at once; the button names the count and the full price', () => {
    const store = createStore(makeState({ ducats: 1e9, field: 300 }));
    const panel = mountSich(store);
    fireEvent.click(screen.getByRole('button', { name: '×10' }));
    const button = hireButton(panel);
    expect(button.getAttribute('aria-label')).toMatch(/^Найняти 10 козаків за .+ дук\.$/);
    within(panel).getByText('+10 козаків');
    fireEvent.click(button);
    expect(store.getState().army.infantry).toBe(10);
  });

  it('Max hires what the selector offers; the button is off exactly when the selector blocks it', () => {
    const state = makeState({ ducats: 2e3, field: 1000 });
    const store = createStore(state);
    const panel = mountSich(store);
    fireEvent.click(screen.getByRole('button', { name: 'Макс' }));
    const want = hireView(state, 'max');
    expect(want.blocked).toBeNull();
    expect(want.count).toBeGreaterThan(1);
    fireEvent.click(hireButton(panel));
    expect(store.getState().army.infantry).toBe(want.count);

    // ×25 is more than the ducats cover now: off, with the reason, and the reducer would refuse it too.
    fireEvent.click(screen.getByRole('button', { name: '×25' }));
    expect(hireView(store.getState(), 25).blocked).toBe('ducats');
    expect(hireButton(panel).disabled).toBe(true);
    within(panel).getByText('Бракує дукатів');
  });

  it('at the food limit the button is off, says why, and shows no price', () => {
    const panel = mountSich(createStore(makeState({ ducats: 1e9, field: 20, infantry: 2 })));
    const button = hireButton(panel);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Найняти козака: бракує харчу');
    within(panel).getByText('2/2');
    expect(button.textContent).toBe('—');
    within(panel).getByText('Бракує харчу');
  });

  it('the price on the button is compact and carries the ducat icon; the accessible name has the full form', () => {
    const panel = mountSich(createStore(makeState({ ducats: 1e12, field: 1000, infantry: 30 })));
    fireEvent.click(screen.getByRole('button', { name: '×25' }));
    const button = hireButton(panel);
    expect(button.querySelector('[data-icon="ducat"]')?.getAttribute('aria-hidden')).toBe('true');
    // The player's words, compact, on the face; the full form in the name.
    expect(button.textContent).toMatch(/^\d+(,\d+)?(тис\.|млн|млрд)$/);
    expect(button.getAttribute('aria-label')).toMatch(/(тис\.|млн|млрд) дук\.$/);
  });
});

describe('HUD with icons (M2-14, SPEC §6.8)', () => {
  it('every value has its icon and its word; the wind icon follows the wind', () => {
    const { container } = render(
      <GameProvider store={createStore(makeState({ ducats: 5, field: 20, lang: 'en' }))} now={() => T0}>
        <Hud />
      </GameProvider>,
    );
    const icons = [...container.querySelectorAll('[data-icon]')].map((e) => e.getAttribute('data-icon'));
    expect(icons.slice(0, 5)).toEqual(['ducat', 'glory', 'cossack', 'kharch', 'defence']);
    expect(icons[5]).toMatch(/^wind-(calm|breeze|storm)$/);
    for (const e of container.querySelectorAll('[data-icon]')) expect(e.getAttribute('aria-hidden')).toBe('true');
    for (const word of ['Ducats', 'Glory', /Cossacks 0\//, /Food/, /Defence/, /Wind:/]) screen.getByText(word);
  });
});
