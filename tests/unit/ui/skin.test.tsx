// @vitest-environment jsdom
// M4-16a review: the nearest ducat shortage only, and the UI's phase of day on <html>.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { SKY_KEYS } from '../../../src/render/atmosphere/skyKeys.ts';
import { DocumentPhase } from '../../../src/ui/components/DocumentPhase.tsx';
import { Panel } from '../../../src/ui/components/Panel.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = Date.UTC(2026, 5, 1); // midnight UTC
const MIN = 60_000;

function mount(state: GameState, ui: React.ReactNode) {
  return render(
    <GameProvider store={createStore(state)} now={() => state.time.lastSeen}>
      {ui}
    </GameProvider>,
  );
}

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['phase'];
});

describe('ducat shortage: shown on the nearest row only (M4-16a review)', () => {
  it('several rows out of reach: one visible «Бракує дукатів», every off button still described by it', () => {
    const s = createInitialState({ seed: 5, now: T0 });
    mount({ ...s, currencies: { ...s.currencies, ducats: Big.from(0) } }, <Panel initial="full" />);
    const notes = screen.getAllByText('Бракує дукатів');
    expect(notes.length).toBeGreaterThan(1);
    const shown = notes.filter((n) => n.closest('[data-note="hidden"]') === null);
    expect(shown).toHaveLength(1);
    // The shown one is the first in display order.
    expect(notes[0]).toBe(shown[0]);
    const off = screen.getAllByRole('button', { name: /^Купити/ }).filter((b) => (b as HTMLButtonElement).disabled);
    expect(off.length).toBe(notes.length);
    for (const b of off) {
      const id = b.getAttribute('aria-describedby');
      expect(id && document.getElementById(id)?.textContent).toBe('Бракує дукатів');
    }
  });
});

describe('DocumentPhase: html[data-phase] from the game clock in its zone', () => {
  const at = (id: string): number => SKY_KEYS.find((k) => k.id === id)?.at ?? NaN;
  const stateAt = (minutes: number): GameState => {
    const s = createInitialState({ seed: 1, now: T0 + minutes * MIN });
    return { ...s, settings: { ...s.settings, tzOffsetMin: 0 } };
  };

  it('night at the night key, day at the day key', () => {
    mount(stateAt(at('night')), <DocumentPhase />);
    expect(document.documentElement.dataset['phase']).toBe('night');
    cleanup();
    mount(stateAt(at('day')), <DocumentPhase />);
    expect(document.documentElement.dataset['phase']).toBe('day');
  });
});
