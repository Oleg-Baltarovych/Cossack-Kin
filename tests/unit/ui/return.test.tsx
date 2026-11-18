// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OFFLINE } from '../../../src/content/economy.ts';
import { applyOffline } from '../../../src/core/offline.ts';
import { formatBig } from '../../../src/i18n/index.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { ReturnModal } from '../../../src/ui/components/ReturnModal.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;
const HOUR = 3600_000;

function farm(lang: GameState['settings']['lang'] = 'uk', infantry = 0): GameState {
  const s = createInitialState({ seed: 9, now: T0 });
  return {
    ...s,
    village: { ...s.village, levels: { ...s.village.levels, field: 20, garden: 10 } },
    army: { infantry },
    settings: { ...s.settings, lang },
  };
}

function mount(state: GameState, now: number) {
  const store = createStore(state);
  render(
    <GameProvider store={store} now={() => now}>
      <ReturnModal />
    </GameProvider>,
  );
  return store;
}

afterEach(cleanup);

describe('ReturnModal (M1-18)', () => {
  it('shows nothing without a report', () => {
    mount(farm(), T0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('2 hours away: the time with plurals, the ducats from the report; «Забрати» credits them and closes', () => {
    const back = applyOffline(farm(), T0 + 2 * HOUR + 5 * 60_000).state;
    const report = back.returnReport;
    if (!report) throw new Error('no report');
    const store = mount(back, T0 + 2 * HOUR + 5 * 60_000);
    const dialog = screen.getByRole('dialog', { name: 'З поверненням!' });
    expect(dialog.textContent).toContain('Час відсутності: 2 години 5 хвилин');
    expect(dialog.textContent).not.toContain('ліміт');
    // 20 fields (20/s) + 10 gardens (80/s) for 7500 s = 750 тис.: the window prints the report's own number.
    expect(report.ducats.toNumber()).toBeCloseTo(100 * 7500, 6);
    expect(dialog.textContent).toContain(`Дукати+${formatBig(report.ducats, 'uk', 'words')}`);
    expect(dialog.textContent).toContain('+750 тис.');
    const before = store.getState().currencies.ducats;
    fireEvent.click(screen.getByRole('button', { name: 'Забрати' }));
    expect(store.getState().currencies.ducats.eq(before.add(report.ducats))).toBe(true);
    expect(store.getState().returnReport).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('over the limit: says only 8 hours were counted; glory shows when there is some', () => {
    const now = T0 + 11 * HOUR;
    const back = applyOffline(farm('uk', 1), now).state;
    mount(back, now);
    const text = screen.getByRole('dialog').textContent;
    expect(text).toContain('Час відсутності: 11 годин');
    expect(text).toContain(`Зараховано: ${String(OFFLINE.capSec / 3600)} годин (ліміт досягнуто).`);
    expect(text).toContain('Слава');
  });

  it('a clock set back: earns nothing and says why', () => {
    const back = applyOffline(farm(), T0 - HOUR).state;
    mount(back, T0 - HOUR);
    const text = screen.getByRole('dialog').textContent;
    expect(text).toContain('Годинник пристрою перевели назад');
    expect(text).not.toContain('Дукати');
  });

  it('nothing built yet: says so instead of «+0»', () => {
    const empty = createInitialState({ seed: 9, now: T0 });
    mount(applyOffline(empty, T0 + HOUR).state, T0 + HOUR);
    expect(screen.getByRole('dialog').textContent).toContain('нічого не нажито');
  });

  it('English', () => {
    const now = T0 + HOUR;
    mount(applyOffline(farm('en'), now).state, now);
    const dialog = screen.getByRole('dialog', { name: 'Welcome back!' });
    expect(dialog.textContent).toContain('Time away: 1 hour');
    expect(dialog.textContent).not.toMatch(/\p{Script=Cyrillic}/u);
    screen.getByRole('button', { name: 'Collect' });
  });

  it('the claim button gets the focus (Enter claims at once)', () => {
    mount(applyOffline(farm(), T0 + HOUR).state, T0 + HOUR);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Забрати' }));
  });
});
