// The e2e `test`/`expect` (every spec imports them from here; ESLint `imports[test-fixture]`). It owns the browser's
// frames so that WebGL work never outruns the GPU, and never leaves a GPU backlog behind for the next test.
//
// Why: a worker's tests share one browser and one GPU process (SwiftShader on CI, ~10 world frames/s). Work queued
// faster than it is drawn survives the test: the next page's first synchronous GL call (Pixi's WebGL probe in
// `app.init`, then `Create context`) waits it out — 13–88 s seen (M2-24, M3-17, CI run 45702083224). Three sources:
// - Playwright's clock fakes `requestAnimationFrame` as a 16-ms timer with no backpressure (~60 frames/s queued);
// - a covered canvas (the full sheet hides the world) is never presented, so native rAF is unpaced too (~50/s);
// - a long `clock.runFor` on a paused clock fires every 16-ms fake frame at once (`runFor(2400)` = 150 frames).
//
// What the fixture does, for every page of the test's context:
// 1. Frames are native and GPU-paced: a frame runs its callbacks only after a WebGL2 fence on the world canvas's
//    previous frame signalled. `requestAnimationFrame` is an accessor on `window`, installed before any page script;
//    Playwright's clock replaces timers by assignment (`globalObject[method] = …`, clock.ts `install`, pinned
//    `@playwright/test` 1.65.1), so with `frames: 'native'` (the default) its fake rAF is caught by the setter and the
//    page keeps the paced one, with or without a clock. Callbacks get `performance.now()` at call time — the fake one
//    under a clock, the time the Pixi ticker reads — so a paused clock draws the same moment until `runFor` moves it.
//    `frames: 'clock'` (`test.use`) keeps the fake rAF for specs that step frames with `runFor`.
// 2. On teardown the frames stop and the fixture waits (bounded) until the GPU finished the page's work, so a backlog
//    can never reach the next test. It also fails the test if the pacing is missing from a loaded page, or if the clock
//    took the frames despite `frames: 'native'` (Playwright internals moved: recheck this file on every upgrade).
import { test as base, type Page, type TestInfo } from '@playwright/test';

export { expect } from '@playwright/test';

/** Who drives `requestAnimationFrame`: the browser (GPU-paced, default) or Playwright's fake clock (`runFor` steps). */
export type Frames = 'native' | 'clock';

type DrainResult = 'drained' | 'timeout' | 'no-webgl';

/** Page side of the fixture (`window.__ckFrames`). */
interface PacedFrames {
  /** True while the page's `requestAnimationFrame` is the paced one (not the clock's). */
  readonly owned: () => boolean;
  /** Stops the frames for good and resolves once the GPU finished the world's work, or after `timeoutMs`. */
  readonly drain: (timeoutMs: number) => Promise<DrainResult>;
}

declare global {
  interface Window {
    __ckFrames?: PacedFrames;
  }
}

/** Teardown waits at most this long for the GPU (the fixture's own timeout below leaves room for it). */
const DRAIN_MS = 45_000;

