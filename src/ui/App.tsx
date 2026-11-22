// Root DOM UI: the Pixi world canvas with the HUD and the bottom panel over it (SPEC §6.1). The game was loaded before
// React started (ui/game.ts, main.tsx); here it runs: the loop while the page is visible, autosave, the world.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { startAutosave } from '../platform/autosave.ts';
import { chunksLoaded } from '../platform/chunkReload.ts';
import { driveGame } from '../platform/lifecycle.ts';
import type { WorldApp } from '../render/index.ts';
import { BootNotice } from './components/BootNotice.tsx';
import { CoinFlight } from './components/CoinFlight.tsx';
import { DocumentLang } from './components/DocumentLang.tsx';
import { Hud } from './components/Hud.tsx';
import { Panel, type Reveal } from './components/Panel.tsx';
import { ReturnModal } from './components/ReturnModal.tsx';
import { StoryModal } from './components/StoryModal.tsx';
import { TapFeedback } from './components/TapFeedback.tsx';
import { TierBanner } from './components/TierBanner.tsx';
import { WorldError } from './components/WorldError.tsx';
import { installGameDebug } from './debug/gameDebug.ts';
import type { Game } from './game.ts';
import { GameProvider, useGame, useGameEvent } from './hooks/useGame.ts';
import { useDialogFocus } from './hooks/useDialogFocus.ts';
import { useWorld, type StartWorld } from './hooks/useWorld.ts';
import { EMPTY_QUEUE, shownBeat, storyQueue } from './storyQueue.ts';
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

  useEffect(() => (__CK_DEBUG__ ? installGameDebug(game.store, game.now) : undefined), [game]);

  // The world reads the game through the bridge (render/bridge.ts): events and selectors only. Pixi and the scene are a
  // lazy chunk (M2-04): the HUD and the panel paint first, the world joins when its code and atlases arrive.
  const startWorld = useCallback<StartWorld<WorldApp>>(
    async (host, signal) => {
      const render = await import('../render/index.ts');
      chunksLoaded();
      return signal.aborted
        ? null
        : render.startWorld(host, game.store, game.sceneTiers, game.sceneVariants, game.sceneVisitors);
    },
    [game],
  );
  const { world, failed, retry } = useWorld(hostRef, startWorld);

  return (
    <GameProvider store={game.store} now={game.now}>
      <DocumentLang />
      <div ref={hostRef} id="world" />
      {failed && <WorldError onRetry={retry} />}
      {game.ui && <GameUi world={world} notice={game.notice} />}
    </GameProvider>
  );
}

/**
 * HUD and panel, made inert (no focus, no screen reader) while a window is open — aria-modal alone is not. Windows
 * come one at a time: the save notice, then the return window, then the story beats in their queue (M2-25).
 */
export function GameUi({ world, notice }: { world: WorldApp | null; notice: Game['notice'] }) {
  const away = useGame((s) => s.returnReport !== null);
  const [noticeOpen, setNoticeOpen] = useState(notice !== 'none');
  // Beats the core fired (online, or several at the end of an absence) wait for their modal here.
  const [queue, toQueue] = useReducer(storyQueue, EMPTY_QUEUE);
  useGameEvent(
    useCallback((e) => {
      if (e.type === 'StoryBeatReached' || e.type === 'StateReplaced') toQueue(e);
    }, []),
  );
  const beat = shownBeat(queue, away || noticeOpen);
  const windowOpen = away || noticeOpen || beat !== null;
  useDialogFocus(windowOpen);
  // A tap on a building opens its row in the sheet (SPEC §3.3, M2-13); a tap on open ground earns (TapFeedback).
  const [reveal, setReveal] = useState<Reveal | null>(null);
  useEffect(
    () =>
      world?.onTap((tap) => {
        if (tap.building) setReveal({ building: tap.building });
      }),
    [world],
  );
  return (
    <div className={styles.ui}>
      <CoinFlight>
        <TapFeedback world={world} />
        <div className={styles.layer} inert={windowOpen}>
          <Hud />
          <Panel
            onZone={(zone) => world?.focusZone(zone)}
            zoneSource={world?.onZoneChange}
            reveal={reveal}
            onReveal={(building, sheetTop) => world?.reveal(building, sheetTop)}
            onSelect={(building) => world?.mark(building)}
          />
        </div>
        <TierBanner />
        {/* The save notice first: the return window waits under it, the story beats under both. */}
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
        {beat && (
          <StoryModal
            key={beat.key}
            beat={beat}
            onClose={() => {
              toQueue({ type: 'close', key: beat.key });
            }}
          />
        )}
      </CoinFlight>
    </div>
  );
}
