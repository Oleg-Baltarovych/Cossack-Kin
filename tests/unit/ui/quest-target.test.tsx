// @vitest-environment jsdom
// A tap on a quest leads to its target (plan M3-15, SPEC §10.3, SPEC-REVIEW R-M2-25): the title is a button; it opens
// the target's tab at half with the row lit and current (a building, the hire row, a raid slot), the camera follows
// (`onReveal` for a building, `onZone` for the Sich), and a counter with no row shows a hint instead. Read out.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHEET } from '../../../src/content/juice.ts';
import { QUEST_CHAIN } from '../../../src/content/quests.ts';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { Panel, type PanelProps } from '../../../src/ui/components/Panel.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;

vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

function game(): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return { ...s, currencies: { ...s.currencies, ducats: Big.from(1e6) } };
}

function onStep(s: GameState, id: string): GameState {
  const index = QUEST_CHAIN.findIndex((q) => q.id === id);
  if (index < 0) throw new Error(`no step ${id}`);
  return { ...s, quests: { ...s.quests, chain: { kind: 'listed', index, base: 0 } } };
}

/** A done chore that pays takes the strip (`stripQuestKind`). */
function onChoreDone(s: GameState, id: 'chore.taps50' | 'chore.purchases10'): GameState {
  const stat = id === 'chore.taps50' ? 'taps' : 'purchases';
  return {
    ...s,
    quests: { ...s.quests, chores: { ...s.quests.chores, active: id, base: 0 } },
    stats: { ...s.stats, [stat]: 100 },
  };
}

function mount(state: GameState, props: PanelProps = {}) {
  render(
    <GameProvider store={createStore(state)} now={() => T0}>
      <Panel {...props} />
    </GameProvider>,
  );
}

const strip = () => screen.getByRole('region', { name: 'Завдання' });
const go = (scope: HTMLElement) => within(scope).getByRole('button', { name: /показати ціль$/ });
const tab = (name: string) => screen.getByRole('tab', { name });
const toggle = () => screen.getByRole('button', { name: /панель/i });
const currentRow = () =>
  within(screen.getByRole('tabpanel'))
    .getAllByRole('listitem')
    .filter((li) => li.getAttribute('aria-current') === 'true');
const TAP_HINT = 'Тапай по землі хутора — кожен тап рахується.';
/** The hint on screen (aria-hidden: the status line reads it). */
const hint = () => document.querySelector<HTMLElement>('[data-hint]');
const isLit = (el: Element | undefined) => /lit/.test(el?.className ?? '');
/** The quest read-out: the Panel's own status line (a child of the sheet, outside the strip and the lists). */
const readOut = () => document.querySelector('section[data-state] > p[role="status"]')?.textContent ?? '';

afterEach(cleanup);

