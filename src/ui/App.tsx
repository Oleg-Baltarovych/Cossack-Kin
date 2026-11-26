// Root DOM UI: the Pixi world canvas with the HUD and the bottom panel over it (SPEC §6.1). The game was loaded before
// React started (ui/game.ts, main.tsx); here it runs: the loop while the page is visible, autosave, the world.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { startAutosave } from '../platform/autosave.ts';
import { chunksLoaded } from '../platform/chunkReload.ts';
import { driveGame } from '../platform/lifecycle.ts';
import { startRaidNotifications } from '../platform/notifications.ts';
import type { WorldApp } from '../render/index.ts';
import { BootNotice } from './components/BootNotice.tsx';
import { CoinFlight, type BuildingAt } from './components/CoinFlight.tsx';
import { DocumentLang } from './components/DocumentLang.tsx';
import { Hud } from './components/Hud.tsx';
import { Panel, type Reveal } from './components/Panel.tsx';
import { RaidChest } from './components/RaidChest.tsx';
import { RaidMap } from './components/RaidMap.tsx';
import { ReturnModal } from './components/ReturnModal.tsx';
import { StoryModal } from './components/StoryModal.tsx';
import { TapFeedback } from './components/TapFeedback.tsx';
import { TierBanner } from './components/TierBanner.tsx';
import { WorldError } from './components/WorldError.tsx';
import { installGameDebug } from './debug/gameDebug.ts';
import type { Game } from './game.ts';
import { GameProvider, useGame, useGameEvent, useGameEvents } from './hooks/useGame.ts';
import { useDialogFocus } from './hooks/useDialogFocus.ts';
import { useWorld, type StartWorld } from './hooks/useWorld.ts';
import { chestQueue, EMPTY_CHESTS } from './raidReveal.ts';
import { raidAlertText } from './raidText.ts';
import { EMPTY_QUEUE, shownBeat, storyQueue } from './storyQueue.ts';
import styles from './App.module.css';

export function App({ game }: { game: Game }) {
  const hostRef = useRef<HTMLDivElement>(null);

  // The loop runs while the page is visible; pausing it (hidden, pagehide) saves. «Загін повернувся» is replanned after
  // a raid starts, a claim, a replaced state, a language change and each resume (M3-16; shown from M6/M9).
  useEffect(() => {
    const raids = startRaidNotifications(game.store, game.notifications, raidAlertText, game.now);
    if (!game.live) return raids.stop;
    const save = (): void => {
      game.saver.save(game.store.getState());
    };
    const stopLoop = driveGame(game.store, { now: game.now, onPause: save, onResume: raids.replan });
    const stopAutosave = startAutosave(game.store, game.saver);
    return () => {
      stopAutosave();
      stopLoop();
      save();
      raids.stop();
    };
  }, [game]);

  useEffect(() => (__CK_DEBUG__ ? installGameDebug(game.store, game.now, game.notifications) : undefined), [game]);

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
 * come one at a time: the save notice, then the return window, then the story beats in their queue (M2-25). The raid
 * map (M3-11) is a window the player opens from a squad's «Обрати похід»: story beats wait while it is open, and the
 * save notice or the return window close it (nothing is lost: the board is the day's, the map opens again). A raid's
 * chest (M3-12) opens on a claim — one window per action, so «Забрати все» is one — after the save notice and the
 * return window, before the story beats (a beat a claim fired waits for the chest). The map is opaque and covers the
 * whole screen, so under it HUD and panel are also hidden (laid out, not painted): at 412@3.5 the screen's last device
 * row is half outside the 915-css viewport and showed the sheet's text through the map's edge (M3 deferred 8).
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
  const [chests, toChests] = useReducer(chestQueue, EMPTY_CHESTS);
  useGameEvents(
    useCallback((events) => {
      toChests({ type: 'events', events });
    }, []),
  );
  const [mapSlot, setMapSlot] = useState<number | null>(null);
  useEffect(() => {
    if (away || noticeOpen) setMapSlot(null);
  }, [away, noticeOpen]);
  const chest = away || noticeOpen ? null : (chests.waiting[0] ?? null);
  const mapOpen = mapSlot !== null && !away && !noticeOpen && chest === null;
  const beat = shownBeat(queue, away || noticeOpen || mapOpen || chest !== null);
  const windowOpen = away || noticeOpen || mapOpen || chest !== null || beat !== null;
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
  // The upgrade coins fly to the building where the player sees it (M2-29 D).
  const buildingAt = useCallback<BuildingAt>((b) => world?.buildingOnScreen(b) ?? null, [world]);
  return (
    <div className={styles.ui}>
      <CoinFlight buildingAt={buildingAt}>
        <TapFeedback world={world} />
        <div className={styles.layer} inert={windowOpen} data-covered={mapOpen ? '' : undefined}>
          <Hud />
          <Panel
            onZone={(zone) => world?.focusZone(zone)}
            zoneSource={world?.onZoneChange}
            reveal={reveal}
            onReveal={(building, sheetTop, centre) => world?.reveal(building, sheetTop, centre)}
            onSelect={(building) => world?.mark(building)}
            onChooseRaid={setMapSlot}
          />
        </div>
        <TierBanner />
        {mapOpen && (
          <RaidMap
            slot={mapSlot}
            onClose={() => {
              setMapSlot(null);
            }}
          />
        )}
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
        {chest && (
          <RaidChest
            key={chest.key}
            chest={chest}
            onClose={() => {
              toChests({ type: 'close', key: chest.key });
            }}
          />
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
