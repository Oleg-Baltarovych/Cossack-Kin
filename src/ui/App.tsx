// Root DOM UI: the Pixi world canvas with the HUD and the bottom panel over it (SPEC §6.1). Owns the one game store
// and the loop that ticks it (until saves land in M1-13 a reload starts a new game).
import { useEffect, useRef, useState } from 'react';
import { createInitialState } from '../core/state.ts';
import { createStore, type GameStore } from '../core/store.ts';
import { newSeed, startLoop } from '../platform/loop.ts';
import { startWorld, type WorldApp } from '../render/index.ts';
import { Hud } from './components/Hud.tsx';
import { Panel } from './components/Panel.tsx';
import { FROZEN_NOW, parseGameDebug, presetState } from './debug/gameDebug.ts';
import { GameProvider } from './hooks/useGame.ts';
import styles from './App.module.css';

interface Game {
  readonly store: GameStore;
  readonly now: () => number;
  /** false: `?freeze` — the clock stands still, no loop. */
  readonly live: boolean;
  /** false: `?ui=0` (world-only screenshots). */
  readonly ui: boolean;
}

function createGame(): Game {
  if (__CK_DEBUG__) {
    const d = parseGameDebug(window.location.search, import.meta.env.MODE);
    const seed = d.seed ?? newSeed();
    const now = d.frozen ? () => FROZEN_NOW : Date.now;
    const state = d.preset ? presetState(d.preset, seed, now()) : createInitialState({ seed, now: now() });
    return { store: createStore(state), now, live: !d.frozen, ui: d.ui };
  }
  const now = Date.now;
  return { store: createStore(createInitialState({ seed: newSeed(), now: now() })), now, live: true, ui: true };
}

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [game] = useState(createGame);

  useEffect(() => (game.live ? startLoop(game.store, { now: game.now }) : undefined), [game]);

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

  return (
    <GameProvider store={game.store} now={game.now}>
      <div ref={hostRef} id="world" />
      {game.ui && (
        <div className={styles.ui}>
          <Hud />
          <Panel />
        </div>
      )}
    </GameProvider>
  );
}
