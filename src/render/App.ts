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
import { framedY, layerOffset, levelView, revealY, skyShift, split } from './camera.ts';
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
  setY,
  skipCentre,
  step,
  zoomTo,
  type CameraView,
  type PointerSample,
} from './camera/motion.ts';
import { zoneAt } from './zones.ts';
import { createClock, createCosmeticRng, realLocalMinutes, type RenderClock } from './clock.ts';
import { createWorldLayers, type WorldLayer } from './layers/index.ts';
import { createAgents } from './agents/sim.ts';
import { createAgentDriver, stepCap } from './agents/driver.ts';
import { LINEUP, lineupPoses } from './debug/lineup.ts';
import type { AgentCounts } from './agents/sim.ts';
import { AGENT_BUDGET } from '../content/agents.ts';
import { propFrames } from './layers/Ground.ts';
import { horizonY } from './layers/Layer.ts';
import { createWater } from './water.ts';
import { createBoats } from './boats.ts';
import { createPostGrade } from './postGrade.ts';
import { rampColor, rampCss } from './palette.ts';
import { DEFAULT_SCENE, type SceneState } from './scene.ts';
import type { Quality, RenderSettings } from './settings.ts';
import { createFpsProbe } from './quality.ts';
import { AUTO_QUALITY, CAMERA, FRAMING, PLOT_TAP, WORK_GLINT } from './atmosphere/config.ts';
import { plotAt, plotSpan } from './plotHit.ts';
import { propTargets } from './plotTargets.ts';
import { createCoinFx } from './fx/coins.ts';
import { createBuildFx } from './fx/build.ts';
import type { PlotBuilding } from '../content/villages/khortytsia.layout.ts';
import { computeViewport, worldTargetSize, type Viewport, type ZoomLevel } from './viewport.ts';

/** The continuous world of land 1 (plan M2-01): farm → suburb → Sich; `?zone=` only places the camera. */
const WORLD = KHORTYTSIA_WORLD;
/** SPEC §9.2: 30 fps idle / 60 interactive — fixed at 60 until the interaction-driven switch (M2). */
export const TARGET_FPS = 60;

/**
 * A tap on the world: client (CSS) px for DOM feedback, ground-space logical px for the scene, and the building drawn
 * there (M2-13, SPEC §3.3: a tap on a building opens its row instead of earning; `null` = open ground).
 */
