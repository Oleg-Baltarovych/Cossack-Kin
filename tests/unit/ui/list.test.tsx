// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { Hud } from '../../../src/ui/components/Hud.tsx';
import { Panel } from '../../../src/ui/components/Panel.tsx';
import { FarmRow } from '../../../src/ui/components/Rows.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;

function makeState(over: { ducats?: number; field?: number; lang?: GameState['settings']['lang'] } = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(over.ducats ?? 10) },
    village: { ...s.village, levels: { ...s.village.levels, field: over.field ?? 0 } },
    settings: { ...s.settings, lang: over.lang ?? 'uk' },
  };
}

function mount(store: GameStore, ui: ReactNode, clock = { now: T0 }) {
  return render(
    <GameProvider store={store} now={() => clock.now}>
      {ui}
    </GameProvider>,
  );
}

afterEach(cleanup);

describe('building rows (M1-17)', () => {
  it('a row re-renders only when its own view changes, not on every tick', () => {
    // 20 fields earn ducats every tick; the fair (5G) stays out of reach, so its row has nothing new to show.
    // 150 ducats: level 21 of the field (~164) becomes affordable a few ticks in.
    const store = createStore(makeState({ ducats: 150, field: 20 }));
    const commits = { fair: 0, field: 0 };
    mount(
      store,
      <>
        <Profiler id="fair" onRender={() => (commits.fair += 1)}>
          <FarmRow id="fair" mode={1} />
        </Profiler>
        <Profiler id="field" onRender={() => (commits.field += 1)}>
          <FarmRow id="field" mode="max" />
        </Profiler>
      </>,
    );
    const mounted = { ...commits };
    act(() => {
      for (let i = 1; i <= 50; i += 1) store.tick(T0 + i * 100);
    });
    expect(store.getState().currencies.ducats.gt(10)).toBe(true);
    expect(commits.fair).toBe(mounted.fair);
    // The field turns affordable mid-way: that row does follow the ticks.
    expect(commits.field).toBeGreaterThan(mounted.field);

    act(() => {
      store.replace(makeState({ ducats: 1e11, field: 20 }));
    });
    expect(commits.fair).toBe(mounted.fair + 1);
    expect(screen.getAllByRole<HTMLButtonElement>('button').map((b) => b.disabled)).toEqual([false, false]);
  });

  it('buying through the button raises the level; a refused buy is a disabled button with the reason', () => {
    const store = createStore(makeState({ ducats: 10 }));
    mount(store, <Panel />);
    const field = screen.getByRole('button', { name: /Пшеничне поле/ });
    fireEvent.click(field);
    expect(store.getState().village.levels.field).toBe(1);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Город/ }).disabled).toBe(true);
    expect(screen.getAllByText('Бракує дукатів').length).toBeGreaterThan(0);
  });

  it('tabs: the Sich lists the hire row, locked buildings with their condition, and no land-5 foundry', () => {
    mount(createStore(makeState()), <Panel />);
    fireEvent.click(screen.getByRole('tab', { name: 'Січ' }));
    expect(screen.getByRole('tab', { name: 'Січ' }).getAttribute('aria-selected')).toBe('true');
    const list = screen.getByRole('tabpanel');
    within(list).getByText('Найм козаків');
    within(list).getByText(/Відкриється, коли всі будівлі хутора матимуть рівень 25/);
    expect(within(list).queryByText('Пушкарня')).toBeNull();
  });

  it('tabs take the camera to their zone (M2-02) when chosen (click / Enter / Space); «Культура» and «Ще» have none', () => {
    const zones: string[] = [];
    mount(
      createStore(makeState()),
      <Panel
        onZone={(z) => {
          zones.push(z);
        }}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Січ' }));
    // Manual activation (M2-13): arrows only move the focus.
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Січ' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Культура' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Ще' }), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Хутір' }));
    expect(zones).toEqual(['sich']);
    // «Культура» (M4-12, ADR 011): chosen, it moves no camera.
    fireEvent.click(screen.getByRole('tab', { name: 'Культура' }));
    expect(screen.getByRole('tab', { name: 'Культура' }).getAttribute('aria-selected')).toBe('true');
    expect(zones).toEqual(['sich']);
    fireEvent.click(screen.getByRole('tab', { name: 'Хутір' }));
    expect(zones).toEqual(['sich', 'farm']);
  });

  it('Home/End move the focus to the first and last tab (roving tabindex); the tab panel is focusable', () => {
    const zones: string[] = [];
    mount(
      createStore(makeState()),
      <Panel
        onZone={(z) => {
          zones.push(z);
        }}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Хутір' }), { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Ще' }));
    expect(screen.getByRole('tab', { name: 'Ще' }).tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Хутір' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Ще' }), { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Хутір' }));
    expect(zones).toEqual([]);
    expect(screen.getByRole('tabpanel').tabIndex).toBe(0);
  });

  it('the tab follows the zone the camera settles in, without moving the camera or focus, never leaving «Ще»', () => {
    let emit: (zone: 'farm' | 'suburb' | 'sich') => void = () => undefined;
    const zones: string[] = [];
    mount(
      createStore(makeState()),
      <Panel
        onZone={(z) => {
          zones.push(z);
        }}
        zoneSource={(listener) => {
          emit = listener;
          listener('sich'); // the current zone at once (the world started at the Sich)
          return () => undefined;
        }}
      />,
    );
    const selected = (name: string): string | null => screen.getByRole('tab', { name }).getAttribute('aria-selected');
    expect(selected('Січ')).toBe('true');
    const focused = document.activeElement;
    act(() => {
      emit('suburb'); // the suburb's buildings are in the farm list
    });
    expect(selected('Хутір')).toBe('true');
    expect(document.activeElement).toBe(focused);
    fireEvent.click(screen.getByRole('tab', { name: 'Ще' }));
    act(() => {
      emit('sich');
    });
    expect(selected('Ще')).toBe('true');
    expect(zones).toEqual([]); // following the camera never sends it anywhere
  });

  it('the language setting switches every string, and English has no Ukrainian left (no text outside i18n)', () => {
    const store = createStore(makeState({ field: 12 }));
    const { container } = mount(
      store,
      <>
        <Hud />
        <Panel />
      </>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Ще' }));
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(store.getState().settings.lang).toBe('en');
    const visible = (): string => container.textContent.replace('Українська', '');
    for (const tab of ['Farm', 'Sich', 'More']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      expect(visible()).not.toMatch(/\p{Script=Cyrillic}/u);
      expect(visible()).not.toMatch(/\b(ui|building|sich|wind)\.[a-z]/);
    }
  });
});
