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
import { hudView } from '../../../src/core/selectors.ts';
import { choreQuest } from '../../../src/core/systems/quests.ts';
import { formatBig } from '../../../src/i18n/index.ts';
import { CoinFlight, useFlightOrigin } from '../../../src/ui/components/CoinFlight.tsx';
import { Hud } from '../../../src/ui/components/Hud.tsx';
import { Panel, type PanelProps } from '../../../src/ui/components/Panel.tsx';
import { ReturnModal } from '../../../src/ui/components/ReturnModal.tsx';
import { coinsFor } from '../../../src/ui/coins.ts';
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

/** A claim's button (the title of a line is a button too since M3-15). */
const CLAIM = /^(Забрати|Зарахувати)/;
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
  it('a new game: the chain step alone — title, progress, reward — and no claim button', () => {
    mount(game());
    expect(within(strip()).queryAllByRole('listitem')).toHaveLength(0);
    expect(strip().textContent).toContain('Засій пшеничне поле');
    expect(strip().textContent).toContain('0 з 1');
    // The first farm steps pay glory (M2-27, SPEC §3.10).
    expect(strip().textContent).toContain('5 хвилин слави');
    expect(within(strip()).queryByRole('button', { name: CLAIM })).toBeNull();
  });

  it('plurals for the minutes, in en too', () => {
    mount(game('en'));
    const s = screen.getByRole('region', { name: 'Tasks' });
    expect(s.textContent).toContain('5 minutes of glory');
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
    const claim = within(strip()).getByRole('button', { name: 'Забрати нагороду: 5 хвилин слави' });
    expect(claim.textContent).toBe('Забрати');
    const before = store.getState().currencies.glory;
    fireEvent.click(claim);
    const gained = store.getState().currencies.glory.sub(before);
    expect(gained.gt(0)).toBe(true);
    expect(within(strip()).getByRole('status').textContent).toBe(
      `Отримано: +${formatBig(gained, 'uk', 'words')} слави`,
    );
    expect(strip().textContent).toContain('Посади город');
    expect(within(strip()).queryByRole('button', { name: CLAIM })).toBeNull();
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
    expect(within(screen.getByRole('region', { name: 'Завдання' })).getByRole('status').textContent).toBe('');
  });

  it('the limit note shows before the chore is done too (the warning comes first)', () => {
    mount(spent(game()));
    const chore = within(openMore()).getAllByRole('listitem')[1];
    expect(chore?.textContent).toContain('Ліміт нагород на сьогодні');
    expect(within(chore ?? document.body).queryByRole('button', { name: CLAIM })).toBeNull();
  });

  it('a chore past the limit never takes the strip: the chain step stays there', () => {
    mount(spent(choreDone(game())));
    expect(strip().textContent).toContain('Засій пшеничне поле');
    expect(within(strip()).queryByRole('button', { name: CLAIM })).toBeNull();
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

describe('coins to the counter on a claim (M2-25, M2-26)', () => {
  const claimInStrip = () => {
    fireEvent.click(within(strip()).getByRole('button', { name: /^Забрати/ }));
  };
  /** Coins every paid claim of `store` should send: by the size of the grant against its currency's rate (ui/coins.ts). */
  const expectedCoins = (store: GameStore): (() => number) => {
    let n = 0;
    store.onEvent((e) => {
      if (e.type !== 'QuestClaimed' || !e.granted || e.granted.currency === 'pysanky') return;
      const v = hudView(store.getState());
      n += coinsFor(e.granted.amount, e.granted.currency === 'ducats' ? v.ducatsPerSec : v.gloryPerSec);
    });
    return () => n;
  };
  const longest = COIN_FLIGHT.flightMs + COIN_FLIGHT.staggerMs * Math.max(...COIN_FLIGHT.tiers.map((t) => t.coins));

  it('a paid claim sends the coins of its currency along their curve; they are gone after their flight', () => {
    vi.useFakeTimers();
    try {
      const { store } = mount(fieldBuilt(game()));
      const coins = expectedCoins(store);
      claimInStrip();
      expect(coins()).toBeGreaterThan(0);
      // The first step pays glory (M2-27): its coins fly to the glory counter.
      const flying = document.querySelectorAll<HTMLElement>('[data-coin="glory"]');
      expect(flying).toHaveLength(coins());
      const start = flying[0]?.style.transform;
      act(() => {
        vi.advanceTimersByTime(COIN_FLIGHT.flightMs / 2);
      });
      // Half-way the first coin is in the air, away from the button.
      expect(flying[0]?.dataset['flying']).toBe('');
      expect(flying[0]?.style.transform).not.toBe(start);
      act(() => {
        vi.advanceTimersByTime(longest);
      });
      expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
      // Landed: the loop stopped by itself (the HUD roll is long over too).
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('two quick claims stack two flights', () => {
    vi.useFakeTimers();
    try {
      // The chain step and the chore both done: the strip shows the chain step, then the chore.
      const { store } = mount(choreDone(fieldBuilt(game())));
      const coins = expectedCoins(store);
      claimInStrip();
      const one = coins();
      claimInStrip();
      expect(coins()).toBeGreaterThan(one);
      expect(document.querySelectorAll('[data-coin]')).toHaveLength(coins());
    } finally {
      vi.useRealTimers();
    }
  });

  it('the return window: a large return sends ducat coins from «Забрати», a small one none', () => {
    const away = (seconds: number): void => {
      cleanup();
      const s = fieldBuilt(game());
      const rate = hudView(s).ducatsPerSec;
      const report = {
        awaySec: seconds,
        countedSec: seconds,
        capped: false,
        reason: 'normal' as const,
        ducats: rate.mul(seconds),
        glory: Big.ZERO,
      };
      render(
        <GameProvider store={createStore({ ...s, returnReport: report })} now={() => T0}>
          <CoinFlight>
            <Hud />
            <ReturnModal />
          </CoinFlight>
        </GameProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Забрати' }));
    };
    away(COIN_FLIGHT.tiers[0].minIncomeSec - 1);
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
    away(COIN_FLIGHT.tiers[1].minIncomeSec);
    expect(document.querySelectorAll('[data-coin="ducats"]')).toHaveLength(COIN_FLIGHT.tiers[1].coins);
    expect(document.querySelectorAll('[data-coin="glory"]')).toHaveLength(0);
  });

  it('a refused press leaves no origin behind: a later claim from elsewhere sends no coins from it', () => {
    function Refused() {
      const withOrigin = useFlightOrigin();
      return (
        <button
          type="button"
          onClick={(e) => {
            withOrigin(e.currentTarget, () => undefined);
          }}
        >
          Refused
        </button>
      );
    }
    const store = createStore(fieldBuilt(game()));
    render(
      <GameProvider store={store} now={() => T0}>
        <CoinFlight>
          <Hud />
          <Refused />
        </CoinFlight>
      </GameProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refused' }));
    // The chain step claimed without any button (as a debug dispatch would): no press point, no coins.
    act(() => {
      store.dispatch({ type: 'claimQuest', kind: 'chain' }, T0);
    });
    expect(store.getState().quests.chain).not.toEqual(fieldBuilt(game()).quests.chain);
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
  });

  it('unmounted mid-flight: no animation frame or timer is left behind', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = mount(fieldBuilt(game()));
      claimInStrip();
      act(() => {
        vi.advanceTimersByTime(COIN_FLIGHT.frameMs * 3);
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('«менше руху»: no coins, the reward is still credited and read out', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    const { store } = mount(fieldBuilt(game()));
    const before = store.getState().currencies.glory;
    claimInStrip();
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
    expect(store.getState().currencies.glory.gt(before)).toBe(true);
    expect(within(strip()).getByRole('status').textContent).toMatch(/^Отримано: \+/);
  });

  it('a chore past the limit pays nothing: no coins', () => {
    mount(spent(choreDone(game())));
    fireEvent.click(within(openMore()).getByRole('button', { name: 'Зарахувати справу без нагороди' }));
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
  });
});
