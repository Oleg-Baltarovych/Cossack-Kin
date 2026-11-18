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
import { KHORTYTSIA_WORLD, type ZoneId } from '../content/villages/khortytsia.layout.ts';
import { dayCycle } from './atmosphere/dayCycle.ts';
import { emissiveLevel } from './atmosphere/emissive.ts';
import { createGrading, gradeCycle, loadLuts } from './atmosphere/grading.ts';
import { frame, loadAtlases, type Atlases } from './atlases.ts';
import { cameraBounds, layerOffset, split } from './camera.ts';
import {
  cancel,
  createMotion,
  glideTo,
  isSettled,
  jumpTo,
  move,
  press,
  release,
  step,
  type CameraView,
  type PointerSample,
} from './camera/motion.ts';
import { zoneAt } from './zones.ts';
import { createClock, createCosmeticRng, realLocalMinutes, type RenderClock } from './clock.ts';
import { createWorldLayers, type WorldLayer } from './layers/index.ts';
import { horizonY } from './layers/Layer.ts';
import { createWater } from './water.ts';
import { createPostGrade } from './postGrade.ts';
import { rampColor, rampCss } from './palette.ts';
import { DEFAULT_SCENE, type SceneState } from './scene.ts';
import type { Quality, RenderSettings } from './settings.ts';
import { createFpsProbe } from './quality.ts';
import { AUTO_QUALITY, CAMERA } from './atmosphere/config.ts';
import { createCoinFx } from './fx/coins.ts';
import { computeViewport, worldTargetSize, type Viewport } from './viewport.ts';

/** The continuous world of land 1 (plan M2-01): farm → suburb → Sich; `?zone=` only places the camera. */
const WORLD = KHORTYTSIA_WORLD;
/** Atlas of the current scene (the farm of land 1). */
const SCENE_ATLAS = 'khortytsia';
/** SPEC §9.2: 30 fps idle / 60 interactive — fixed at 60 until the interaction-driven switch (M2). */
export const TARGET_FPS = 60;

