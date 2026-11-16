// M0 screenshot spec (plan M0-04/06/07). Writes artifacts to reports/screens/<date>/ on every platform;
// baselines (`toHaveScreenshot`) are compared on Linux only — SwiftShader output differs per OS.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { split } from '../../../src/render/camera.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { decodePng } from '../helpers/png.ts';
import { gotoReady, readStats, readWebGl, waitReady } from '../helpers/world.ts';

/** M0 frame budget for the sky + ground scene (plan M0-06). */
const MAX_DRAW_CALLS = 5;
const SCENE = '/?seed=1&freeze&time=13:00';
const CAM = 10.5;
const COMPARE_BASELINES = process.platform === 'linux';

const today = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const SCREENS_DIR = join('reports', 'screens', today());

async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<Buffer> {
  mkdirSync(SCREENS_DIR, { recursive: true });
  const file = `${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(SCREENS_DIR, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  return png;
}

async function expectBaseline(page: Page, name: string): Promise<void> {
  if (COMPARE_BASELINES) await expect(page).toHaveScreenshot(`${name}.png`);
}

async function expectWebGlWithinBudget(page: Page): Promise<number> {
  const gl = await readWebGl(page);
  expect(gl.kind, `no WebGL context (renderer: ${gl.renderer})`).not.toBeNull();
  const stats = await readStats(page);
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
  return stats.scale;
}

/**
 * Checks the whole device px of the viewport. With a fractional device height (915 css × 3.5 = 3202.5)
 * the screenshot has one extra row that the compositor blends from the half-covered px — not game output.
 */
function expectPixelGrid(png: Buffer, testInfo: TestInfo, scale: number, fracDevicePx: number): void {
  const { viewport, deviceScaleFactor = 1 } = testInfo.project.use;
  if (!viewport) throw new Error('project has no viewport');
  const report = checkPixelGrid(decodePng(png), {
    scale,
    fracDevicePx,
    x1: Math.floor(viewport.width * deviceScaleFactor),
    y1: Math.floor(viewport.height * deviceScaleFactor),
  });
  expect(
    report.violations,
    `${String(report.violationCount)} px break the ${String(scale)}×${String(scale)} grid`,
  ).toEqual([]);
  // Sky dither and grass tufts guarantee edges on both axes; none would mean a blank or broken frame.
  expect(report.columnEdges).toBeGreaterThan(0);
  expect(report.rowEdges).toBeGreaterThan(0);
}

test.describe('M0 screens @screens', () => {
  test('sky + ground: WebGL, budget, pixel grid, deterministic after reload', async ({ page }, testInfo) => {
    await gotoReady(page, SCENE);
    const scale = await expectWebGlWithinBudget(page);
    const first = await shoot(page, testInfo, 'm0-sky-ground');
    expectPixelGrid(first, testInfo, scale, 0);

    await page.reload();
    await waitReady(page);
    const second = await page.screenshot({ scale: 'device' });
    expect(second.equals(first), 'two shots of the same URL after reload differ').toBe(true);
    await expectBaseline(page, 'm0-sky-ground');
  });

  test(`camera ${String(CAM)}: sub-pixel shift keeps whole blocks`, async ({ page }, testInfo) => {
    await gotoReady(page, `${SCENE}&cam=${String(CAM)}`);
    const scale = await expectWebGlWithinBudget(page);
    const { fracDevicePx } = split(CAM, scale);
    // Every M0 project has scale 3 or 4, so 10.5 always leaves a non-zero device-px remainder.
    expect(fracDevicePx).toBeGreaterThan(0);
    const png = await shoot(page, testInfo, `m0-sky-ground-cam${String(CAM)}`);
    expectPixelGrid(png, testInfo, scale, fracDevicePx);
    await expectBaseline(page, `m0-sky-ground-cam${String(CAM)}`);
  });

  test('debug overlay at 13:00', async ({ page }, testInfo) => {
    await gotoReady(page, '/?overlay&time=13:00&freeze&seed=1');
    await expectWebGlWithinBudget(page);
    const overlay = page.getByTestId('debug-overlay');
    for (const label of ['fps', 'frame', 'draw', 'parts', 'scale', 'view']) await expect(overlay).toContainText(label);
    await shoot(page, testInfo, 'm0-overlay-1300');
    // No baseline: fps / frame ms are live numbers.
  });
});
