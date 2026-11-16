// Pixi world app (plan §0, ADR 001): the world renders into a low-res worldRT of (W+1)×(H+1) logical px
// with nearest sampling, then one upscale sprite draws it ×scale to the canvas, shifted by
// −fracDevicePx device px. The camera moves the world by whole logical px only.
// CSP (M0-12): without this Pixi probes `new Function` (a CSP violation under `script-src 'self'`) and
// generates uniform/UBO sync code with it; the module swaps in eval-free polyfills before any renderer exists.
import 'pixi.js/unsafe-eval';
import { Application, Container, RenderTexture, Sprite, TextureSource, UPDATE_PRIORITY } from 'pixi.js';
import { frame, loadAtlases, type Atlases } from './atlases.ts';
import { cameraBounds, layerOffset, split } from './camera.ts';
import { createClock, createCosmeticRng, realLocalMinutes, type RenderClock } from './clock.ts';
import { createWorldLayers, type WorldLayer } from './layers/index.ts';
import { rampColor, rampCss } from './palette.ts';
import type { RenderSettings } from './settings.ts';
import { computeViewport, worldTargetSize, type Viewport } from './viewport.ts';

/** M0 scene width in logical px (≈ 2 screens, plan Q3); the village layout takes over in ART-05. */
export const WORLD_WIDTH = 720;
/** SPEC §9.2: 30 fps idle / 60 interactive — fixed at 60 until the interaction-driven switch (M2). */
export const TARGET_FPS = 60;

export interface WorldApp {
  readonly app: Application;
  readonly world: Container;
  readonly layers: readonly WorldLayer[];
  readonly atlases: Atlases;
  readonly clock: RenderClock;
  /** Cosmetic RNG (seeded by `?seed` in dev/test); never for game state. */
  readonly rng: () => number;
  viewport(): Viewport;
  setCamX(camX: number): void;
  destroy(): void;
}

/** Which app currently owns `body[data-ready]` (StrictMode can run two apps back to back). */
let readyOwner: object | null = null;

export async function createWorldApp(host: HTMLElement, settings: RenderSettings): Promise<WorldApp> {
  TextureSource.defaultOptions.scaleMode = 'nearest';
  host.style.background = rampCss('ink', 0);

  // Atlases first: nothing to clean up if loading fails, and the first frame already has every texture.
  const atlases = await loadAtlases();
  let vp = measure(host);
  const app = new Application();
  await app.init({
    preference: 'webgl',
    antialias: false,
    roundPixels: true,
    resolution: 1,
    autoDensity: false,
    width: vp.deviceW,
    height: vp.deviceH,
    backgroundColor: rampColor('ink', 0),
  });

  // Teardown runs in reverse creation order: observer → ticker → layers → world → worldRT → app (+ canvas).
  // It is used both by destroy() and when anything below throws during setup.
  const disposers: (() => void)[] = [];
  const disposeAll = (): void => {
    for (let undo = disposers.pop(); undo; undo = disposers.pop()) undo();
  };
  disposers.push(() => {
    app.destroy({ removeView: true }, { children: true });
  });

  try {
    const canvas = app.canvas;
    canvas.style.display = 'block';
    canvas.style.imageRendering = 'pixelated';
    host.appendChild(canvas);

    let target = worldTargetSize(vp);
    const worldRT = RenderTexture.create({
      width: target.width,
      height: target.height,
      resolution: 1,
      scaleMode: 'nearest',
      antialias: false,
      dynamic: true,
    });
    disposers.push(() => {
      worldRT.destroy(true);
    });

    const world = new Container({ label: 'world' });
    disposers.push(() => {
      world.destroy();
    });
    const layers = createWorldLayers({ swatch: frame(atlases, 'debug', 'swatch/idle/00') });
    disposers.push(() => {
      for (const layer of layers) layer.destroy();
    });
    for (const layer of layers) world.addChild(layer.container);

    const upscale = new Sprite({ texture: worldRT, label: 'upscale', roundPixels: true });
    app.stage.addChild(upscale);

    let camX = settings.camX ?? 0;
    const clock = createClock({
      frozenAt: settings.frozenAt,
      fixedMinutes: settings.fixedMinutes,
      nowMs: () => performance.now(),
      localMinutes: () => realLocalMinutes(new Date()),
    });
    const rng = createCosmeticRng(settings.seed ?? Math.floor(Math.random() * 2 ** 32));

    const applyViewport = (): void => {
      vp = measure(host);
      target = worldTargetSize(vp);
      app.renderer.resize(vp.deviceW, vp.deviceH, 1);
      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      canvas.style.width = `${String(vp.deviceW / dpr)}px`;
      canvas.style.height = `${String(vp.deviceH / dpr)}px`;
      worldRT.resize(target.width, target.height, 1);
      upscale.scale.set(vp.scale);
      const size = { viewW: target.width, viewH: target.height, worldW: WORLD_WIDTH };
      for (const layer of layers) layer.resize(size);
    };
    applyViewport();

    // Runs at NORMAL priority, i.e. before Application's own stage render (LOW).
    const renderWorld = (): void => {
      // Bounds use the visible width ceil(deviceW/scale) = target.width − 1, not logicalW (floor): with
      // floor, the camera could stop up to one partial column past the world's right edge. The spare
      // RT column is only on screen while frac > 0, i.e. strictly inside the bounds.
      const cam = split(camX, vp.scale, cameraBounds(WORLD_WIDTH, target.width - 1));
      for (const layer of layers) layer.container.x = layerOffset(cam.worldPx, layer.parallax);
      upscale.x = -cam.fracDevicePx;
      app.renderer.render({ container: world, target: worldRT, clear: true });
    };
    app.ticker.maxFPS = TARGET_FPS;
    app.ticker.add(renderWorld);
    disposers.push(() => {
      app.ticker.remove(renderWorld);
    });

    // Readiness for screenshots (plan M0-05/08): atlases are loaded (awaited above) and the first frame
    // reached the canvas (UTILITY runs after LOW).
    const readyToken = {};
    app.ticker.addOnce(
      () => {
        document.body.dataset.ready = '1';
        readyOwner = readyToken;
      },
      undefined,
      UPDATE_PRIORITY.UTILITY,
    );
    disposers.push(() => {
      if (readyOwner !== readyToken) return;
      delete document.body.dataset.ready;
      readyOwner = null;
    });

    const observer = new ResizeObserver(applyViewport);
    observer.observe(host);
    disposers.push(() => {
      observer.disconnect();
    });

    return {
      app,
      world,
      layers,
      atlases,
      clock,
      rng,
      viewport: () => vp,
      setCamX: (x) => {
        camX = x;
      },
      destroy: disposeAll,
    };
  } catch (error) {
    disposeAll();
    throw error;
  }
}

function measure(host: HTMLElement): Viewport {
  return computeViewport(host.clientWidth, host.clientHeight, window.devicePixelRatio);
}