/** A tap on the world: client (CSS) px for DOM feedback, ground-space logical px for the scene. */
export interface WorldTap {
  readonly clientX: number;
  readonly clientY: number;
  readonly x: number;
  readonly y: number;
}

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
  /** The quality tier in use (the auto-detect may change it once, ART-18). */
  quality(): Quality;
  /** Puts the camera at `camX` logical px at once (clamped to the world). */
  setCamX(camX: number): void;
  /** Glides the camera to the zone's anchor (UI tabs, M2-02); «менше руху» jumps. Cosmetic: no game state. */
  focusZone(zone: ZoneId): void;
  /** The camera x on screen in the last frame (logical px, a multiple of 1/scale). */
  camX(): number;
  /**
   * Calls `listener` with the zone under the view's centre now and whenever the camera settles in another one
   * (with hysteresis, M2-02: the panel tab follows the camera); returns the unsubscribe function.
   */
  readonly onZoneChange: (listener: (zone: ZoneId) => void) => () => void;
  /**
   * «Менше руху» at runtime (the settings screen, M2): the camera (no glide, no coast) and the ambient clock follow at
   * once; plants, coins and particle budgets still take the value the world was created with.
   */
  setLessMotion(on: boolean): void;
  /** What the game shows (plots by tier, wind); render/bridge.ts sets it from store events (M1-19). */
  setScene(scene: SceneState): void;
  /** Calls `listener` for every tap on the world (not a drag; both taps of a double tap); returns the unsubscribe. */
  onTap(listener: (tap: WorldTap) => void): () => void;
  /** A tap coin at ground-space px (render/bridge.ts on the core's `Tapped`). */
  spawnCoin(x: number, y: number): void;
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
    const layout = WORLD;
    const sceneFrame = (name: string): Texture => frame(atlases, SCENE_ATLAS, name);
    const findFrame = (name: string): Texture | null => atlases.get(SCENE_ATLAS)?.textures[name] ?? null;
    const post = createPostGrade({
      layout,
      frame: findFrame,
      quality: settings.quality ?? AUTO_QUALITY.start,
      lessMotion: settings.lessMotion,
      swatch: __CK_DEBUG__ ? frame(atlases, 'debug', 'swatch/idle/00') : undefined,
    });
    disposers.push(() => {
      post.destroy();
    });
    const layers = createWorldLayers({
      layout,
      frame: sceneFrame,
      weather: settings.weather,
      quality: settings.quality ?? AUTO_QUALITY.start,
      lessMotion: settings.lessMotion,
      findFrame,
    });
    const water = createWater(worldRT, layout.river, settings.weather);
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
    // Tap coins over the world, after the grade (UI feedback: as bright at night as at noon, art-director M1-19).
    const coins = createCoinFx(
      Array.from({ length: 4 }, (_, i) => sceneFrame(`coin/idle/${String(i).padStart(2, '0')}`)),
      settings.lessMotion,
    );
    worldTop.addChild(coins.container);
    disposers.push(() => {
      coins.destroy();
    });
    worldTop.addChild(post.container);

    const upscale = new Sprite({ texture: worldRT, label: 'upscale', roundPixels: true });
    app.stage.addChild(upscale);

    const anchorX = (zone: ZoneId): number => WORLD.zones.find((z) => z.id === zone)?.anchorX ?? 0;
    // Camera (M2-02): drag, inertia, glides — pure motion state (camera/motion.ts), stepped once per frame.
    let motion = createMotion(settings.camX ?? anchorX(settings.zone));
    let lessMotion = settings.lessMotion;
    const zoneListeners = new Set<(zone: ZoneId) => void>();
    let zone: ZoneId | null = null;
    let settled = true;
    let scene: SceneState = DEFAULT_SCENE;
    // The camera of the last frame: a tap is read in the frame the player saw.
    let lastCam = split(motion.x, 1);
    // Quality (ART-18): a fixed `?quality`, else auto — start at AUTO_QUALITY.start and let the fps probe pick once.
    // No probe under `?freeze`: screenshots must not change tier mid-test.
    let quality: Quality = settings.quality ?? AUTO_QUALITY.start;
    const probe = settings.quality === null && settings.frozenAt === null ? createFpsProbe() : null;
    const applyQuality = (q: Quality): void => {
      quality = q;
      for (const layer of layers) layer.setQuality(q);
      post.setQuality(q);
    };
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
      const size = { viewW: target.width, viewH: target.height, worldW: WORLD.width };
      for (const layer of layers) layer.resize(size);
      post.resize(size);
      water.resize(target.width, target.height, horizonY(target.height));
      // Whole worldRT: the filter pass covers every row even where the graded layers draw nothing yet.
      graded.filterArea = new Rectangle(0, 0, target.width, target.height);
    };
    applyViewport();
    // Bounds use the visible width ceil(deviceW/scale) = target.width − 1, not logicalW (floor): with
    // floor, the camera could stop up to one partial column past the world's right edge. The spare
    // RT column is only on screen while frac > 0, i.e. strictly inside the bounds.
    const cameraView = (): CameraView => ({
      bounds: cameraBounds(WORLD.width, target.width - 1),
      viewW: target.width - 1,
      lessMotion,
    });
    zone = zoneAt(WORLD.zones, motion.x + cameraView().viewW / 2, null, CAMERA.zoneHysteresisPx);

    // Runs at NORMAL priority, i.e. before Application's own stage render (LOW).
    const renderWorld = (): void => {
      const view = cameraView();
      motion = step(motion, performance.now(), view);
      const cam = split(motion.x, vp.scale, view.bounds);
      lastCam = cam;
      // The tab follows the camera once it has settled (not during a drag, coast or glide).
      const nowSettled = isSettled(motion);
      if (nowSettled && !settled) {
        const next = zoneAt(WORLD.zones, motion.x + view.viewW / 2, zone, CAMERA.zoneHysteresisPx);
        if (next && next !== zone) {
          zone = next;
          for (const l of [...zoneListeners]) l(next);
        }
      }
      settled = nowSettled;
      const minutes = clock.minutesOfDay();
      const seconds = clock.seconds();
      const ambient = lessMotion ? 0 : seconds;
      const frameInfo = {
        minutes,
        seconds,
        ambient,
        cycle: dayCycle(minutes),
        camX: cam.worldPx,
        cameraMoving: !nowSettled,
        nowMs: performance.now(),
        scene,
      };
      if (probe && !probe.verdict()) {
        probe.sample(performance.now());
        const picked = probe.verdict();
        if (picked && picked !== quality) applyQuality(picked);
      }
      grading.update(gradeCycle(frameInfo.cycle, settings.weather), minutes);
      post.setEmissive(emissiveLevel(frameInfo.cycle));
      post.update(frameInfo.ambient, scene);
      for (const layer of layers) {
        layer.update(frameInfo);
        layer.container.x = layerOffset(cam.worldPx, layer.parallax);
      }
      post.container.x = layerOffset(cam.worldPx, post.parallax);
      coins.container.x = layerOffset(cam.worldPx, 1);
      coins.update(performance.now() / 1000);
      upscale.x = -cam.fracDevicePx;
      app.renderer.render({ container: world, target: worldRT, clear: true });
      water.render(app.renderer, frameInfo.ambient, frameInfo.cycle, cam.worldPx);
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

    // Pointer (M1-19, M2-02): one finger drags the camera (with inertia); a press that stays within the slop is a tap at
    // the ground-space logical px of the frame on screen; a double tap also centres the tapped point (motion.ts).
    // `touch-action: none` keeps the browser from taking the horizontal pan (pinch is M2-03); no long-press callout,
    // selection or context menu on the world. Times are `performance.now()`, not `e.timeStamp`: the frame clock uses
    // it too (and Playwright's fake clock moves it, but not event timestamps).
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.setProperty('-webkit-touch-callout', 'none');
    const tapListeners = new Set<(tap: WorldTap) => void>();
    /** Screen logical px of a pointer (the frame's sub-px shift not included: drags work in screen space). */
    const pointer = (e: PointerEvent): PointerSample => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      return {
        id: e.pointerId,
        x: ((e.clientX - rect.left) * dpr) / vp.scale,
        y: ((e.clientY - rect.top) * dpr) / vp.scale,
        t: performance.now(),
        primary: e.isPrimary,
      };
    };
    const holds = (id: number): boolean =>
      (motion.mode.kind === 'press' || motion.mode.kind === 'drag') && motion.mode.id === id;
    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0) return; // mouse: left button only
      motion = press(motion, pointer(e), cameraView());
      if (!holds(e.pointerId)) return; // an ignored second finger
      // Keep the moves and the release coming when the finger leaves the canvas (e.g. over the HUD).
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone (released before this handler ran): nothing to capture.
      }
    };
    const onMove = (e: PointerEvent): void => {
      motion = move(motion, pointer(e), cameraView());
    };
    const onUp = (e: PointerEvent): void => {
      const p = pointer(e);
      const r = release(motion, p, cameraView());
      motion = r.motion;
      if (!r.tap) return;
      // Ground-space px of the frame on screen: the same sample plus that frame's camera.
      const tap: WorldTap = {
        clientX: e.clientX,
        clientY: e.clientY,
        x: Math.floor(p.x + lastCam.fracDevicePx / vp.scale + lastCam.worldPx),
        y: Math.floor(p.y),
      };
      for (const l of [...tapListeners]) l(tap);
    };
    // The OS took the pointer (scroll, system gesture) or the capture was lost: no tap, no inertia.
    const onLost = (e: PointerEvent): void => {
      if (holds(e.pointerId)) motion = cancel(motion, performance.now(), cameraView());
    };
    // Focus or the page went away mid-gesture: the up will never come.
    const onAway = (): void => {
      if (document.visibilityState === 'hidden' || !document.hasFocus())
        motion = cancel(motion, performance.now(), cameraView());
    };
    const onContextMenu = (e: Event): void => {
      e.preventDefault();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onLost);
    canvas.addEventListener('lostpointercapture', onLost);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onAway);
    document.addEventListener('visibilitychange', onAway);
    disposers.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onLost);
      canvas.removeEventListener('lostpointercapture', onLost);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onAway);
      document.removeEventListener('visibilitychange', onAway);
      tapListeners.clear();
      zoneListeners.clear();
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
      quality: () => quality,
      setCamX: (x) => {
        motion = jumpTo(motion, x, cameraView());
      },
      focusZone: (zone) => {
        motion = glideTo(motion, anchorX(zone), performance.now(), cameraView());
      },
      camX: () => lastCam.worldPx + lastCam.fracDevicePx / vp.scale,
      onZoneChange: (listener) => {
        zoneListeners.add(listener);
        if (zone) listener(zone);
        return () => {
          zoneListeners.delete(listener);
        };
      },
      setLessMotion: (on) => {
        lessMotion = on;
      },
      setScene: (next) => {
        scene = next;
      },
      onTap: (listener) => {
        tapListeners.add(listener);
        return () => {
          tapListeners.delete(listener);
        };
      },
      spawnCoin: (x, y) => {
        coins.spawn(x, y, performance.now() / 1000);
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
