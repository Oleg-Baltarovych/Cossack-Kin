// Camera (plan M2-02, SPEC §6.1): a finger drag moves the camera and the fling coasts to a stop; the «Січ» tab glides
// the camera to the Sich anchor, and a frame half-way through the glide keeps the pixel grid. Time is Playwright's
// fake clock: paused, then advanced with `runFor`, so every frame (rAF) and every pointer timestamp is deterministic.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { CAMERA } from '../../../src/render/atmosphere/config.ts';
import { split } from '../../../src/render/camera.ts';
import { decodePng } from '../../../tools/lib/png.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { validateState } from '../../../src/core/state.ts';
import { gotoReady, readStats, type WorldStats } from '../helpers/world.ts';
// Type-only: the window.__CK_GAME__ declaration.
import type {} from '../../../src/ui/debug/gameDebug.ts';

const T0 = new Date('2026-06-01T10:00:00Z').getTime();
/** One 60 fps frame of fake time. */
const FRAME_MS = 16;
/**
 * Enough fake time for a rendered frame: Pixi's ticker (maxFPS 60) skips an rAF that comes < 16.7 ms after the last
 * frame it drew, so a single 16-ms step may not render the latest input.
 */
const SETTLE_MS = 3 * FRAME_MS;
const SICH = KHORTYTSIA_WORLD.zones.find((z) => z.id === 'sich');

const today = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function cam(page: Page): Promise<number> {
  const c = await page.evaluate(() => window.__CK__?.stats.cam);
  if (c === undefined) throw new Error('window.__CK__.stats.cam is missing — is this a --mode test build?');
  return c;
}

/** CI SwiftShader can take several seconds to deliver a queued touch move (the default 5 s poll flaked). */
const TOUCH_POLL = { timeout: 15_000 } as const;

/**
 * Asks Chrome for one real main frame. Chrome holds touch/pointer moves until its next (real) frame (rAF-aligned
 * input), and with the fake clock owning `requestAnimationFrame` nothing else guarantees that frame comes after a
 * move was dispatched: the frame `runFor` drew may already be past. Without it a move can wait forever (CI: the pinch
 * saw the previous move for 5 s). A style write on the root schedules a visual update — a real BeginMainFrame — which
 * flushes the queued moves; the game never reads the property.
 */
async function requestRealFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--e2e-frame', String(Number(root.style.getPropertyValue('--e2e-frame') || '0') + 1));
  });
}

/** Opens `url` on a fake clock and pauses it: from here on frames run only through `runFor`. */
async function openPaused(page: Page, url: string): Promise<void> {
  await page.clock.install({ time: T0 });
  await gotoReady(page, url);
  await page.clock.pauseAt(T0 + 60_000);
  await page.clock.runFor(SETTLE_MS);
}

