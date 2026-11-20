// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { Panel, type PanelProps } from '../../../src/ui/components/Panel.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;

function mount(props: PanelProps = {}) {
  const s = createInitialState({ seed: 5, now: T0 });
  const store = createStore({ ...s, currencies: { ...s.currencies, ducats: Big.from(100) } });
  return render(
    <GameProvider store={store} now={() => T0}>
      <Panel {...props} />
    </GameProvider>,
  );
}

const toggle = () => screen.getByRole('button', { name: /панель/i });

afterEach(cleanup);

describe('bottom sheet (M2-13): states, keyboard, aria', () => {
  it('starts half; the bar button walks half → full → collapsed → half with aria-expanded and a label per state', () => {
    mount();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Розгорнути панель на весь екран');
    expect(screen.getByRole('tabpanel').hidden).toBe(false);

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-label')).toBe('Згорнути панель');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Розгорнути панель');
    // Collapsed: only the tab bar; the list is out of the page (and of the accessibility tree).
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(3);

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('tabpanel').hidden).toBe(false);
  });

  it('the button controls the list (aria-controls)', () => {
    mount();
    expect(toggle().getAttribute('aria-controls')).toBe(screen.getByRole('tabpanel').id);
  });

  it('Esc collapses from full and from half; focus inside the hidden list moves to the bar button', () => {
    mount({ initial: 'full' });
    const buy = within(screen.getByRole('tabpanel')).getAllByRole('button')[0];
    if (!buy) throw new Error('no button in the list');
    buy.focus();
    fireEvent.keyDown(buy, { key: 'Escape' });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());

    cleanup();
    mount();
    fireEvent.keyDown(screen.getByRole('tabpanel'), { key: 'Escape' });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('while collapsed, arrows only move the focus along the tabs: the sheet stays shut, no camera move', () => {
    const onZone = vi.fn();
    mount({ initial: 'collapsed', onZone });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Хутір' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Січ' }), { key: 'End' });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(onZone).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Ще' }));
  });

  it('Esc collapses the open sheet wherever the focus is; not while a window makes the sheet inert', () => {
    mount();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    cleanup();
    const view = mount();
    view.container.setAttribute('inert', '');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('choosing a tab while collapsed opens half', () => {
    mount({ initial: 'collapsed' });
    fireEvent.click(screen.getByRole('tab', { name: 'Січ' }));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Січ' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').hidden).toBe(false);
  });

  it('a tapped building opens half on its list with its row marked current; then the camera may clear it', () => {
    vi.useFakeTimers();
    try {
      const onReveal = vi.fn();
      const onZone = vi.fn();
      const view = mount({ initial: 'collapsed', reveal: null, onReveal, onZone });
      const rerender = (props: PanelProps) => {
        const s = createInitialState({ seed: 5, now: T0 });
        view.rerender(
          <GameProvider store={createStore(s)} now={() => T0}>
            <Panel {...props} />
          </GameProvider>,
        );
      };
      rerender({ initial: 'collapsed', reveal: { building: 'kurins' }, onReveal, onZone });
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByRole('tab', { name: 'Січ' }).getAttribute('aria-selected')).toBe('true');
      const current = within(screen.getByRole('tabpanel'))
        .getAllByRole('listitem')
        .filter((li) => li.getAttribute('aria-current') === 'true');
      expect(current).toHaveLength(1);
      expect(current[0]?.textContent).toContain('Курені');
      // A tab change from a tap moves no camera.
      expect(onZone).not.toHaveBeenCalled();

      // The rim fades, but the row stays the current one until the player does something in the sheet.
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      const marked = () => screen.queryAllByRole('listitem').filter((li) => li.getAttribute('aria-current'));
      expect(marked()).toHaveLength(1);
      fireEvent.pointerDown(screen.getByRole('tabpanel'));
      expect(marked()).toHaveLength(0);
      rerender({ reveal: { building: 'windmill' }, onReveal, onZone });
      expect(screen.getByRole('tab', { name: 'Хутір' }).getAttribute('aria-selected')).toBe('true');
      const lit = screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-current'));
      expect(lit?.textContent).toContain('Вітряк');
    } finally {
      vi.useRealTimers();
    }
  });
});
