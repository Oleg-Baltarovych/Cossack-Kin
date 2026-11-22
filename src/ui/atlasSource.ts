// One generated atlas read by the DOM (plan M2-14 icons, M2-25 portraits): its JSON is fetched once, on the first
// component that asks, retried once (a dropped request on a flaky connection should not cost it for the session) and
// parsed by the caller's validator (the JSON is untrusted input). Same origin: CSP `connect-src 'self'`, `img-src
// 'self'`. Until it arrives a component draws a placeholder of its size; if it never does, its text fallback.
import { useEffect, useSyncExternalStore } from 'react';

/** What a component can draw now: the parsed atlas, nothing yet (`loading`), or never (`failed`). */
export type AtlasState<T> = T | 'loading' | 'failed';

export const ATLAS_DIR = `${import.meta.env.BASE_URL}atlases/`;
const ATTEMPTS = 2;

/** An atlas image name as `pnpm sprites` writes it (no path, no query). */
export const ATLAS_IMAGE = /^[a-z][a-z0-9-]*\.png$/;
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
export const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export interface AtlasSource<T> {
  /** The atlas, `loading` until it arrives, or `failed`; the first call starts the load. */
  readonly use: () => AtlasState<T>;
}

/**
 * `file` under `atlases/`, parsed by `parse` (throws on a malformed sheet). `failedMessage` is warned (production too:
 * the page still works, but the gap should show in a report) with the error once every attempt failed.
 */
export function atlasSource<T>(
  file: string,
  parse: (json: unknown, dir: string) => T,
  failedMessage: string,
): AtlasSource<T> {
  let state: AtlasState<T> = 'loading';
  let attempts = 0;
  const listeners = new Set<() => void>();
  const settle = (next: AtlasState<T>): void => {
    state = next;
    for (const l of listeners) l();
  };
  const load = (): void => {
    if (attempts > 0 || typeof fetch !== 'function') return;
    const attempt = (): void => {
      attempts += 1;
      fetch(`${ATLAS_DIR}${file}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`${file}: HTTP ${String(r.status)}`);
          return parse(await r.json(), ATLAS_DIR);
        })
        .then(settle)
        .catch((error: unknown) => {
          if (attempts < ATTEMPTS) {
            attempt();
            return;
          }
          console.warn(failedMessage, error);
          settle('failed');
        });
    };
    attempt();
  };
  const subscribe = (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const snapshot = (): AtlasState<T> => state;
  return {
    use: () => {
      useEffect(load, []);
      return useSyncExternalStore(subscribe, snapshot, snapshot);
    },
  };
}
