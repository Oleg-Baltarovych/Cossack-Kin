// Starts the world in the host element and keeps the handle (M2-04). The world's code is a lazy chunk, so starting can
// fail on its own (a network error, a stale deploy, no WebGL) while the DOM UI already runs: the hook reports `failed`
// and `retry` runs the start again. Generic over the handle so tests can pass a stand-in world.
import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Starts a world in `host`; resolves `null` when `signal` was aborted before there was anything to create. */
export type StartWorld<W> = (host: HTMLElement, signal: AbortSignal) => Promise<W | null>;

export interface WorldState<W> {
  readonly world: W | null;
  readonly failed: boolean;
  readonly retry: () => void;
}

export function useWorld<W extends { destroy: () => void }>(
  hostRef: RefObject<HTMLElement | null>,
  start: StartWorld<W>,
): WorldState<W> {
  const [world, setWorld] = useState<W | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    // StrictMode mounts twice: a disposed effect never starts a world, and destroys one that arrives late.
    const abort = new AbortController();
    let created: W | null = null;
    start(host, abort.signal)
      .then((w) => {
        if (!w) return;
        if (abort.signal.aborted) w.destroy();
        else {
          created = w;
          setWorld(w);
        }
      })
      .catch((error: unknown) => {
        console.error('world init failed', error);
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => {
      abort.abort();
      created?.destroy();
      setWorld(null);
    };
  }, [hostRef, start, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { world, failed, retry };
}
