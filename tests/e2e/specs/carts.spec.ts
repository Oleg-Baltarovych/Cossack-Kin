// Food carts (plan M2-20): oxen and a віз drive the road from beyond the farm to the Sich gate, full, unload there and
// drive back empty — never past the gate, at most three at once, as often as the farm's kharch allows (none on a new
// farm without food). `@screens @carts` writes the review shots to reports/screens/<date>/carts-*.png: the road on the
// farm, at the farm–suburb seam and at the gate, 13:00 and 23:00 on `state=showcase` on 390×844; the farm by day on
// 360 and 412. The frozen seconds are picked so a full and an empty cart are both in the farm and seam views, and a
// full one stands unloading at the gate (seed 1, showcase's period: the content minimum).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { AGENT_BUDGET } from '../../../src/content/agents.ts';
import { decodePng } from '../../../tools/lib/png.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { screensDir } from '../helpers/reports.ts';
import { MAX_DRAW_CALLS, PARTICLE_BUDGET } from '../helpers/budgets.ts';
import { gotoReady, readStats } from '../helpers/world.ts';

const url = (state: string, time: string, freeze: number, cam: number) =>
  `/?time=${time}&freeze=${String(freeze)}&seed=1&cam=${String(cam)}&state=${state}`;

test.describe('M2-20 food carts', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('carts run with food (≤ 3 at once) and not without; budgets unchanged', async ({ page }) => {
    for (const freeze of [6, 18, 70, 94]) {
      await gotoReady(page, url('showcase', '13:00', freeze, 1060));
      const stats = await readStats(page);
      expect(stats.agents.cart, String(freeze)).toBeGreaterThan(0);
      expect(stats.agents.cart, String(freeze)).toBeLessThanOrEqual(AGENT_BUDGET.cart);
      expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
      expect(stats.particles).toBeLessThanOrEqual(PARTICLE_BUDGET);
    }
    await gotoReady(page, url('fresh', '13:00', 60, 0));
    expect((await readStats(page)).agents.cart).toBe(0);
  });
});

/** Where the carts are on screen (camera left edge, logical px) and the frozen second that puts them there. */
const SHOTS = [
  { name: 'farm', cam: 250, freeze: 18 },
  { name: 'seam', cam: 700, freeze: 94 },
  { name: 'gate', cam: 1060, freeze: 70 },
] as const;

function expectGrid(png: Buffer, testInfo: TestInfo, scale: number, cam: number): void {
  const { viewport, deviceScaleFactor = 1 } = testInfo.project.use;
  if (!viewport) throw new Error('project has no viewport');
  const frac = (((-cam * scale) % scale) + scale) % scale;
  const report = checkPixelGrid(decodePng(png), {
    scale,
    fracDevicePx: frac,
    x1: Math.floor(viewport.width * deviceScaleFactor),
    y1: Math.floor(viewport.height * deviceScaleFactor),
  });
  expect(report.violations).toEqual([]);
}

async function shoot(page: Page, testInfo: TestInfo, name: string, cam: number): Promise<void> {
  const stats = await readStats(page);
  expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
  expect(stats.particles).toBeLessThanOrEqual(PARTICLE_BUDGET);
  expect(stats.agents.cart).toBeLessThanOrEqual(AGENT_BUDGET.cart);
  const dir = screensDir();
  mkdirSync(dir, { recursive: true });
  const file = `carts-${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  expectGrid(png, testInfo, stats.scale, cam);
}

test.describe('M2-20 food carts on the road @screens @carts', () => {
  for (const { name, cam, freeze } of SHOTS) {
    for (const hhmm of ['1300', '2300']) {
      test(`${name} ${hhmm}: carts on the road to the gate`, async ({ page }, testInfo) => {
        const wide = testInfo.project.use.viewport?.width !== 390;
        test.skip(wide && (name !== 'farm' || hhmm !== '1300'), 'one day shot on 360 and 412');
        await gotoReady(page, url('showcase', `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`, freeze, cam));
        await shoot(page, testInfo, `${name}-${hhmm}`, cam);
      });
    }
  }
});
