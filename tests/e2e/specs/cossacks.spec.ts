// The Sich's people (plan M2-19): as many Cossacks as the army has (≤ 16), the drill on the maidan with the otaman by
// day, free Cossacks in the suburb, pipes by the fire and torches on the rampart at night. `@screens @cossacks` writes
// the review shots to reports/screens/<date>/cossacks-*.png: the Sich west and east and the suburb at 07:00 / 13:00 /
// 23:00 on `state=showcase` (army 40 → 16 on the scene; the east on the top tiers, `state=tiers&tier=6`) on 390×844;
// one Sich day shot on 360 and 412.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { decodePng } from '../../../tools/lib/png.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady, readStats } from '../helpers/world.ts';

/** World shots: the M0–M2a scene budget (screens.spec.ts), unchanged by the people. */
const MAX_DRAW_CALLS = 11;
const PARTICLE_BUDGET = 300;
/** Q11: Cossacks beyond this stay abstract. */
const COSSACK_BUDGET = 16;

/** Every Sich building at its top tier (IV: the wall towers, the second fire) with the host (debug `tiers` preset). */
const TOP_SICH = 'tiers&tier=6';

const url = (state: string, time: string, cam: number) =>
  `/?time=${time}&freeze=6&seed=1&cam=${String(cam)}&state=${state}`;

test.describe('M2-19 Cossacks', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('the army is on the scene: 6 on `mid`, the budget of 16 on `showcase` (army 40), none on `fresh`', async ({
    page,
  }) => {
    await gotoReady(page, url('mid', '13:00', 1152));
    expect((await readStats(page)).agents.cossack).toBe(6);
    await gotoReady(page, url('showcase', '13:00', 1152));
    const day = await readStats(page);
    expect(day.agents.cossack).toBe(COSSACK_BUDGET);
    expect(day.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
    await gotoReady(page, url('fresh', '13:00', 1152));
    expect((await readStats(page)).agents.cossack).toBe(0);
  });

  test('at night all four guards hold torches within the budgets (walls III: every tower)', async ({ page }) => {
    for (const cam of [1152, 1530]) {
      await gotoReady(page, url(TOP_SICH, '23:00', cam));
      const night = await readStats(page);
      expect(night.agents.cossack, String(cam)).toBe(COSSACK_BUDGET);
      expect(night.drawCalls, String(cam)).toBeLessThanOrEqual(MAX_DRAW_CALLS);
      expect(night.particles, String(cam)).toBeLessThanOrEqual(PARTICLE_BUDGET);
    }
  });
});

/** Where the Cossacks are on screen (camera left edge, logical px). */
const SHOTS = [
  { zone: 'sich-w', cam: 1152, state: 'showcase' },
  // The Sich's east has its content from tier III–IV (kurins 3–4, the koshovyi's house, the second fire, the wall
  // towers' guards): shot on the top tiers (M2-19 review: at showcase's tier II it was an empty maidan).
  { zone: 'sich-e', cam: 1530, state: TOP_SICH },
  { zone: 'suburb', cam: 880, state: 'showcase' },
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
  const dir = screensDir();
  mkdirSync(dir, { recursive: true });
  const file = `cossacks-${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  expectGrid(png, testInfo, stats.scale, cam);
}

test.describe('M2-19 Cossacks by the hour @screens @cossacks', () => {
  for (const { zone, cam, state } of SHOTS) {
    for (const hhmm of ['0700', '1300', '2300']) {
      const allPhones = zone === 'sich-w' && hhmm === '1300';
      const name = `${state === TOP_SICH ? 'top' : state}-${zone}-${hhmm}`;
      test(name, async ({ page, viewport }, testInfo) => {
        test.skip(!allPhones && viewport?.width !== 390, 'one day shot only on the other phones');
        await gotoReady(page, url(state, `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`, cam));
        await shoot(page, testInfo, name, cam);
      });
    }
  }
});
