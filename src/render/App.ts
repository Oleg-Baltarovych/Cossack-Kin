// Pixi world app (plan §0, ADR 001): the world renders into a low-res worldRT of (W+1)×(H+1) logical px
// with nearest sampling, then one upscale sprite draws it ×scale to the canvas, shifted by
// −fracDevicePx device px. The camera moves the world by whole logical px only.
// Inside worldRT (ART-04/08): sky (ungraded light source) → far + mid landscape (ungraded, painted in the sky's
// colours) → graded container (clouds, ground … fx, one ColorMapFilter with the CPU-blended time-of-day LUT) →
// [water passes, ART-09 water.ts: the band above the horizon mirrored into the river under it, two draw calls] →
// light layer (haze band) → post-grade container (emissive hook, debug swatch).
// CSP (M0-12): without this Pixi probes `new Function` (a CSP violation under `script-src 'self'`) and
// generates uniform/UBO sync code with it; the module swaps in eval-free polyfills before any renderer exists.
import 'pixi.js/unsafe-eval';
import {
  Application,
  Container,
  Rectangle,
  RenderTexture,
  Sprite,
  TextureSource,
  UPDATE_PRIORITY,
  type Texture,
} from 'pixi.js';
import { KHORTYTSIA_ZONES } from '../content/villages/khortytsia.layout.ts';
import { WORLD_WIDTH_PX } from '../content/world.ts';
import { dayCycle } from './atmosphere/dayCycle.ts';
import { emissiveLevel } from './atmosphere/emissive.ts';
import { createGrading, loadLuts } from './atmosphere/grading.ts';
import { frame, loadAtlases, type Atlases } from './atlases.ts';
import { cameraBounds, layerOffset, split } from './camera.ts';
import { createClock, createCosmeticRng, realLocalMinutes, type RenderClock } from './clock.ts';
import { createWorldLayers, type WorldLayer } from './layers/index.ts';
import { horizonY } from './layers/Layer.ts';
import { createWater } from './water.ts';
import { createPostGrade } from './postGrade.ts';
import { rampColor, rampCss } from './palette.ts';
import type { RenderSettings } from './settings.ts';
import { computeViewport, worldTargetSize, type Viewport } from './viewport.ts';

/** Scene width in logical px (≈ 2 screens, plan Q3). */
export const WORLD_WIDTH = WORLD_WIDTH_PX;
/** Atlas of the current scene (the farm of land 1). */
const SCENE_ATLAS = 'khortytsia';
/** SPEC §9.2: 30 fps idle / 60 interactive — fixed at 60 until the interaction-driven switch (M2). */
export const TARGET_FPS = 60;

export interface WorldApp {
  readonly app: Application;
  readonly world: Container;
  readonly layers: readonly WorldLayer[];
  /** Post-grade container at ground parallax for emissive night masks (ART-05/16). */
  readonly emissive: Container;
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

  // Atlases and LUTs first: nothing to clean up if loading fails, and the first frame already has everything.
  const [atlases, luts] = await Promise.all([loadAtlases(), loadLuts()]);
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

    // The world renders in two parts with the water passes between them (ART-09): the base (sky … graded ground)
    // is what the river mirrors; the top (light layer with the haze band, post-grade emissive) lies over the water too.
    const world = new Container({ label: 'world' });
    const worldTop = new Container({ label: 'world-top' });
    disposers.push(() => {
      world.destroy();
      worldTop.destroy();
    });
    const grading = createGrading(luts);
    disposers.push(() => {
      grading.destroy();
    });
    const graded = new Container({ label: 'graded' });
    graded.filters = [grading.filter];
    disposers.push(() => {
      graded.filters = [];
      graded.destroy();
    });
    // The debug swatch (and its atlas) exist only in dev/test builds; production drops both (M0-08 review).
    const layout = KHORTYTSIA_ZONES[settings.zone];
    const sceneFrame = (name: string): Texture => frame(atlases, SCENE_ATLAS, name);
    const post = createPostGrade({
      layout,
      frame: (name) => atlases.get(SCENE_ATLAS)?.textures[name] ?? null,
      swatch: __CK_DEBUG__ ? frame(atlases, 'debug', 'swatch/idle/00') : undefined,
    });
    disposers.push(() => {
      post.container.destroy({ children: true });
    });
    const layers = createWorldLayers({
      layout,
      frame: sceneFrame,
      weather: settings.weather,
      quality: settings.quality,
      lessMotion: settings.lessMotion,
    });
    const water = createWater(worldRT, layout.waterRows, settings.weather === 'fog');
    disposers.push(() => {
      water.destroy();
    });
    disposers.push(() => {
      for (const layer of layers) layer.destroy();
    });
    for (const layer of layers) {
      // Sky, far/mid landscape (painted in the sky's colours) and the light layer are not graded by the world LUT.
      const ungraded = layer.id === 'sky' || layer.id === 'far' || layer.id === 'mid' || layer.id === 'light';
      if (layer.id === 'light') {
        world.addChild(graded);
        worldTop.addChild(layer.container);
        continue;
      }
      (ungraded ? world : graded).addChild(layer.container);
    }
    worldTop.addChild(post.container);

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
      post.resize(size);
      water.resize(target.width, target.height, horizonY(target.height));
      // Whole worldRT: the filter pass covers every row even where the graded layers draw nothing yet.
      graded.filterArea = new Rectangle(0, 0, target.width, target.height);
    };
    applyViewport();

    // Runs at NORMAL priority, i.e. before Application's own stage render (LOW).
    const renderWorld = (): void => {
      // Bounds use the visible width ceil(deviceW/scale) = target.width − 1, not logicalW (floor): with
      // floor, the camera could stop up to one partial column past the world's right edge. The spare
      // RT column is only on screen while frac > 0, i.e. strictly inside the bounds.
      const cam = split(camX, vp.scale, cameraBounds(WORLD_WIDTH, target.width - 1));
      const minutes = clock.minutesOfDay();
      const frameInfo = { minutes, seconds: clock.seconds(), cycle: dayCycle(minutes), camX: cam.worldPx };
      grading.update(frameInfo.cycle, minutes);
      post.setEmissive(emissiveLevel(frameInfo.cycle));
      for (const layer of layers) {
        layer.update(frameInfo);
        layer.container.x = layerOffset(cam.worldPx, layer.parallax);
      }
      post.container.x = layerOffset(cam.worldPx, post.parallax);
      upscale.x = -cam.fracDevicePx;
      app.renderer.render({ container: world, target: worldRT, clear: true });
      water.render(app.renderer, frameInfo.seconds, frameInfo.cycle);
      app.renderer.render({ container: worldTop, target: worldRT, clear: false });
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
      emissive: post.emissive,
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
