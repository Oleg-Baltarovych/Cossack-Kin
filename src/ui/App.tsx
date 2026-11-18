// Root DOM UI: the Pixi world canvas with the HUD and the bottom panel over it (SPEC §6.1). The game was loaded before
// React started (ui/game.ts, main.tsx); here it runs: the loop while the page is visible, autosave, the world.
import { useEffect, useRef, useState } from 'react';
import { startAutosave } from '../platform/autosave.ts';
import { driveGame } from '../platform/lifecycle.ts';
import { startWorld, type WorldApp } from '../render/index.ts';
import { BootNotice } from './components/BootNotice.tsx';
import { DocumentLang } from './components/DocumentLang.tsx';
import { Hud } from './components/Hud.tsx';
import { Panel } from './components/Panel.tsx';
import { ReturnModal } from './components/ReturnModal.tsx';
import { TapFeedback } from './components/TapFeedback.tsx';
import { installGameDebug } from './debug/gameDebug.ts';
import type { Game } from './game.ts';
import { GameProvider, useGame } from './hooks/useGame.ts';
import styles from './App.module.css';

export function App({ game }: { game: Game }) {
  const hostRef = useRef<HTMLDivElement>(null);

  // The loop runs while the page is visible; pausing it (hidden, pagehide) saves.
  useEffect(() => {
    if (!game.live) return undefined;
    const save = (): void => {
      game.saver.save(game.store.getState());
    };
    const stopLoop = driveGame(game.store, { now: game.now, onPause: save });
    const stopAutosave = startAutosave(game.store, game.saver);
    return () => {
      stopAutosave();
      stopLoop();
      save();
    };
  }, [game]);

  useEffect(() => (__CK_DEBUG__ ? installGameDebug(game.store) : undefined), [game]);

  const [world, setWorld] = useState<WorldApp | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // StrictMode mounts twice: a disposed effect destroys its app as soon as init resolves.
    let disposed = false;
    let created: WorldApp | null = null;
    // The world reads the game through the bridge (render/bridge.ts): events and selectors only.
    startWorld(host, game.store)
      .then((w) => {
        if (disposed) w.destroy();
        else {
          created = w;
          setWorld(w);
        }
      })
      .catch((error: unknown) => {
        console.error('world init failed', error);
      });
    return () => {
      disposed = true;
      created?.destroy();
      setWorld(null);
    };
  }, [game]);

  return (
    <GameProvider store={game.store} now={game.now}>
      <DocumentLang />
      <div ref={hostRef} id="world" />
      {game.ui && <GameUi world={world} notice={game.notice} />}
    </GameProvider>
  );
}

/** HUD and panel, made inert (no focus, no screen reader) while a window is open — aria-modal alone is not. */
function GameUi({ world, notice }: { world: WorldApp | null; notice: Game['notice'] }) {
  const away = useGame((s) => s.returnReport !== null);
  const [noticeOpen, setNoticeOpen] = useState(notice !== 'none');
  return (
    <div className={styles.ui}>
      <TapFeedback world={world} />
      <div className={styles.layer} inert={away || noticeOpen}>
        <Hud />
        <Panel />
      </div>
      {/* The save notice first: the return window waits under it. */}
      {noticeOpen ? (
        <BootNotice
          notice={notice}
          onClose={() => {
            setNoticeOpen(false);
          }}
        />
      ) : (
        <ReturnModal />
      )}
    </div>
  );
}
