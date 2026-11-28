// @vitest-environment jsdom
// A lazy sheet tab (M4-13 review): one «Завантаження…» line while its chunk loads; a failed import shows «Не вдалося
// завантажити» with a retry, and the retry imports again (React.lazy alone would keep the rejected import).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { LazySlot, retryable } from '../../../src/ui/components/LazySlot.tsx';
import { FROZEN_NOW } from '../../../src/ui/debug/gameDebug.ts';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

afterEach(cleanup);

function Loaded({ word }: { readonly word: string }) {
  return <p>{word}</p>;
}

function mount(of: ReturnType<typeof retryable<{ readonly word: string }>>) {
  render(
    <GameProvider store={createStore(createInitialState({ seed: 1, now: FROZEN_NOW }))} now={() => FROZEN_NOW}>
      <LazySlot of={of} props={{ word: 'готово' }} />
    </GameProvider>,
  );
}

describe('LazySlot (M4-13)', () => {
  it('loading line, then the tab', async () => {
    mount(retryable(() => Promise.resolve({ default: Loaded })));
    expect(screen.getByText('Завантаження…')).toBeDefined();
    expect(await screen.findByText('готово')).toBeDefined();
  });

  it('a failed import: the notice with a retry that imports again', async () => {
    // React reports the caught error to the console; it is the case under test.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi
      .fn<() => Promise<{ default: typeof Loaded }>>()
      .mockRejectedValueOnce(new Error('chunk gone'))
      .mockResolvedValue({ default: Loaded });
    mount(retryable(load));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Не вдалося завантажити');
    fireEvent.click(screen.getByRole('button', { name: 'Спробувати ще' }));
    expect(await screen.findByText('готово')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