/** Runs in the page before its scripts (an init script: self-contained, no imports or closures). */
function installFrames(frames: Frames): void {
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCaf = window.cancelAnimationFrame.bind(window);
  // Native timers and time for the drain's polling: a paused clock stops the page's own.
  const nativeTimeout = window.setTimeout.bind(window);
  const nativeNow = performance.now.bind(performance);

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
  // A fence after GL work, sent at once (a covered canvas is never presented, and an unsent fence never signals).
  // `clientWaitSync(…, 0)` reads its status without blocking (`getSyncParameter` was never updated, M2-24).
  const fenceNow = (): { readonly gl: WebGL2RenderingContext; readonly sync: WebGLSync } | null => {
    const gl = worldGl();
    const sync = gl && !gl.isContextLost() ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    if (!gl || !sync) return null;
    gl.flush();
    return { gl, sync };
  };
  // Done = signalled, or the context is lost (a reload's teardown: nothing left to wait for).
  const done = ({ gl, sync }: { readonly gl: WebGL2RenderingContext; readonly sync: WebGLSync }): boolean => {
    if (gl.isContextLost()) return true;
    if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) return false;
    gl.deleteSync(sync);
    return true;
  };

  let fence: ReturnType<typeof fenceNow> = null;
  let draining = false;
  // One native frame runs every callback requested before it, as the browser does (Pixi runs several tickers);
  // deciding per callback would let the first ticker's fence starve the next.
  const queued = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let pending: number | null = null;
  const frame = (): void => {
    pending = null;
    if (draining) return;
    if (fence && !done(fence)) {
      pending = nativeRaf(frame);
      return;
    }
    const batch = [...queued.values()];
    queued.clear();
    const now = performance.now();
    for (const cb of batch) {
      // A throwing callback is reported and the rest still run, as with the browser's own frames.
      try {
        cb(now);
      } catch (error) {
        reportError(error);
      }
    }
    fence = fenceNow();
  };
  const paced = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queued.set(id, cb);
    if (!draining) pending ??= nativeRaf(frame);
    return id;
  };
  // Playwright's clock assigns its fakes to `window`; the setters keep them (restoring = assigning `paced` back).
  let clockRaf: typeof window.requestAnimationFrame | null = null;
  let clockCaf: typeof window.cancelAnimationFrame | null = null;
  const cancel = (id: number): void => {
    if (!queued.delete(id)) {
      clockCaf?.(id);
      return;
    }
    if (queued.size > 0 || pending === null) return;
    nativeCaf(pending);
    pending = null;
  };
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    enumerable: true,
    get: () => (frames === 'clock' && clockRaf && !draining ? clockRaf : paced),
    set: (fn: typeof window.requestAnimationFrame) => {
      clockRaf = fn === paced ? null : fn;
    },
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    enumerable: true,
    get: () => cancel,
    set: (fn: typeof window.cancelAnimationFrame) => {
      clockCaf = fn === cancel ? null : fn;
    },
  });

  window.__ckFrames = {
    owned: () => window.requestAnimationFrame === paced,
    drain: (timeoutMs) => {
      // From here no frame runs (queued and new requests are held), so the GPU only has to catch up.
      draining = true;
      if (pending !== null) nativeCaf(pending);
      pending = null;
      const last = fenceNow();
      if (!last) return Promise.resolve('no-webgl');
      const deadline = nativeNow() + timeoutMs;
      return new Promise((resolve) => {
        const poll = (): void => {
          if (done(last)) resolve('drained');
          else if (nativeNow() >= deadline) resolve('timeout');
          else nativeTimeout(poll, 20);
        };
        poll();
      });
    },
  };
}

/** Teardown for one page: the ownership check, then the drain. A page that is closed or navigating is skipped. */
async function settle(page: Page, frames: Frames, testInfo: TestInfo): Promise<void> {
  if (page.isClosed()) return;
  const result = await page
    .evaluate(
      async ({ ms, native }) => {
        const pf = window.__ckFrames;
        if (!pf) return 'absent';
        if (native && !pf.owned()) return 'clock-owned';
        return pf.drain(ms);
      },
      { ms: DRAIN_MS, native: frames === 'native' },
    )
    .catch(() => 'gone' as const);
  if (result === 'absent' && page.url().startsWith('http'))
    throw new Error('the frame pacing did not install in the page (tests/e2e/helpers/test.ts)');
  if (result === 'clock-owned')
    throw new Error(
      "frames: 'native', but Playwright's clock took requestAnimationFrame: its internals changed (tests/e2e/helpers/test.ts)",
    );
  if (result === 'timeout')
    testInfo.annotations.push({
      type: 'warning',
      description: `GPU still busy ${String(DRAIN_MS / 1000)} s after the test (${page.url()})`,
    });
}

export const test = base.extend<{ frames: Frames }>({
  frames: ['native', { option: true }],
  // Its own timeout: the drain must not eat the test's budget (a slow test still gets its full teardown).
  context: [
    async ({ context, frames }, use, testInfo) => {
      await context.addInitScript(installFrames, frames);
      await use(context);
      for (const page of context.pages()) await settle(page, frames, testInfo);
    },
    { scope: 'test', timeout: DRAIN_MS + 15_000 },
  ],
});
