// Shared e2e helpers for the world canvas: deterministic navigation and debug stats (`window.__CK__`). Frames are
// GPU-paced and drained by the `test` fixture (helpers/test.ts), not here.
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

/**
 * Waits until the camera stands still: the same `__CK__.stats.cam` over at least 3 rendered frames (a tab glide takes
 * `CAMERA.glideMs`; a shot during it differs from run to run). `leaving`: the camera's x before the glide (not settled there).
 */
export async function cameraSettled(page: Page, leaving?: number): Promise<void> {
  let last: { cam: number; frames: number } | null = null;
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => {
          const s = window.__CK__?.stats;
          return s ? { cam: s.cam, frames: s.frames } : null;
        });
        if (!now) throw new Error('window.__CK__.stats is missing — is this a --mode test build?');
        if (!last || now.cam !== last.cam) last = now;
        return now.cam === leaving ? 0 : now.frames - last.frames;
      },
      { intervals: [50], timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(3);
}
