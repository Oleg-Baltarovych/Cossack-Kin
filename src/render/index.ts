// Render entry used by the UI shell.
import { createWorldApp, type WorldApp } from './App.ts';
import { installDebugTools } from './debug/index.ts';
import { parseDebugParams, toRenderSettings } from './debug/params.ts';
import { DEFAULT_RENDER_SETTINGS } from './settings.ts';

export type { WorldApp } from './App.ts';

/**
 * Creates the world app inside `host`. Dev/test builds read debug URL params and install the debug
 * tools; in production `__CK_DEBUG__` is `false`, both branches are removed and the debug modules are
 * tree-shaken (checked by `pnpm check:dist`).
 */
export async function startWorld(host: HTMLElement): Promise<WorldApp> {
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
  if (!__CK_DEBUG__) return world;

  let disposeDebug: () => void;
  try {
    disposeDebug = installDebugTools(world, settings);
  } catch (error) {
    world.destroy();
    throw error;
  }
  return {
    ...world,
    destroy: () => {
      disposeDebug();
      world.destroy();
    },
  };
}
