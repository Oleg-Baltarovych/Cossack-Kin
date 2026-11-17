// Dev/test-only debug tools (plan M0-05/06): frame stats, draw-call counter, overlay, window.__CK__.
// Imported only behind `__CK_DEBUG__` (render/index.ts), so none of it reaches the production bundle.
import { UPDATE_PRIORITY } from 'pixi.js';
import type { WorldApp } from '../App.ts';
import { particles } from '../fx/registry.ts';
import type { RenderSettings } from '../settings.ts';
import { installDrawCounter } from './drawCounter.ts';
import { createFrameStats } from './frameStats.ts';
import { createOverlay } from './overlay.ts';

export interface DebugStats {
  /** Mean fps over the last second. */
  fps: number;
  /** Mean CPU ms per frame over the last second (world RT render + stage render). */
  frameMs: number;
  /** GL draw calls of the last frame, filter passes included; `-1` without a WebGL context. */
  drawCalls: number;
  particles: number;
  scale: number;
  logicalW: number;
  logicalH: number;
  /** The tier in use: `low|med|high` when fixed by `?quality`, `auto:<tier>` while auto-detected (ART-18). */
  quality: string;
  /** Frames rendered since start. */
  frames: number;
}

export interface DebugHandle {
  readonly stats: DebugStats;
  readonly settings: RenderSettings;
}

declare global {
  interface Window {
    __CK__?: DebugHandle;
  }
}

/** Installs stats collection (always, in debug builds) and the overlay (`?overlay`). Returns dispose. */
export function installDebugTools(world: WorldApp, settings: RenderSettings): () => void {
  const { app } = world;
  const renderer = app.renderer;
  const counter = 'gl' in renderer ? installDrawCounter(renderer.gl) : null;
  const frameStats = createFrameStats(1000);
  const overlay = settings.showOverlay ? createOverlay(document.body) : null;

  const vp = world.viewport();
  const stats: DebugStats = {
    fps: 0,
    frameMs: 0,
    drawCalls: counter ? 0 : -1,
    particles: 0,
    scale: vp.scale,
    logicalW: vp.logicalW,
    logicalH: vp.logicalH,
    quality: settings.quality ?? `auto:${world.quality()}`,
    frames: 0,
  };
  window.__CK__ = { stats, settings };

  let frameStart = 0;
  // HIGH runs before the world render (NORMAL) and the stage render (LOW); UTILITY runs after both.
  const begin = (): void => {
    frameStart = performance.now();
    counter?.reset();
  };
  const end = (): void => {
    const now = performance.now();
    const { scale, logicalW, logicalH } = world.viewport();
    Object.assign(stats, { scale, logicalW, logicalH, particles: particles.active });
    stats.quality = settings.quality ?? `auto:${world.quality()}`;
    if (counter) stats.drawCalls = counter.count();
    stats.frames += 1;
    const published = frameStats.sample(now, now - frameStart);
    if (published) Object.assign(stats, frameStats.current());
    if (overlay && (published || stats.frames === 1)) overlay.update(stats);
  };
  app.ticker.add(begin, undefined, UPDATE_PRIORITY.HIGH);
  app.ticker.add(end, undefined, UPDATE_PRIORITY.UTILITY);

  return () => {
    app.ticker.remove(begin);
    app.ticker.remove(end);
    counter?.uninstall();
    overlay?.destroy();
    if (window.__CK__?.stats === stats) delete window.__CK__;
  };
}
