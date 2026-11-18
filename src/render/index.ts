// Render entry used by the UI shell.
import { createWorldApp, type WorldApp } from './App.ts';
import { connectWorld, type GameView, type TiersOf } from './bridge.ts';
import { installDebugTools } from './debug/index.ts';
import { parseDebugParams, toRenderSettings } from './debug/params.ts';
import { DEFAULT_RENDER_SETTINGS } from './settings.ts';

export type { WorldApp, WorldTap } from './App.ts';
export type { GameView, TiersOf } from './bridge.ts';

/**
 * Creates the world app inside `host`. Dev/test builds read debug URL params and install the debug
 * tools; in production `__CK_DEBUG__` is `false`, both branches are removed and the debug modules are
 * tree-shaken (checked by `pnpm check:dist`). With `game` the scene follows it from the very first frame
 * (render/bridge.ts); its tap listener comes first, so a tap's coin knows where to pop. `tiersOf` is a dev/test
 * override of the plots' tiers (`?state=tiers`); production passes nothing.
 */
export async function startWorld(host: HTMLElement, game?: GameView, tiersOf?: TiersOf): Promise<WorldApp> {
  const settings = __CK_DEBUG__
    ? toRenderSettings(parseDebugParams(window.location.search, import.meta.env.MODE))
    : DEFAULT_RENDER_SETTINGS;
  let world: WorldApp;
  try {
    world = await createWorldApp(host, settings);
  } catch (error) {
    // Fail loudly for screenshots/e2e: `data-ready="error"` instead of a page that never becomes ready.
    document.body.dataset.ready = 'error';
    throw error;
  }
  const disconnect = game ? connectWorld(world, game, tiersOf) : () => undefined;
  let disposeDebug = (): void => undefined;
  if (__CK_DEBUG__) {
    try {
      disposeDebug = installDebugTools(world, settings);
    } catch (error) {
      disconnect();
      world.destroy();
      throw error;
    }
  }
  return {
    ...world,
    destroy: () => {
      disconnect();
      disposeDebug();
      world.destroy();
    },
  };
}
