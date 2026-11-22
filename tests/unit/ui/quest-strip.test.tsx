// @vitest-environment jsdom
// Quests in the sheet, the red dot and the claim coins (plan M2-25 + review, SPEC §3.10, §10.3, §6.7): one line over
// the «Хутір»/«Січ» lists (a claim first, else the chain step), both quests in full on «Ще» with the day-limit warning,
// the dot on «Ще» while the sheet is down, coins to the counter (none under «менше руху», no timers left behind).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COIN_FLIGHT } from '../../../src/content/juice.ts';
import { CHORES } from '../../../src/content/quests.ts';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { choreQuest } from '../../../src/core/systems/quests.ts';
import { formatBig } from '../../../src/i18n/index.ts';
import { CoinFlight } from '../../../src/ui/components/CoinFlight.tsx';
import { Hud } from '../../../src/ui/components/Hud.tsx';
import { Panel, type PanelProps } from '../../../src/ui/components/Panel.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;

vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

function game(lang: GameState['settings']['lang'] = 'uk'): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return { ...s, currencies: { ...s.currencies, ducats: Big.from(1e6) }, settings: { ...s.settings, lang } };
}

/** The active chore finished. */
function choreDone(s: GameState): GameState {
  const q = choreQuest(s);
  return { ...s, stats: { ...s.stats, [q.goal.stat]: q.base + q.goal.n } };
}

/** The day's chore rewards all taken. */
const spent = (s: GameState): GameState => ({
  ...s,
  quests: { ...s.quests, chores: { ...s.quests.chores, claims: CHORES.maxClaimsPerDay } },
});

const fieldBuilt = (s: GameState): GameState => ({
  ...s,
  village: { ...s.village, levels: { ...s.village.levels, field: 1 } },
});

function mount(state: GameState, props: PanelProps = {}): { store: GameStore; unmount: () => void } {
  const store = createStore(state);
  const { unmount } = render(
    <GameProvider store={store} now={() => T0}>
      <CoinFlight>
        <Hud />
        <Panel {...props} />
      </CoinFlight>
    </GameProvider>,
  );
  return { store, unmount };
}

const strip = () => screen.getByRole('region', { name: 'Завдання' });
const openMore = () => {
  fireEvent.click(screen.getByRole('tab', { name: 'Ще' }));
  return screen.getByRole('region', { name: 'Завдання' });
};
const description = (el: HTMLElement): string =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

beforeEach(() => {
  delete document.documentElement.dataset['motion'];
});
afterEach(cleanup);

describe('the one-line strip over the lists (M2-25, SPEC §10.3)', () => {
  it('a new game: the chain step alone — title, progress, reward — and no button', () => {
    mount(game());
    expect(within(strip()).queryAllByRole('listitem')).toHaveLength(0);
    expect(strip().textContent).toContain('Засій пшеничне поле');
    expect(strip().textContent).toContain('0 з 1');
    expect(strip().textContent).toContain('5 хвилин доходу');
    expect(within(strip()).queryByRole('button')).toBeNull();
  });

  it('plurals for the minutes, in en too', () => {
    mount(game('en'));
    const s = screen.getByRole('region', { name: 'Tasks' });
    expect(s.textContent).toContain('5 minutes of income');
    expect(s.textContent).toContain('0 of 1');
  });

  it('a finished chore that pays takes the line while the chain step is not done', () => {
    mount(choreDone(game()));
    expect(within(strip()).getByRole('button', { name: /^Забрати нагороду/ })).toBeDefined();
    expect(strip().textContent).not.toContain('Засій пшеничне поле');
  });

  it('a step done: «Забрати» names its reward; the claim credits it, reads it out, and the next step shows', () => {
    const { store } = mount(game());
    fireEvent.click(screen.getByRole('button', { name: /«Пшеничне поле»/ }));
    const claim = within(strip()).getByRole('button', { name: 'Забрати нагороду: 5 хвилин доходу' });
    expect(claim.textContent).toBe('Забрати');
    const before = store.getState().currencies.ducats;
    fireEvent.click(claim);
    const gained = store.getState().currencies.ducats.sub(before);
    expect(gained.gt(0)).toBe(true);
    expect(screen.getByRole('status').textContent).toBe(`Отримано: +${formatBig(gained, 'uk', 'words')} дук.`);
    expect(strip().textContent).toContain('Посади город');
    expect(within(strip()).queryByRole('button')).toBeNull();
  });
});