test.describe('M2-02 camera', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('a finger drag moves the camera with the finger, the fling coasts and stops, the tab follows', async ({
    page,
  }, testInfo: TestInfo) => {
    // cam 900: the view's centre (1095) is in the suburb → the «Хутір» tab; the drag takes it into the Sich.
    await openPaused(page, '/?seed=1&freeze&time=13:00&cam=900&ui=1');
    expect(await cam(page)).toBe(900);
    const selected = (name: string) => page.getByRole('tab', { name });
    await expect(selected('Хутір')).toHaveAttribute('aria-selected', 'true');
    const { scale } = await readStats(page);
    const dpr = testInfo.project.use.deviceScaleFactor ?? 1;
    const logical = (css: number): number => (css * dpr) / scale;

    // Record what the canvas receives: Chrome aligns pointermoves to its own (real) frames, so each move is awaited
    // until it has been delivered before the fake clock advances — every move is its own sample, as on a phone.
    await page.evaluate(() => {
      const canvas = document.querySelector('#world canvas');
      if (!canvas) throw new Error('no world canvas');
      const seen = { x: Number.NaN, moves: 0 };
      Object.assign(window, { __moves: seen });
      canvas.addEventListener('pointermove', (e) => {
        if (!(e instanceof PointerEvent)) return;
        seen.x = e.clientX;
        seen.moves += 1;
      });
    });
    const delivered = (): Promise<{ x: number; moves: number }> =>
      page.evaluate(
        () => (window as Window & { __moves?: { x: number; moves: number } }).__moves ?? { x: Number.NaN, moves: 0 },
      );
    const cdp = await page.context().newCDPSession(page);
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number): Promise<void> => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: 300 }] });
    };
    // A real touch sequence (pointerType "touch"), 20 CSS px per frame to the left = the camera goes right.
    await touch('touchStart', 300);
    for (let i = 1; i <= 10; i++) {
      await page.clock.runFor(FRAME_MS);
      await touch('touchMove', 300 - 20 * i);
      await expect
        .poll(async () => {
          await requestRealFrame(page);
          return (await delivered()).x;
        }, TOUCH_POLL)
        .toBe(300 - 20 * i);
    }
    expect((await delivered()).moves).toBe(10);
    await page.clock.runFor(SETTLE_MS);
    // The first move crosses the slop and the drag grabs there: the camera follows the other 9 moves exactly.
    const dragged = await cam(page);
    expect(dragged).toBe(900 + logical(180));

    await touch('touchEnd');
    await page.clock.runFor(1000); // the fling stops within ≤ 0.88 s (CAMERA)
    const coasted = await cam(page);
    expect(coasted).toBeGreaterThan(dragged);
    await page.clock.runFor(500);
    expect(await cam(page)).toBe(coasted);
    await expect(selected('Січ')).toHaveAttribute('aria-selected', 'true');
  });

  test('the «Січ» tab glides the camera to the Sich anchor; half-way the frame keeps the pixel grid', async ({
    page,
  }, testInfo: TestInfo) => {
    if (!SICH) throw new Error('no Sich zone in the world');
    await openPaused(page, '/?seed=1&freeze&time=13:00&ui=1');
    expect(await cam(page)).toBe(0);
    const { scale } = await readStats(page);

    await page.getByRole('tab', { name: 'Січ' }).click();
    await page.clock.runFor(CAMERA.glideMs / 2);
    const mid = await cam(page);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(SICH.anchorX);

    // The world between the HUD and the panel: whole scale×scale blocks at the camera's device-px phase.
    const hud = await page.locator('header').boundingBox();
    const panel = await page.locator('section').first().boundingBox();
    if (!hud || !panel) throw new Error('no HUD or panel on the page');
    const { viewport, deviceScaleFactor: dpr = 1 } = testInfo.project.use;
    if (!viewport) throw new Error('project has no viewport');
    mkdirSync(join('reports', 'screens', today()), { recursive: true });
    const file = `camera-glide-mid-${testInfo.project.name}.png`;
    const png = await page.screenshot({ path: join('reports', 'screens', today(), file), scale: 'device' });
    await testInfo.attach(file, { body: png, contentType: 'image/png' });
    const report = checkPixelGrid(decodePng(png), {
      scale,
      fracDevicePx: split(mid, scale).fracDevicePx,
      y0: Math.ceil((hud.y + hud.height) * dpr) + 1,
      y1: Math.floor(panel.y * dpr) - 1,
      x1: Math.floor(viewport.width * dpr),
    });
    expect(report.violations, `${String(report.violationCount)} px break the grid at cam ${String(mid)}`).toEqual([]);
    expect(report.columnEdges).toBeGreaterThan(0);

    await page.clock.runFor(CAMERA.glideMs);
    // The anchor, unless the view would pass the world's right edge there (visible width = ceil(device px / scale)).
    const maxX = KHORTYTSIA_WORLD.width - Math.ceil((viewport.width * dpr) / scale);
    expect(await cam(page)).toBe(Math.min(SICH.anchorX, maxX));

    await page.getByRole('tab', { name: 'Хутір' }).click();
    await page.clock.runFor(CAMERA.glideMs + SETTLE_MS);
    expect(await cam(page)).toBe(0);
  });
});

