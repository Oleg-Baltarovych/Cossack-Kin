// Shared e2e helpers for the world canvas: deterministic navigation and debug stats (`window.__CK__`).
import { expect, type Page } from '@playwright/test';
import type {} from '../../../src/render/debug/index.ts';

export interface WorldStats {
  readonly drawCalls: number;
  readonly scale: number;
  readonly logicalW: number;
  readonly logicalH: number;
  readonly frames: number;
  /** Live particles from the registry (SPEC §12.4 budget ≤ 300). */
  readonly particles: number;
  /** Camera x (logical px, a multiple of 1/scale), camera y (whole logical px) and zoom level (M2-02/03). */
  readonly cam: number;
  readonly camY: number;
  readonly zoom: number;
  /** Villagers in a work animation (M2-18) and the builders' knocks so far (scaffold stages gone up). */
  readonly working: number;
  readonly knocks: number;
  readonly glint: { readonly x: number; readonly ageMs: number } | null;
  /** Where each raid slot's squad is (M3-14): home, muster, out, away, in, halt. */
  readonly squads: readonly string[];
  /** Agents alive on the world by role (M2-16). */
  readonly agents: {
    readonly total: number;
    readonly villager: number;
    readonly cossack: number;
    readonly visitor: number;
    readonly cart: number;
  };
}

/**
 * Opens `url` and waits until the first world frame reached the canvas (`body[data-ready="1"]`). A failed
 * world init (e.g. a missing atlas) sets `data-ready="error"` and fails here at once, not on a timeout.
 * World screenshots judge the scene, so the DOM UI is hidden (`ui=0`) unless the URL asks for it (`ui=1`), and every
 * plot is built (`state=showcase`, the M-ART scene) unless the URL picks a state.
 */
