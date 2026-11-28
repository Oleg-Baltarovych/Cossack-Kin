// @vitest-environment jsdom
// Story beat windows in the game UI (plan M2-25, SPEC §2.5): beats reached while away wait for the return window and
// then come one at a time in the core's order; each is a dialog named by its title, with its portrait, text and what
// it paid; Esc or the button moves on; the focus goes back where it was; the rest of the UI is inert meanwhile.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { formatBig } from '../../../src/i18n/index.ts';
import { GameUi } from '../../../src/ui/App.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;
const HOUR = 3600_000;

vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

/** A played farm: the welcome beat seen; `extra` sets what else is true of it. */
function played(extra: (s: GameState) => GameState = (s) => s): GameState {
  const s = createInitialState({ seed: 3, now: T0 });
  return extra({
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(1e6), glory: Big.from(1e6) },
    village: { ...s.village, levels: { ...s.village.levels, field: 30 } },
    story: { seen: ['khortytsia.shore'] },
  });
}

function mount(state: GameState, now: () => number = () => T0): GameStore {
  const store = createStore(state);
  render(
    <GameProvider store={store} now={now}>
      <GameUi world={null} notice="none" />
    </GameProvider>,
  );
  return store;
}

afterEach(cleanup);

describe('story beat windows (M2-25)', () => {
  it('two beats reached while away: after the return window, one at a time in content order, «Далі» then «Гаразд»', () => {
    // Three Cossacks hired and the maidan at 10 in the save, neither beat seen yet: both fire at the return.
    const store = mount(
      played((s) => ({
        ...s,
        village: { ...s.village, sichLevels: { ...s.village.sichLevels, maidan: 10 } },
        army: { infantry: 3 },
        stats: { ...s.stats, hires: 3 },
      })),
    );
    act(() => {
      store.resume(T0 + 2 * HOUR);
    });
    expect(store.getState().story.seen).toContain('khortytsia.council');
    // The return window first; the beats wait.
    const back = screen.getByRole('dialog', { name: 'З поверненням!' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(within(back).getByRole('button', { name: 'Забрати' }));

    const first = screen.getByRole('dialog', { name: 'Гонець з городка' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(first.getAttribute('aria-modal')).toBe('true');
    expect(first.textContent).toContain('Вишневецького');
    expect(first.querySelector('[data-portrait="messenger"]')).not.toBeNull();
    expect(first.textContent).toMatch(/Нагорода\+\d+ слави/);
    fireEvent.click(within(first).getByRole('button', { name: 'Далі' }));

    const second = screen.getByRole('dialog', { name: 'Рада на майдані' });
    expect(second.querySelector('[data-portrait="otaman"]')).not.toBeNull();
    fireEvent.click(within(second).getByRole('button', { name: 'Гаразд' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closing a beat that paid glory sends its coins to the glory counter (M2-26); none under «менше руху»', () => {
    const hired = (s: GameState): GameState => ({ ...s, army: { infantry: 3 }, stats: { ...s.stats, hires: 3 } });
    for (const reduced of [false, true]) {
      cleanup();
      if (reduced) document.documentElement.dataset['motion'] = 'reduced';
      try {
        const store = mount(played());
        act(() => {
          store.replace(hired(store.getState()));
          store.tick(T0 + 100);
        });
        const beat = screen.getByRole('dialog', { name: 'Гонець з городка' });
        expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
        fireEvent.click(within(beat).getByRole('button', { name: 'Гаразд' }));
        const coins = document.querySelectorAll('[data-coin="glory"]').length;
        if (reduced) expect(coins).toBe(0);
        else expect(coins).toBeGreaterThan(0);
      } finally {
        delete document.documentElement.dataset['motion'];
      }
    }
  });

  it('a beat reached online takes the focus, keeps Tab inside, closes on Esc, gives the focus back', () => {
    // The maidan one level short of the council.
    mount(played((s) => ({ ...s, village: { ...s.village, sichLevels: { ...s.village.sichLevels, maidan: 9 } } })));
    fireEvent.click(screen.getByRole('tab', { name: 'Січ' }));
    const buy = screen.getByRole('button', { name: /«Майдан»/ });
    buy.focus();
    fireEvent.click(buy);
    const dialog = screen.getByRole('dialog', { name: 'Рада на майдані' });
    // The council brings the otaman, not glory (Q16, M4-04): no reward line; the hero's own CTA is M4-16.
    expect(dialog.textContent).not.toMatch(/Нагорода/);
    const ok = within(dialog).getByRole('button', { name: 'Гаразд' });
    // The window holds the focus (no ring on «Гаразд» until the keyboard moves there); Tab goes to its button.
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(ok);
    // The HUD and the panel are out of reach while it is open.
    expect(screen.getByRole('banner').closest('[inert]')).not.toBeNull();
    fireEvent.keyDown(ok, { key: 'Tab' });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(ok, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(ok, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /«Майдан»/ }));
    expect(screen.getByRole('banner').closest('[inert]')).toBeNull();
    // Esc went to the window, not to the sheet behind it (the sheet stays open).
    expect(screen.getByRole('tabpanel').hidden).toBe(false);
  });

  it('a beat that opens on its own, long after a focused button went away, leaves the focus alone (M3-12 review)', () => {
    const store = mount(played());
    const buy = screen.getAllByRole('button', { name: /^Купити/ })[0];
    if (!buy) throw new Error('no buy button');
    buy.focus();
    // The farm list goes away with its focused button (another tab): the focus falls to the page.
    fireEvent.click(screen.getByRole('tab', { name: 'Січ' }));
    expect(buy.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
    act(() => {
      store.replace({ ...store.getState(), army: { infantry: 3 }, stats: { ...store.getState().stats, hires: 3 } });
      store.tick(T0 + 100);
    });
    const beat = screen.getByRole('dialog', { name: 'Гонець з городка' });
    fireEvent.click(within(beat).getByRole('button', { name: 'Гаразд' }));
    // Not to the old button's list or panel: nothing the player pressed opened this window.
    expect(document.activeElement).toBe(document.body);
  });

  it('the reward line prints the granted amount in the player format', () => {
    const store = mount(played((s) => ({ ...s, army: { infantry: 2 }, stats: { ...s.stats, hires: 2 } })));
    const grants: Big[] = [];
    store.onEvent((e) => {
      if (e.type === 'StoryBeatReached' && e.granted?.currency === 'glory') grants.push(e.granted.amount);
    });
    act(() => {
      store.dispatch({ type: 'hire', n: 1 }, T0);
    });
    const dialog = screen.getByRole('dialog', { name: 'Гонець з городка' });
    const granted = grants[0];
    if (!granted) throw new Error('no glory granted');
    expect(dialog.querySelector('dd')?.textContent).toBe(`+${formatBig(granted, 'uk', 'words')} слави`);
  });

  it('a fresh game greets with «Берег Дніпра» (no reward line)', () => {
    const store = mount(createInitialState({ seed: 3, now: T0 }));
    act(() => {
      store.tick(T0 + 100);
    });
    const dialog = screen.getByRole('dialog', { name: 'Берег Дніпра' });
    expect(dialog.querySelector('dl')).toBeNull();
    expect(dialog.querySelector('[data-portrait="kobzar"]')).not.toBeNull();
  });
});
