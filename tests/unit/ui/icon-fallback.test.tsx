// @vitest-environment jsdom
// The UI atlas never arrives (plan M2-14 review): the loader retries once, warns, and every icon falls back — a price
// keeps its currency as short text, the HUD and the lock note leave no empty box before their words.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { Hud } from '../../../src/ui/components/Hud.tsx';
import { Panel } from '../../../src/ui/components/Panel.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;
const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
vi.stubGlobal('fetch', fetchMock);
const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

afterEach(cleanup);

describe('icons without the atlas', () => {
  it('retry once, warn, then show text fallbacks and no empty boxes', async () => {
    const s = createInitialState({ seed: 5, now: T0 });
    const store = createStore({ ...s, currencies: { ...s.currencies, ducats: Big.from(10) } });
    const { container } = render(
      <GameProvider store={store} now={() => T0}>
        <Hud />
        <Panel />
      </GameProvider>,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-icon]')).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('icons: the UI atlas did not load: %o', expect.any(Error));
    // Farm prices keep their currency as text.
    const field = screen.getByRole('button', { name: /Пшеничне поле/ });
    expect(field.textContent).toMatch(/^дук\.\d/);
    // The Sich: glory prices and the lock note.
    fireEvent.click(screen.getByRole('tab', { name: 'Січ' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getAllByText('сл.').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-icon]')).toBeNull();
  });
});