describe('both quests on «Ще» (M2-25 review)', () => {
  it('the chain step and the chore, each with its kind and its progress in words', () => {
    mount(game());
    const board = openMore();
    const [chain, chore] = within(board).getAllByRole('listitem');
    if (!chain || !chore) throw new Error('two lines');
    expect(chain.textContent).toContain('Наказ кошового: 0 з 1');
    expect(chore.textContent).toMatch(/Справа: 0 з \d+/);
    expect(chore.textContent).toMatch(/хвилин[аи]? (доходу|слави)/);
  });

  it('the 11th chore of the day: grey «Зарахувати» with the short limit note as its description; it pays nothing', () => {
    const { store } = mount(spent(choreDone(game())));
    const chore = within(openMore()).getAllByRole('listitem')[1];
    if (!chore) throw new Error('no chore line');
    // The note replaces the reward: said once, not twice.
    expect(chore.textContent).toContain('Ліміт нагород на сьогодні: нічого не дасть.');
    expect(chore.textContent).not.toMatch(/хвилин[аи]? (доходу|слави)/);
    const count = within(chore).getByRole('button', { name: 'Зарахувати справу без нагороди' });
    expect(count.textContent).toBe('Зарахувати');
    expect(description(count)).toBe('Ліміт нагород на сьогодні: нічого не дасть.');
    const before = store.getState();
    fireEvent.click(count);
    expect(store.getState().quests.chores.n).toBe(before.quests.chores.n + 1);
    expect(store.getState().currencies.ducats.eq(before.currencies.ducats)).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('the limit note shows before the chore is done too (the warning comes first)', () => {
    mount(spent(game()));
    const chore = within(openMore()).getAllByRole('listitem')[1];
    expect(chore?.textContent).toContain('Ліміт нагород на сьогодні');
    expect(within(chore ?? document.body).queryByRole('button')).toBeNull();
  });

  it('a chore past the limit never takes the strip: the chain step stays there', () => {
    mount(spent(choreDone(game())));
    expect(strip().textContent).toContain('Засій пшеничне поле');
    expect(within(strip()).queryByRole('button')).toBeNull();
  });
});

describe('red dot on «Ще» (M2-25 review, SPEC §6.7)', () => {
  const more = () => screen.getByRole('tab', { name: 'Ще' });

  it('the sheet down and a claim waiting: the dot on «Ще», said in its description; the name stays', () => {
    mount(fieldBuilt(game()), { initial: 'collapsed' });
    expect(more().textContent).toBe('Ще');
    expect(description(more())).toBe('Є нагорода');
    expect(more().querySelector('[data-dot]')).not.toBeNull();
    expect(document.querySelectorAll('[data-dot]')).toHaveLength(1);
  });

  it('no dot with nothing to claim, nor while the sheet is open', () => {
    mount(game(), { initial: 'collapsed' });
    expect(document.querySelector('[data-dot]')).toBeNull();
    cleanup();
    mount(fieldBuilt(game()), { initial: 'half' });
    expect(document.querySelector('[data-dot]')).toBeNull();
    expect(more().getAttribute('aria-describedby')).toBeNull();
  });
});

describe('coins to the counter on a claim (M2-25)', () => {
  const claimInStrip = () => {
    fireEvent.click(within(strip()).getByRole('button', { name: /^Забрати/ }));
  };

  it('a paid claim sends the coins of its currency; they are gone after their flight', () => {
    vi.useFakeTimers();
    try {
      mount(fieldBuilt(game()));
      claimInStrip();
      expect(document.querySelectorAll('[data-coin="ducats"]')).toHaveLength(COIN_FLIGHT.coins);
      act(() => {
        vi.advanceTimersByTime(COIN_FLIGHT.flightMs + COIN_FLIGHT.staggerMs * COIN_FLIGHT.coins);
      });
      expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('two quick claims stack two flights', () => {
    vi.useFakeTimers();
    try {
      // The chain step and the chore both done: the strip shows the chain step, then the chore.
      mount(choreDone(fieldBuilt(game())));
      claimInStrip();
      claimInStrip();
      expect(document.querySelectorAll('[data-coin]')).toHaveLength(2 * COIN_FLIGHT.coins);
    } finally {
      vi.useRealTimers();
    }
  });

  it('unmounted mid-flight: every timer the flight set is cleared', () => {
    vi.useFakeTimers();
    const set = vi.spyOn(globalThis, 'setTimeout');
    const cleared = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const { unmount } = mount(fieldBuilt(game()));
      set.mockClear();
      claimInStrip();
      const handles = set.mock.results.map((r) => r.value as unknown);
      expect(handles.length).toBeGreaterThan(0);
      unmount();
      const gone = cleared.mock.calls.map((c) => c[0] as unknown);
      expect(handles.filter((h) => !gone.includes(h))).toEqual([]);
    } finally {
      set.mockRestore();
      cleared.mockRestore();
      vi.useRealTimers();
    }
  });

  it('«менше руху»: no coins, the reward is still credited and read out', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    const { store } = mount(fieldBuilt(game()));
    const before = store.getState().currencies.ducats;
    claimInStrip();
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
    expect(store.getState().currencies.ducats.gt(before)).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/^Отримано: \+/);
  });

  it('a chore past the limit pays nothing: no coins', () => {
    mount(spent(choreDone(game())));
    fireEvent.click(within(openMore()).getByRole('button', { name: 'Зарахувати справу без нагороди' }));
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
  });
});