describe('the quest strip leads to its target (M3-15)', () => {
  it('a farm step: «Хутір» at half, the building row lit and current, the camera to the building', () => {
    vi.useFakeTimers();
    try {
      const onReveal = vi.fn();
      const onZone = vi.fn();
      mount(onStep(game(), 'khortytsia.windmill1'), { initial: 'collapsed', onReveal, onZone });
      fireEvent.click(toggle());
      fireEvent.click(tab('Січ'));
      onZone.mockClear();
      // From full too: the target sets exactly half.
      fireEvent.click(toggle());
      expect(toggle().getAttribute('aria-label')).toBe('Згорнути панель');
      fireEvent.click(go(strip()));
      expect(tab('Хутір').getAttribute('aria-selected')).toBe('true');
      expect(toggle().getAttribute('aria-label')).toBe('Розгорнути панель на весь екран');
      const [row] = currentRow();
      expect(currentRow()).toHaveLength(1);
      expect(row?.textContent).toContain('Вітряк');
      expect(isLit(row)).toBe(true);
      expect(onReveal).toHaveBeenCalledWith('windmill', expect.any(Number), true);
      expect(onZone).not.toHaveBeenCalled();
      expect(readOut()).toBe('Ціль — на вкладці «Хутір», рядок підсвічено.');
      // The rim fades after SHEET.highlightMs; the row stays current.
      act(() => {
        vi.advanceTimersByTime(SHEET.highlightMs);
      });
      expect(isLit(currentRow()[0])).toBe(false);
      expect(currentRow()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a Sich building step: «Січ», its row lit', () => {
    const onReveal = vi.fn();
    mount(onStep(game(), 'khortytsia.kurins1'), { onReveal });
    fireEvent.click(go(strip()));
    expect(tab('Січ').getAttribute('aria-selected')).toBe('true');
    expect(currentRow()[0]?.textContent).toContain('Курені');
    expect(isLit(currentRow()[0])).toBe(true);
    expect(onReveal).toHaveBeenCalledWith('kurins', expect.any(Number), true);
  });

  it('a hire step: «Січ», the hire row lit, the camera to the Sich', () => {
    const onZone = vi.fn();
    const onReveal = vi.fn();
    mount(onStep(game(), 'khortytsia.hire3'), { onZone, onReveal });
    fireEvent.click(go(strip()));
    expect(tab('Січ').getAttribute('aria-selected')).toBe('true');
    const [row] = currentRow();
    expect(row?.textContent).toContain('Найм козаків');
    expect(isLit(row)).toBe(true);
    expect(onZone).toHaveBeenCalledWith('sich');
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('a raid step: «Січ», the first idle slot lit with its «Обрати похід»', () => {
    const onZone = vi.fn();
    mount(onStep(game(), 'khortytsia.raid1'), { onZone, onChooseRaid: vi.fn() });
    fireEvent.click(go(strip()));
    expect(tab('Січ').getAttribute('aria-selected')).toBe('true');
    const [card] = currentRow();
    expect(card?.textContent).toContain('Загін 1');
    expect(isLit(card)).toBe(true);
    expect(within(card ?? document.body).getByRole('button', { name: /Обрати похід|загону 1/i })).toBeDefined();
    expect(onZone).toHaveBeenCalledWith('sich');
  });

  it('a tap chore: the camera to the farm, the sheet down (the ground free), a hint on screen and read out', () => {
    vi.useFakeTimers();
    try {
      const onZone = vi.fn();
      const onReveal = vi.fn();
      mount(onChoreDone(onStep(game(), 'khortytsia.kurins1'), 'chore.taps50'), { onZone, onReveal });
      // «Забрати» stays a button of its own beside the title.
      expect(within(strip()).getByRole('button', { name: /^Забрати нагороду/ })).toBeDefined();
      fireEvent.click(go(strip()));
      expect(onZone).toHaveBeenCalledWith('farm');
      expect(onReveal).not.toHaveBeenCalled();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(hint()?.textContent).toBe(TAP_HINT);
      expect(readOut()).toBe(TAP_HINT);
      act(() => {
        vi.advanceTimersByTime(SHEET.hintMs);
      });
      expect(hint()).toBeNull();
      expect(readOut()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a hint: a press on it, or any action in the sheet, dismisses it; the list never moves for it', () => {
    mount(onChoreDone(game(), 'chore.purchases10'));
    const list = screen.getByRole('tabpanel');
    const before = list.innerHTML;
    fireEvent.click(go(strip()));
    expect(hint()?.textContent).toBe('Купуй рівні будь-яких будівель — рахуються всі.');
    expect(currentRow()).toHaveLength(0);
    // The hint lies outside the list (over the world): nothing inside the tab panel changed.
    expect(list.contains(hint())).toBe(false);
    expect(list.innerHTML).toBe(before);
    fireEvent.pointerDown(hint() ?? document.body);
    expect(hint()).toBeNull();
    fireEvent.click(go(strip()));
    expect(hint()).not.toBeNull();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Хутір' }), { key: 'ArrowRight' });
    expect(hint()).toBeNull();
  });

  it('a locked Sich goal: its row lit, but the reason said and shown instead of «lit»', () => {
    mount(onStep(game(), 'khortytsia.church1'));
    fireEvent.click(go(strip()));
    expect(tab('Січ').getAttribute('aria-selected')).toBe('true');
    expect(currentRow()[0]?.textContent).toContain('Покрови');
    const reason = 'Ще закрито. Відкриється, коли всі будівлі хутора матимуть рівень 25.';
    expect(readOut()).toBe(reason);
    expect(hint()?.textContent).toBe(reason);
  });

  it('a goal whose row this land does not show: no row lit, the reason instead of «lit»', () => {
    const s = game();
    mount({
      ...s,
      quests: { ...s.quests, chain: { kind: 'generated', goal: { kind: 'sich', id: 'cannonry', level: 1 } } },
    });
    fireEvent.click(go(strip()));
    expect(tab('Січ').getAttribute('aria-selected')).toBe('true');
    expect(currentRow()).toHaveLength(0);
    expect(readOut()).toBe('Ще закрито. Відкриється в 5-му краї.');
    expect(readOut()).not.toContain('підсвічено');
  });

  it('a hire step whose row exists but is not locked says «lit»; a row missing from the DOM is never called lit', () => {
    mount(onStep(game(), 'khortytsia.hire3'));
    fireEvent.click(go(strip()));
    expect(readOut()).toBe('Ціль — на вкладці «Січ», рядок підсвічено.');
  });

  it('the full lines on «Ще» lead too: the chain step from «Ще» opens «Хутір» on its row', () => {
    mount(onStep(game(), 'khortytsia.apiary1'));
    fireEvent.click(tab('Ще'));
    const board = screen.getByRole('region', { name: 'Завдання' });
    const [chain] = within(board).getAllByRole('listitem');
    fireEvent.click(go(chain ?? board));
    expect(tab('Хутір').getAttribute('aria-selected')).toBe('true');
    expect(currentRow()[0]?.textContent).toContain('Пасіка');
    expect(readOut()).toBe('Ціль — на вкладці «Хутір», рядок підсвічено.');
  });

  it('the title is a button named for its quest, described by its progress and reward', () => {
    mount(onStep(game(), 'khortytsia.windmill1'));
    const b = go(strip());
    expect(b.getAttribute('aria-label')).toMatch(/^.+ — показати ціль$/);
    const described = (b.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(described).toContain('0 з 1');
  });
});
