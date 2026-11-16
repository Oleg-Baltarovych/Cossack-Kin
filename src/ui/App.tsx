// Root DOM UI. Hosts the Pixi world canvas; HUD and sheets arrive in M1+.
import { useEffect, useRef } from 'react';
import { startWorld, type WorldApp } from '../render/index.ts';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // StrictMode mounts twice: a disposed effect destroys its app as soon as init resolves.
    let disposed = false;
    let world: WorldApp | null = null;
    startWorld(host)
      .then((created) => {
        if (disposed) created.destroy();
        else world = created;
      })
      .catch((error: unknown) => {
        console.error('world init failed', error);
      });
    return () => {
      disposed = true;
      world?.destroy();
    };
  }, []);

  return <div ref={hostRef} id="world" />;
}