// Plan M2-03 (SPEC §6.1, Q4): a two-finger pinch switches between the two integer zoom levels and keeps the world point
// between the fingers in place; it never taps (earns). Ctrl+wheel is the desktop equivalent.
test.describe('M2-03 pinch zoom', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  /** World px under a CSS-px screen point in the frame on screen. */
  const worldAt = (s: WorldStats, dpr: number, x: number, y: number) => ({
    x: s.cam + (x * dpr) / s.scale,
    y: s.camY + (y * dpr) / s.scale,
  });
  const taps = async (page: Page): Promise<number> => {
    const json = await page.evaluate(() => window.__CK_GAME__?.state() ?? 'null');
    const game = validateState(JSON.parse(json));
    if (!game.ok) throw new Error('no game state');
    return game.state.stats.taps;
  };

  test('spreading two fingers goes one level closer, pinching goes back; the midpoint stays (±1 px), no tap', async ({
    page,
  }, testInfo: TestInfo) => {
    await openPaused(page, '/?seed=1&freeze&time=13:00&cam=600&ui=1');
    const dpr = testInfo.project.use.deviceScaleFactor ?? 1;
    const normal = await readStats(page);
    expect(normal).toMatchObject({ zoom: 0, camY: 0, cam: 600 });

    // Record the last clientX the canvas got per pointer: each move is awaited until delivered (see the drag test).
    await page.evaluate(() => {
      const canvas = document.querySelector('#world canvas');
      if (!canvas) throw new Error('no world canvas');
      const seen: Record<number, number> = {};
      Object.assign(window, { __fingers: seen });
      canvas.addEventListener('pointermove', (e) => {
        if (e instanceof PointerEvent) seen[e.pointerId] = e.clientX;
      });
    });
    const delivered = (): Promise<number[]> =>
      page.evaluate(() =>
        Object.values((window as Window & { __fingers?: Record<number, number> }).__fingers ?? {}).sort(
          (a, b) => a - b,
        ),
      );
    const cdp = await page.context().newCDPSession(page);
    const Y = 300;
    const MID = 195;
    const fingers = (half: number) => [
      { x: MID - half, y: Y, id: 1 },
      { x: MID + half, y: Y, id: 2 },
    ];
    /** Both fingers from half-distance `from` to `to` around the midpoint in 6 frames, then both lift. */
    const gesture = async (from: number, to: number): Promise<void> => {
      // A new touch sequence gets new pointer ids: forget the last gesture's fingers.
      await page.evaluate(() => {
        const seen = (window as Window & { __fingers?: Record<number, number> }).__fingers ?? {};
        for (const id of Object.keys(seen)) Reflect.deleteProperty(seen, id);
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(from) });
      for (let i = 1; i <= 6; i++) {
        const half = from + ((to - from) * i) / 6;
        await page.clock.runFor(FRAME_MS);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(half) });
        await expect
          .poll(async () => {
            await requestRealFrame(page);
            return delivered();
          }, TOUCH_POLL)
          .toEqual([MID - half, MID + half]);
      }
      await page.clock.runFor(SETTLE_MS);
    };
    const lift = async (): Promise<void> => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.clock.runFor(1000);
    };

    const before = worldAt(normal, dpr, MID, Y);
    await gesture(45, 90); // finger distance ×2 ≥ CAMERA.pinchInRatio
    const closer = await readStats(page);
    expect(closer.zoom).toBe(1);
    expect(closer.scale).toBe(normal.scale + 1);
    const after = worldAt(closer, dpr, MID, Y);
    expect(Math.abs(after.x - before.x), `x ${String(before.x)} → ${String(after.x)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y), `y ${String(before.y)} → ${String(after.y)}`).toBeLessThanOrEqual(1);
    await lift();
    // Lifting both fingers: no fling, no tap, still closer.
    expect(await readStats(page)).toMatchObject({ zoom: 1, cam: closer.cam, camY: closer.camY });
    expect(await taps(page)).toBe(0);

    await gesture(90, 45); // ×0.5 ≤ CAMERA.pinchOutRatio
    const back = await readStats(page);
    expect(back).toMatchObject({ zoom: 0, camY: 0, scale: normal.scale });
    expect(Math.abs(worldAt(back, dpr, MID, Y).x - before.x)).toBeLessThanOrEqual(1);
    await lift();
    expect(await taps(page)).toBe(0);
  });

  test('ctrl+wheel zooms about the cursor (desktop)', async ({ page }, testInfo: TestInfo) => {
    await openPaused(page, '/?seed=1&freeze&time=13:00&cam=600');
    const dpr = testInfo.project.use.deviceScaleFactor ?? 1;
    const normal = await readStats(page);
    const wheel = (deltaY: number): Promise<void> =>
      page.evaluate((dy) => {
        const canvas = document.querySelector('#world canvas');
        if (!canvas) throw new Error('no world canvas');
        const e = new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, clientX: 100, clientY: 400, cancelable: true });
        canvas.dispatchEvent(e);
        if (!e.defaultPrevented) throw new Error('ctrl+wheel was not taken by the world');
      }, deltaY);
    // Small trackpad deltas add up: 2 × 20 px stay normal, the third crosses CAMERA.wheelZoomPx (50).
    await wheel(-20);
    await wheel(-20);
    await page.clock.runFor(SETTLE_MS);
    expect((await readStats(page)).zoom).toBe(0);
    await wheel(-20);
    await page.clock.runFor(SETTLE_MS);
    const closer = await readStats(page);
    expect(closer.zoom).toBe(1);
    const a = worldAt(normal, dpr, 100, 400);
    const b = worldAt(closer, dpr, 100, 400);
    expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(1);
    await wheel(100);
    await page.clock.runFor(SETTLE_MS);
    expect(await readStats(page)).toMatchObject({ zoom: 0, camY: 0 });
  });
});
