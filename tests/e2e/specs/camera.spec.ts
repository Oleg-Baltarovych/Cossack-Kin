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
import { gotoReady, readStats } from '../helpers/world.ts';

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
      await expect.poll(async () => (await delivered()).x).toBe(300 - 20 * i);
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
