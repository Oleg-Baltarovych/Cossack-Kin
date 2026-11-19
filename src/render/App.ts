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
import { frame, frameLookup, loadAtlases, unloadAtlases, WORLD_ATLASES, type Atlases } from './atlases.ts';
import { layerOffset, levelView, skyShift, split } from './camera.ts';
import { skyPixel } from './atmosphere/skyPaint.ts';
import {
  cancel,
  createMotion,
  lose,
  glideTo,
  isSettled,
  jumpTo,
  move,
  press,
  release,
  step,
  zoomTo,
  type CameraView,
  type PointerSample,
} from './camera/motion.ts';
import { zoneAt } from './zones.ts';
import { createClock, createCosmeticRng, realLocalMinutes, type RenderClock } from './clock.ts';
import { createWorldLayers, type WorldLayer } from './layers/index.ts';
import { horizonY } from './layers/Layer.ts';
import { createWater } from './water.ts';
import { createBoats } from './boats.ts';
import { createPostGrade } from './postGrade.ts';
import { rampColor, rampCss } from './palette.ts';
import { DEFAULT_SCENE, type SceneState } from './scene.ts';
import type { Quality, RenderSettings } from './settings.ts';
import { createFpsProbe } from './quality.ts';
import { AUTO_QUALITY, CAMERA } from './atmosphere/config.ts';
import { createCoinFx } from './fx/coins.ts';
import { computeViewport, worldTargetSize, type Viewport, type ZoomLevel } from './viewport.ts';