export interface WorldTap {
  readonly clientX: number;
  readonly clientY: number;
  readonly x: number;
  readonly y: number;
  readonly building: PlotBuilding | null;
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
  /** Agents alive on the world by role (M2-16; debug stats). */
  agentCounts(): AgentCounts;
  /** Villagers in a work animation this frame (M2-18; debug stats). */
  working(): number;
  /** Scaffold stages gone up since start, the builders' knocks (M2-18; debug stats, the M7 audio hook). */
  knocks(): number;
  /** The newest work glint: world x and age in ms (M2-18; debug stats, e2e finds one on screen). */
  lastGlint(): { readonly x: number; readonly ageMs: number } | null;
  /** The seed of the cosmetic RNG and the agents (`?seed`, else random per session). */
  readonly seed: number;
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
  /** The building drawn at a client (CSS px) point in the last frame, or `null` (the same test a tap makes). */
  plotAtClient(clientX: number, clientY: number): PlotBuilding | null;
  /**
   * The bottom sheet opened on `building`'s row (M2-13) with its top edge at client y `sheetTop`: at the closer zoom
   * level the camera moves up just enough that the building stays above the sheet; at the normal level nothing moves.
   */
  reveal(building: PlotBuilding, sheetTop: number): void;
  /** Calls `listener` for every tap on the world (not a drag; both taps of a double tap); returns the unsubscribe. */
  onTap(listener: (tap: WorldTap) => void): () => void;
  /** A tap coin at ground-space px (render/bridge.ts on the core's `Tapped`). */
  spawnCoin(x: number, y: number): void;
  /** A new building (level 0 → 1, M2-12): scaffold stages, then the pop and confetti. Cosmetic only. */
  construct(building: PlotBuilding): void;
  /** A new tier (M2-12): the flash and the rising standard (after the reveal if it is still being built). */
  celebrate(building: PlotBuilding): void;
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
    const layout = WORLD;
    // One seed for the cosmetic RNG and the agents (`?seed` in dev/test, else random): frozen frames repeat.
    const seed = settings.seed ?? Math.floor(Math.random() * 2 ** 32);
    // People on the path graph (M2-16, M2-18): a pure pool stepped in whole ticks on the animation clock, never game
    // state; made on the first frame, so villagers start where that hour and the buildings standing put them. Made
    // once per world: a resize (`applyViewport`) only re-lays the layers and never touches the driver, so nobody
    // jumps; there is one land today — switching lands (M5) must tear the world down and build a new one.
    const agents = createAgentDriver(
      (ctx) => createAgents(layout.paths, layout.agents, AGENT_BUDGET, seed, ctx),
      stepCap(settings.frozenAt !== null),
    );
    const worldFrames = frameLookup(atlases, WORLD_ATLASES);
    const findFrame = (name: string): Texture | null => worldFrames.get(name) ?? null;
    const sceneFrame = (name: string): Texture => {
      const texture = worldFrames.get(name);
      if (!texture) throw new Error(`no world atlas has frame "${name}" — run \`pnpm sprites\``);
      return texture;
    };
    // The debug swatch (and its atlas) exist only in dev/test builds; production drops both (M0-08 review).
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
    // The work-done glint over a villager (M2-18): its own look, never the coin (it is no income).
    const glints = createCoinFx(
      Array.from({ length: 4 }, (_, i) => sceneFrame(`glint/idle/${String(i).padStart(2, '0')}`)),
      settings.lessMotion,
      WORK_GLINT,
    );
    worldTop.addChild(glints.container);
    /** The newest work glint (world x, birth ms): debug stats only. */
    let lastGlint: { x: number; bornMs: number } | null = null;
    disposers.push(() => {
      coins.destroy();
      glints.destroy();
    });
    // Construction and tier juice (M2-12): scaffolds, dust and the standard graded right over the ground layer;
    // confetti and the flash after the grade, like the coins.
    // The builders' knocks (M2-18): counted for the debug stats until the audio (M7) plays them.
    let knocks = 0;
    const build = createBuildFx(
      layout,
      sceneFrame,
      settings.lessMotion,
      () => horizonY(target.height),
      () => {
        knocks += 1;
      },
    );
    const groundLayer = layers.find((l) => l.id === 'ground');
    graded.addChildAt(
      build.world,
      groundLayer ? graded.getChildIndex(groundLayer.container) + 1 : graded.children.length,
    );
    worldTop.addChild(build.top);
    disposers.push(() => {
      build.destroy();
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
    /** `?lineup` stands from the start camera's left edge (dev/test). */
    const lineupX = Math.round(motion.x);
    let lessMotion = settings.lessMotion;
    const zoneListeners = new Set<(zone: ZoneId) => void>();
    let zone: ZoneId | null = null;
    let settled = true;
    let scene: SceneState = DEFAULT_SCENE;
    // The scene drawn in the last frame (a building under scaffolding is still empty there): what a tap hits.
    let drawn: SceneState = DEFAULT_SCENE;
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
    const rng = createCosmeticRng(seed);

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
      // x about the screen centre of the `cam`/`zone` framing; y = the closer level's own framing (M2-29 review).
      const view = cameraView();
      motion = zoomTo(motion, 1, { x: vp.deviceW / 2 / vp.scale, y: vp.deviceH / 2 / vp.scale }, view);
      const rows = vp.deviceH / view.levels[1].scale;
      const y = framedY({ horizon: horizonY(target.height), rows, maxY: view.levels[1].maxY }, FRAMING.closer);
      motion = setY(motion, y, view);
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
      // People walk on `seconds`, not `ambient`: «менше руху» stills shake, parallax and big tweens (SPEC §6.8), not
      // walking.
      agents.advance(seconds, { minutes, tiers: scene.tiers });
      // A finished work spell sparks a glint over the worker (M2-18, decoration only — never the coin; at most
      // `perFrame` at once after a catch-up). Not under `?freeze`: its one jump finishes many spells, and a glint in
      // mid-air would make the shot depend on real time.
      if (settings.frozenAt === null) {
        const done = agents.done();
        const y0 = horizonY(target.height) - WORK_GLINT.lift;
        for (let i = 0; i < Math.min(done.count, WORK_GLINT.perFrame); i++) {
          const d = done.slots[i];
          if (!d) continue;
          glints.spawn(d.x, y0 + d.ground, performance.now() / 1000);
          lastGlint = { x: d.x, bornMs: performance.now() };
        }
      }
      const cycle = dayCycle(minutes);
      // The scene as it looks this frame: a building under scaffolding still empty, a popping one scaled (M2-12).
      const shown = build.present(scene, performance.now(), emissiveLevel(cycle));
      drawn = shown;
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
        // Dev/test `?lineup`: the villager animation set in two rows at the start camera (M2-17 review shots).
        agents:
          __CK_DEBUG__ && settings.lineup
            ? lineupPoses(lineupX, LINEUP.ground, seconds, agents.counts().total)
            : agents.poses(),
        ambient,
        cycle,
        camX: cam.worldPx,
        cameraMoving: !nowSettled,
        nowMs: performance.now(),
        scene: shown,
        skyY,
      };
      if (probe && !probe.verdict()) {
        probe.sample(performance.now());
        const picked = probe.verdict();
        if (picked && picked !== quality) applyQuality(picked);
      }
      grading.update(gradeCycle(frameInfo.cycle, settings.weather), minutes);
      post.setEmissive(emissiveLevel(frameInfo.cycle));
      post.update(frameInfo.ambient, shown);
      for (const layer of layers) {
        layer.update(frameInfo);
        layer.container.x = layerOffset(cam.worldPx, layer.parallax);
        if (layer.id === 'sky') layer.container.y = skyY;
      }
      post.container.x = layerOffset(cam.worldPx, post.parallax);
      coins.container.x = layerOffset(cam.worldPx, 1);
      glints.container.x = coins.container.x;
      build.top.x = coins.container.x;
      build.world.x = coins.container.x;
      boats.update(frameInfo.ambient, frameInfo.cycle, cam.worldPx, target.width);
      boats.container.x = layerOffset(cam.worldPx, 1);
      boats.film.x = boats.container.x;
      coins.update(performance.now() / 1000);
      glints.update(performance.now() / 1000);
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
    // Hit-test targets of the drawn props (M2-13), laid out for the current horizon row (rebuilt after a resize).
    let targets: { horizon: number; list: ReturnType<typeof propTargets> } | null = null;
    const targetsNow = (): ReturnType<typeof propTargets> => {
      const horizon = horizonY(target.height);
      if (targets?.horizon !== horizon)
        targets = {
          horizon,
          list: propTargets(layout, horizon, (p) =>
            sceneFrame(p.animate ? `${p.sprite}/idle/00` : propFrames(p.sprite).base),
          ),
        };
      return targets.list;
    };
    /** Ground-space px of a screen logical point in the frame on screen. */
    const groundAt = (p: { x: number; y: number }): { x: number; y: number } => ({
      x: Math.floor(p.x + lastCam.fracDevicePx / lastCam.scale + lastCam.worldPx),
      y: Math.floor(p.y + lastCam.y),
    });
    const hit = (g: { x: number; y: number }) => plotAt(targetsNow(), g, drawn, PLOT_TAP.slopPx);
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
      const g = groundAt(p);
      const building = hit(g);
      // A (double) tap on a building opens its row: the camera stays (M2-02 hook).
      if (building) motion = skipCentre(motion);
      const tap: WorldTap = { clientX: e.clientX, clientY: e.clientY, ...g, building };
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
      agentCounts: () => agents.counts(),
      working: () => agents.working(),
      knocks: () => knocks,
      lastGlint: () => (lastGlint ? { x: lastGlint.x, ageMs: performance.now() - lastGlint.bornMs } : null),
      seed,
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
      plotAtClient: (clientX, clientY) => hit(groundAt(screenAt(clientX, clientY))),
      reveal: (building, sheetTop) => {
        const view = cameraView();
        const lv = view.levels[motion.level];
        // Nothing of it drawn (a stale tap) or no vertical room (the normal level): nothing to move.
        const span = plotSpan(targetsNow(), building, drawn);
        if (!span || lv.maxY === 0) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
        const y = revealY({
          camY: motion.y,
          maxY: lv.maxY,
          scale: lv.scale,
          sheetTop: (sheetTop - rect.top) * dpr,
          ...span,
          margin: PLOT_TAP.revealMarginPx,
        });
        motion = setY(motion, y, view);
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
      construct: (building) => {
        build.construct(building, performance.now());
      },
      celebrate: (building) => {
        build.celebrate(building, performance.now());
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
