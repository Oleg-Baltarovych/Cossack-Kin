// @vitest-environment jsdom
// The world is a lazy chunk (M2-04): its start can fail while the DOM UI runs. A failure shows a notice with a retry;
// a retry starts it again; a late world after unmount is destroyed; a stale deploy reloads once per tab session.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { chunksLoaded, installChunkReload } from '../../../src/platform/chunkReload.ts';
import { WorldError } from '../../../src/ui/components/WorldError.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';
import { useWorld, type StartWorld } from '../../../src/ui/hooks/useWorld.ts';

const T0 = 1_763_400_000_000;

interface FakeWorld {
  readonly id: number;
  readonly destroy: () => void;
}

function Harness({ start }: { start: StartWorld<FakeWorld> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { world, failed, retry } = useWorld(hostRef, start);
  return (
    <>
      <div ref={hostRef} />
      {world && <p>world {world.id}</p>}
      {failed && <WorldError onRetry={retry} />}
    </>
  );
}

function mount(start: StartWorld<FakeWorld>, lang: GameState['settings']['lang'] = 'uk') {
  const s = createInitialState({ seed: 1, now: T0 });
  const store = createStore({ ...s, settings: { ...s.settings, lang } });
  return render(
    <GameProvider store={store} now={() => T0}>
      <Harness start={start} />
    </GameProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('world start (M2-04)', () => {
  it('a failed start shows a notice; «Спробувати ще» starts the world again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const start = vi
      .fn<StartWorld<FakeWorld>>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce({ id: 2, destroy: () => undefined });
    mount(start);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Світ не завантажився');
    fireEvent.click(screen.getByRole('button', { name: 'Спробувати ще' }));

    expect(await screen.findByText('world 2')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('the notice is translated', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mount(() => Promise.reject(new Error('no WebGL')), 'en');
    expect((await screen.findByRole('alert')).textContent).toContain('The world did not load');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('unmounted before the start resolves: the start sees the abort and a late world is destroyed, no notice', async () => {
    const destroy = vi.fn();
    let resolve: (w: FakeWorld) => void = () => undefined;
    let signal: AbortSignal | undefined;
    const view = mount(
      (_host, s) =>
        new Promise((r) => {
          signal = s;
          resolve = r;
        }),
    );
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolve({ id: 1, destroy });
      await Promise.resolve();
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('unmount destroys the running world', async () => {
    const destroy = vi.fn();
    const view = mount(() => Promise.resolve({ id: 1, destroy }));
    expect(await screen.findByText('world 1')).toBeTruthy();
    view.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('stale deploy reload (M2-04)', () => {
  function env(storage: () => Storage = () => window.sessionStorage) {
    const target = new EventTarget();
    const reload = vi.fn();
    const uninstall = installChunkReload({ target, storage, reload });
    const fail = (): void => {
      target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    };
    return { reload, uninstall, fail };
  }

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('reloads once per tab session; a second failure is left to the world notice', () => {
    const { reload, fail, uninstall } = env();
    fail();
    fail();
    expect(reload).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it('after the world code loaded, a later stale deploy may reload again', () => {
    const { reload, fail, uninstall } = env();
    fail();
    chunksLoaded();
    fail();
    expect(reload).toHaveBeenCalledTimes(2);
    uninstall();
  });

  it('never reloads without storage (no way to stop a loop)', () => {
    const { reload, fail, uninstall } = env(() => {
      throw new Error('blocked');
    });
    fail();
    expect(reload).not.toHaveBeenCalled();
    uninstall();
  });

  it('uninstall stops listening', () => {
    const { reload, fail, uninstall } = env();
    uninstall();
    fail();
    expect(reload).not.toHaveBeenCalled();
  });
});
