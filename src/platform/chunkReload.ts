// Stale deploy (M2-04): after a new build the old entry may ask for lazy chunks that no longer exist. Vite reports a
// failed lazy load as `vite:preloadError` on window; the first one in a tab session reloads the page (fresh
// index.html). A flag in sessionStorage allows one reload only, so a chunk that is really broken ends in the world
// notice (ui/components/WorldError.tsx), never in a reload loop. The flag is cleared once the world's code loaded.
const KEY = 'ck.chunkReload';

export interface ChunkReloadEnv {
  readonly target: EventTarget;
  /** The tab's sessionStorage; may throw when storage is blocked. */
  readonly storage: () => Storage;
  readonly reload: () => void;
}

const browser = (): ChunkReloadEnv => ({
  target: window,
  storage: () => window.sessionStorage,
  reload: () => {
    window.location.reload();
  },
});

/** Listens for failed lazy loads; returns the uninstaller. */
export function installChunkReload(env: ChunkReloadEnv = browser()): () => void {
  const onError = (): void => {
    try {
      const storage = env.storage();
      if (storage.getItem(KEY) !== null) return;
      storage.setItem(KEY, '1');
    } catch {
      // Without storage the reload cannot be limited to one: no reload, the world notice offers a retry.
      return;
    }
    // The failed import still rejects (no preventDefault): the page reloads, and the notice covers a reload that
    // does not happen (e.g. blocked by the browser).
    env.reload();
  };
  env.target.addEventListener('vite:preloadError', onError);
  return () => {
    env.target.removeEventListener('vite:preloadError', onError);
  };
}

/** The lazy code loaded: a later stale deploy may reload once again. */
export function chunksLoaded(storage: () => Storage = () => window.sessionStorage): void {
  try {
    storage().removeItem(KEY);
  } catch {
    // Blocked storage: no flag was ever written.
  }
}
