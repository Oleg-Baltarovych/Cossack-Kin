// Root DOM UI: the Pixi world canvas with the HUD and the bottom panel over it (SPEC §6.1). Owns the one game store
// and the loop that ticks it while the page is visible (until saves land in M1-13 a reload starts a new game).
import { useEffect, useRef, useState } from 'react';
import { createInitialState } from '../core/state.ts';
import { createStore, type GameStore } from '../core/store.ts';
import { driveGame } from '../platform/lifecycle.ts';
import { newSeed } from '../platform/loop.ts';
import { startWorld, type WorldApp } from '../render/index.ts';
import { DocumentLang } from './components/DocumentLang.tsx';
import { Hud } from './components/Hud.tsx';
import { Panel } from './components/Panel.tsx';
import { ReturnModal } from './components/ReturnModal.tsx';
import { FROZEN_NOW, installGameDebug, parseGameDebug, presetState } from './debug/gameDebug.ts';
import { GameProvider, useGame } from './hooks/useGame.ts';
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
    const base = d.preset ? presetState(d.preset, seed, now()) : createInitialState({ seed, now: now() });
    const state = d.lang ? { ...base, settings: { ...base.settings, lang: d.lang } } : base;
    return { store: createStore(state), now, live: !d.frozen, ui: d.ui };
  }
  const now = Date.now;
  return { store: createStore(createInitialState({ seed: newSeed(), now: now() })), now, live: true, ui: true };
}

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [game] = useState(createGame);

  // M1-13 adds the save as driveGame's onPause.
  useEffect(() => (game.live ? driveGame(game.store, { now: game.now }) : undefined), [game]);

  useEffect(() => (__CK_DEBUG__ ? installGameDebug(game.store) : undefined), [game]);

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
      <DocumentLang />
      <div ref={hostRef} id="world" />
      {game.ui && <GameUi />}
    </GameProvider>
  );
}

/** HUD and panel, made inert (no focus, no screen reader) while the return window is open — aria-modal alone is not. */
function GameUi() {
  const away = useGame((s) => s.returnReport !== null);
  return (
    <div className={styles.ui}>
      <div className={styles.layer} inert={away}>
        <Hud />
        <Panel />
      </div>
      <ReturnModal />
    </div>
  );
}