export async function gotoReady(page: Page, url: string): Promise<void> {
  const extra = [/[?&]ui=/.test(url) ? '' : 'ui=0', /[?&]state=/.test(url) ? '' : 'state=showcase'].filter(Boolean);
  const full = extra.length === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}${extra.join('&')}`;
  await page.goto(full);
  await waitReady(page);
}

/**
 * First frame can take longer than the 5 s expect default under parallel SwiftShader workers (atlas decode, LUTs);
 * startup time is not what these tests measure. An init error still fails at once via `data-ready="error"`.
 */
const READY_TIMEOUT_MS = 20_000;

export async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('body[data-ready]')).toBeAttached({ timeout: READY_TIMEOUT_MS });
  await expect(page.locator('body'), 'world init failed (see the browser console)').toHaveAttribute('data-ready', '1');
}

/**
 * Keeps the browser's own frames under a running fake clock (`page.clock.setFixedTime`/`install` without a pause): call
 * it after the clock call, before `goto`. Playwright's clock also fakes `requestAnimationFrame` as a 16 ms timer, which
 * has none of the browser's backpressure: the page queues ~60 frames/s of WebGL work while SwiftShader draws ~10, the
 * GPU process falls behind by seconds per second played, and after a reload the new page's first synchronous GL call
 * (Pixi's WebGL probe in `app.init`) waits out that backlog — over 20 s after a long run (M2-24). Frames come from the
 * native `requestAnimationFrame`, and each waits until the GPU finished the frame before it (a WebGL2 fence): the
 * native frames alone are not paced by the GPU once the canvas is fully covered — the full sheet (`data-state="full"`)
 * hides the world, the compositor stops drawing the canvas and rAF runs at ~50/s while SwiftShader draws ~12 (Windows
 * headless shell, fix/story-quests-local: a 13–20 s `app.init` after story-quests' reload). The callback gets the fake
 * `performance.now()`, the clock the Pixi ticker reads, so frame times stay on one timeline across a reload. A paused
 * clock has the same backlog on a long `runFor` (every 16-ms fake frame fires at once: `runFor(2400)` = 150 WebGL
 * frames, a 64-s screenshot on CI, M2-29): build.spec pairs it with `nativeFrames` and waits for one native frame after
 * each `runFor` — nothing is drawn while the clock stands, so an animation anchored at its first frame starts at the
 * first `runFor`. It leans on Playwright internals (`__pwClock.builtins`, pinned `@playwright/test` 1.65.1): recheck it
 * on every Playwright upgrade — `assertNativeFrames` fails if they moved.
 */
export async function nativeFrames(page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    // Playwright's injected clock keeps the page's native timers as `__pwClock.builtins` (clock.ts `inject`).
    const pw = (
      globalThis as { __pwClock?: { builtins: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> } }
    ).__pwClock;
    // No clock (or a wrong call order): leave the flag unset — `assertNativeFrames` reports it in the test.
    if (!pw?.builtins.requestAnimationFrame) return;
    const { requestAnimationFrame: raf, cancelAnimationFrame: caf } = pw.builtins;
    // The world's WebGL2 context: `getContext` with the type Pixi created returns that context (none before the canvas
    // is in the page, or for a WebGL1 one — those frames are not paced).
    let canvas: Element | null = null;
    let world: WebGL2RenderingContext | null = null;
    const worldGl = (): WebGL2RenderingContext | null => {
      const now = document.querySelector('#world canvas');
      if (now !== canvas) {
        canvas = now;
        world = now instanceof HTMLCanvasElement ? now.getContext('webgl2') : null;
      }
      return world;
    };
    // The fence after the last frame's GL work; the next frame waits while it is unsignaled. A lost context (the
    // reload's teardown) has no status to wait for.
    let fence: { readonly gl: WebGL2RenderingContext; readonly sync: WebGLSync } | null = null;
    const gpuBehind = (): boolean => {
      if (!fence) return false;
      const { gl, sync } = fence;
      if (!gl.isContextLost() && gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) return true;
      if (!gl.isContextLost()) gl.deleteSync(sync);
      fence = null;
      return false;
    };
    // One native frame runs every callback requested before it, as the browser does (Pixi runs several tickers);
    // deciding per callback would let the first ticker's fence starve the next.
    const queued = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    let pending: number | null = null;
    const frame = (): void => {
      pending = null;
      if (gpuBehind()) {
        pending = raf(frame);
        return;
      }
      const batch = [...queued];
      queued.clear();
      const now = performance.now();
      for (const [, cb] of batch) {
        // A throwing callback is reported and the rest still run, as with the browser's own frames.
        try {
          cb(now);
        } catch (error) {
          reportError(error);
        }
      }
      const gl = worldGl();
      const sync = gl && !gl.isContextLost() ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (!gl || !sync) return;
      fence = { gl, sync };
      // Sent now: the covered canvas is never presented, and an unsent fence never signals.
      gl.flush();
    };
    window.requestAnimationFrame = (cb) => {
      const id = nextId++;
      queued.set(id, cb);
      pending ??= raf(frame);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      queued.delete(id);
      if (queued.size > 0 || pending === null) return;
      caf(pending);
      pending = null;
    };
    (window as { __ckNativeRaf?: boolean }).__ckNativeRaf = true;
  });
}

/** Fails the test when `nativeFrames` did not take over this document's frames (call after each `goto`/`reload`). */
export async function assertNativeFrames(page: Page): Promise<void> {
  const ok = await page.evaluate(() => (window as { __ckNativeRaf?: boolean }).__ckNativeRaf === true);
  if (!ok)
    throw new Error(
      'nativeFrames did not install: Playwright clock internals changed (__pwClock.builtins), or it was called before page.clock.*',
    );
}

export async function readStats(page: Page): Promise<WorldStats> {
  const stats = await page.evaluate(() => {
    const s = window.__CK__?.stats;
    return s
      ? {
          drawCalls: s.drawCalls,
          scale: s.scale,
          logicalW: s.logicalW,
          logicalH: s.logicalH,
          frames: s.frames,
          particles: s.particles,
          cam: s.cam,
          camY: s.camY,
          zoom: s.zoom,
          agents: { ...s.agents },
          working: s.working,
          knocks: s.knocks,
          glint: s.glint,
          squads: [...s.squads],
        }
      : null;
  });
  if (!stats) throw new Error('window.__CK__.stats is missing — is this a --mode test build?');
  return stats;
}

/** WebGL flavour of the world canvas (`null` = no WebGL context) and the unmasked renderer string. */
export async function readWebGl(page: Page): Promise<{ kind: 'webgl2' | 'webgl' | null; renderer: string }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('#world canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return { kind: null, renderer: '' };
    // getContext with the type Pixi already created returns that context; another type returns null.
    const gl2 = canvas.getContext('webgl2');
    const gl = gl2 ?? canvas.getContext('webgl');
    if (!gl) return { kind: null, renderer: '' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return { kind: gl2 ? 'webgl2' : 'webgl', renderer };
  });
}