/** The continuous world of land 1 (plan M2-01): farm → suburb → Sich; `?zone=` only places the camera. */
const WORLD = KHORTYTSIA_WORLD;
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
  /** The viewport on screen: the normal one, or the closer zoom level's (scale + 1, M2-03). */
  viewport(): Viewport;
  /** The quality tier in use (the auto-detect may change it once, ART-18). */
  quality(): Quality;
  /** Puts the camera at `camX` logical px at once (clamped to the world). */
  setCamX(camX: number): void;
  /** Glides the camera to the zone's anchor (UI tabs, M2-02); «менше руху» jumps. Cosmetic: no game state. */
  focusZone(zone: ZoneId): void;
  /** The camera x on screen in the last frame (logical px, a multiple of 1/scale). */
  camX(): number;
  /** Rows of the normal frame above the screen in the last frame (whole logical px; 0 at the normal level). */
  camY(): number;
  /** The zoom level on screen in the last frame (0 normal, 1 closer; pinch / ctrl+wheel, M2-03). */
  zoom(): ZoomLevel;
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

  // Atlases and LUTs first, so the first frame already has everything. A failed load releases what did load (a partial
  // atlas set inside loadAtlases; the whole set when the LUTs fail).
  const [atlasesLoad, lutsLoad] = await Promise.allSettled([loadAtlases(), loadLuts()]);
  if (atlasesLoad.status === 'rejected') throw atlasesLoad.reason;
  const atlases = atlasesLoad.value;
  if (lutsLoad.status === 'rejected') {
    unloadAtlases(atlases);
    throw lutsLoad.reason;
  }
  const luts = lutsLoad.value;
  let vp = measure(host);
  let closerVp = measure(host, 1);
  const app = new Application();
  try {
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
  } catch (error) {
    // The canvas is not in the page yet; a renderer created before the failure still holds a GL context — release it
    // (a retry creates a new one). Pixi types `renderer` as always set, but it is unset when renderer creation threw.
    if ((app as { renderer?: unknown }).renderer) app.destroy({ removeView: true }, { children: true });
    unloadAtlases(atlases);
    throw error;
  }

  // Teardown runs in reverse creation order: observer → ticker → layers → world → worldRT → app (+ canvas) → atlases.
  // It is used both by destroy() and when anything below throws during setup.
  const disposers: (() => void)[] = [];
  const disposeAll = (): void => {
    for (let undo = disposers.pop(); undo; undo = disposers.pop()) undo();
  };
  // The atlases go last, after the app and every sprite that drew from them.
  disposers.push(() => {
    unloadAtlases(atlases);
  });
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
    const worldFrames = frameLookup(atlases, WORLD_ATLASES);
    const findFrame = (name: string): Texture | null => worldFrames.get(name) ?? null;
    const sceneFrame = (name: string): Texture => {
      const texture = worldFrames.get(name);
      if (!texture) throw new Error(`no world atlas has frame "${name}" — run \`pnpm sprites\``);
      return texture;
    };
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
    // Boats over the water, graded like the world, under the haze band and the rain (M2-11).
    const boats = createBoats(layout.boats, sceneFrame, grading.filter, settings.weather);
    worldTop.addChildAt(boats.container, 0);
    worldTop.addChildAt(boats.film, 1);
    disposers.push(() => {
      boats.destroy();
    });

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
    let lastCam = { ...split(motion.x, vp.scale), scale: vp.scale, y: 0, level: motion.level };
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
      closerVp = measure(host, 1);
      target = worldTargetSize(vp);
      app.renderer.resize(vp.deviceW, vp.deviceH, 1);
      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      canvas.style.width = `${String(vp.deviceW / dpr)}px`;
      canvas.style.height = `${String(vp.deviceH / dpr)}px`;
      worldRT.resize(target.width, target.height, 1);
      const size = { viewW: target.width, viewH: target.height, worldW: WORLD.width };
      for (const layer of layers) layer.resize(size);
      post.resize(size);
      water.resize(target.width, target.height, horizonY(target.height));
      boats.resize(horizonY(target.height));
      // Whole worldRT: the filter pass covers every row even where the graded layers draw nothing yet.
      graded.filterArea = new Rectangle(0, 0, target.width, target.height);
    };
    applyViewport();
    // Bounds use the visible width ceil(deviceW/scale) (= target.width − 1 at the normal level), not logicalW (floor):
    // with floor, the camera could stop up to one partial column past the world's right edge. The spare RT column is
    // only on screen while frac > 0, i.e. strictly inside the bounds. Zoom (M2-03): worldRT and every layer stay laid
    // out for the normal level; the closer level only shows a window of worldRT at scale + 1 (upscale sprite), so
    // culling, water, light shafts and the draw-call count are those of the normal level.
    const cameraView = (): CameraView => ({
      levels: [levelView(vp, 0, WORLD.width), levelView(vp, 1, WORLD.width)],
      lessMotion,
    });
    if (settings.zoom === 1) {
      // About the screen centre of the `cam`/`zone` framing.
      motion = zoomTo(motion, 1, { x: vp.deviceW / 2 / vp.scale, y: vp.deviceH / 2 / vp.scale }, cameraView());
      // Before the first frame (stats, a tap): the camera as it will be drawn.
      const s = vp.scale + motion.level;
      lastCam = { ...split(motion.x, s), scale: s, y: Math.round(motion.y), level: motion.level };
    }
    zone = zoneAt(WORLD.zones, motion.x + cameraView().levels[motion.level].viewW / 2, null, CAMERA.zoneHysteresisPx);

    // Runs at NORMAL priority, i.e. before Application's own stage render (LOW).
    const renderWorld = (): void => {
      const view = cameraView();
      motion = step(motion, performance.now(), view);
      const lv = view.levels[motion.level];
      const cam = split(motion.x, lv.scale, lv.bounds);
      // Vertical camera in whole logical px: rows stay on the scale×scale grid (row phase 0).
      const camY = Math.round(motion.y);
      lastCam = { ...cam, scale: lv.scale, y: camY, level: motion.level };
      // The tab follows the camera once it has settled (not during a drag, coast, glide or pinch).
      const nowSettled = isSettled(motion);
      if (nowSettled && !settled) {
        const next = zoneAt(WORLD.zones, motion.x + lv.viewW / 2, zone, CAMERA.zoneHysteresisPx);
        if (next && next !== zone) {
          zone = next;
          for (const l of [...zoneListeners]) l(next);
        }
      }
      settled = nowSettled;
      const minutes = clock.minutesOfDay();
      const seconds = clock.seconds();
      const ambient = lessMotion ? 0 : seconds;
      const cycle = dayCycle(minutes);
      // Closer level: the sky band moves down just enough to keep the shown disc in the window (art-director, M2-03).
      const skyH = horizonY(target.height);
      const disc = cycle.sun.y > 0 ? cycle.sun : cycle.moon.y > 0 ? cycle.moon : null;
      const skyY = skyShift({
        camY,
        discRow: disc ? skyPixel(disc, target.width, skyH).y : null,
        horizon: skyH,
        margin: CAMERA.skyDiscMarginPx,
      });
      const frameInfo = {
        minutes,
        seconds,
        ambient,
        cycle,
        camX: cam.worldPx,
        cameraMoving: !nowSettled,
        nowMs: performance.now(),
        scene,
        skyY,
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
        if (layer.id === 'sky') layer.container.y = skyY;
      }
      post.container.x = layerOffset(cam.worldPx, post.parallax);
      coins.container.x = layerOffset(cam.worldPx, 1);
      boats.update(frameInfo.ambient, frameInfo.cycle, cam.worldPx, target.width);
      boats.container.x = layerOffset(cam.worldPx, 1);
      boats.film.x = boats.container.x;
      coins.update(performance.now() / 1000);
      upscale.scale.set(lv.scale);
      upscale.x = -cam.fracDevicePx;
      upscale.y = -camY * lv.scale;
      app.renderer.render({ container: world, target: worldRT, clear: true });
      water.render(app.renderer, frameInfo.ambient, frameInfo.cycle, cam.worldPx, skyY);
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
    // A second finger pinches between the two zoom levels (M2-03); lifting one hands back to a one-finger drag.
    // `touch-action: none` keeps the browser from taking the pan and the pinch; no long-press callout,
    // selection or context menu on the world. Times are `performance.now()`, not `e.timeStamp`: the frame clock uses
    // it too (and Playwright's fake clock moves it, but not event timestamps).
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.setProperty('-webkit-touch-callout', 'none');
    const tapListeners = new Set<(tap: WorldTap) => void>();
    /**
     * Screen logical px of a client point at the zoom level on screen (the frame's sub-px shift not included: drags
     * work in screen space).
     */
    const screenAt = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const scale = vp.scale + motion.level;
      return { x: ((clientX - rect.left) * dpr) / scale, y: ((clientY - rect.top) * dpr) / scale };
    };
    const pointer = (e: PointerEvent): PointerSample => ({
      id: e.pointerId,
      ...screenAt(e.clientX, e.clientY),
      t: performance.now(),
      primary: e.isPrimary,
    });
    const holds = (id: number): boolean => {
      const { mode } = motion;
      if (mode.kind === 'pinch') return mode.a.id === id || mode.b.id === id;
      return (mode.kind === 'press' || mode.kind === 'drag') && mode.id === id;
    };
    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0) return; // mouse: left button only
      motion = press(motion, pointer(e), cameraView());
      if (!holds(e.pointerId)) return; // an ignored third finger
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
        x: Math.floor(p.x + lastCam.fracDevicePx / lastCam.scale + lastCam.worldPx),
        y: Math.floor(p.y + lastCam.y),
      };
      for (const l of [...tapListeners]) l(tap);
    };
    // The OS took the pointer (scroll, system gesture) or the capture was lost: no tap, no inertia.
    // One finger of a pinch: the other one drags on.
    const onLost = (e: PointerEvent): void => {
      motion = lose(motion, e.pointerId, performance.now(), cameraView());
    };
    // Focus or the page went away mid-gesture: the up will never come.
    const onAway = (): void => {
      if (document.visibilityState === 'hidden' || !document.hasFocus())
        motion = cancel(motion, performance.now(), cameraView());
    };
    const onContextMenu = (e: Event): void => {
      e.preventDefault();
    };
    // Desktop equivalent of the pinch: ctrl+wheel (also what a trackpad pinch sends) about the cursor; |deltaY| adds up
    // to `CAMERA.wheelZoomPx` per switch, so trackpad jitter cannot flip levels. The page itself never zooms over the
    // world. A plain sideways wheel (deltaX, or shift+wheel) pans the camera.
    let wheelZoom = 0;
    const onWheel = (e: WheelEvent): void => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1; // lines / pages → css px
      if (e.ctrlKey) {
        e.preventDefault();
        const dy = e.deltaY * unit;
        if (dy === 0) return;
        wheelZoom = Math.sign(dy) === Math.sign(wheelZoom) ? wheelZoom + dy : dy;
        if (Math.abs(wheelZoom) < CAMERA.wheelZoomPx) return;
        const level: ZoomLevel = wheelZoom < 0 ? 1 : 0;
        wheelZoom = 0;
        const next = zoomTo(motion, level, screenAt(e.clientX, e.clientY), cameraView());
        if (next !== motion) settled = false; // the tab may follow the new view centre
        motion = next;
        return;
      }
      const dx = (e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0) * unit;
      const k = motion.mode.kind;
      if (dx === 0 || k === 'press' || k === 'drag' || k === 'pinch') return;
      e.preventDefault();
      const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      motion = jumpTo(motion, motion.x + (dx * dpr) / (vp.scale + motion.level), cameraView());
      settled = false;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onLost);
    canvas.addEventListener('lostpointercapture', onLost);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('blur', onAway);
    document.addEventListener('visibilitychange', onAway);
    disposers.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onLost);
      canvas.removeEventListener('lostpointercapture', onLost);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
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
      viewport: () => (lastCam.level === 0 ? vp : closerVp),
      quality: () => quality,
      setCamX: (x) => {
        motion = jumpTo(motion, x, cameraView());
      },
      focusZone: (zone) => {
        // The anchor frames the zone at the normal level; the closer view keeps the same centre.
        const view = cameraView();
        const centring = (view.levels[0].viewW - view.levels[motion.level].viewW) / 2;
        motion = glideTo(motion, anchorX(zone) + centring, performance.now(), view);
      },
      camX: () => lastCam.worldPx + lastCam.fracDevicePx / lastCam.scale,
      camY: () => lastCam.y,
      zoom: () => lastCam.level,
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

function measure(host: HTMLElement, zoom: ZoomLevel = 0): Viewport {
  return computeViewport(host.clientWidth, host.clientHeight, window.devicePixelRatio, zoom);
}
