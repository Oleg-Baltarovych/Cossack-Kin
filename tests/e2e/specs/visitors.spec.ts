// Visitors (plan M2-21): the core timetable brings one traveller at a time along the road into the suburb. `@screens
// @visitors` writes the review shots to reports/screens/<date>/visitors-*.png: the кобзар playing by the tavern at
// 13:00 on `state=tiers&tier=6` (the tavern stands) on 390×844, and the same view by day on 360 and 412. Seed 171 has
// a кобзар visit starting 137 s after the frozen game clock (FROZEN_NOW), so `freeze=13` is 150 s into it — past his
// walk in, seated and playing (the timetable is pinned by tests/unit/core/visitors.test.ts); plus the гончар at the
// fair on 390; the лірник at the well and the чумак with his віз at the layby (M2-29 B1); on 390 the four also at
// 19:30 (visitors keep to the day hours, so the golden hour is their darkest key).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { AGENT_BUDGET } from '../../../src/content/agents.ts';
import { decodePng } from '../../../tools/lib/png.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { screensDir } from '../helpers/reports.ts';
import { MAX_DRAW_CALLS, PARTICLE_BUDGET } from '../helpers/budgets.ts';
import { gotoReady, readStats } from '../helpers/world.ts';

/** Seed 118 has a гончар visit starting 110 s after FROZEN_NOW: `freeze=10` is 120 s in, at the fair. */
const HANCHAR_SEED = 118;
const HANCHAR_FREEZE = 10;
/** Camera left edge with the fair square in view. */
const FAIR_CAM = 900;
/** Seed 241 has a лірник visit starting 154 s before the frozen clock (+10 s = 164 s in, playing by the well). */
const LIRNYK_SEED = 241;
/** Seed 127 has a чумак visit starting 145 s before (+10 s = 155 s in, his віз on the layby). */
const CHUMAK_SEED = 127;
/** Camera left edges with the well (suburb x 226) and the layby (suburb x 300) in view. */
const WELL_CAM = 860;
const LAYBY_CAM = 930;
const KOBZAR_SEED = 171;
const KOBZAR_FREEZE = 13;
/** Camera left edge (logical px) with the tavern and the кобзар left of its door in view. */
const TAVERN_CAM = 790;

const url = (state: string, time: string, seed: number, freeze: number, cam: number) =>
  `/?time=${time}&freeze=${String(freeze)}&seed=${String(seed)}&cam=${String(cam)}&state=${state}`;

test.describe('M2-21 visitors', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('a visitor by day within the budget; nobody at night or on the showcase', async ({ page }) => {
    await gotoReady(page, url('tiers&tier=6', '13:00', KOBZAR_SEED, KOBZAR_FREEZE, TAVERN_CAM));
    const day = await readStats(page);
    expect(day.agents.visitor).toBe(1);
    expect(day.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
    expect(day.particles).toBeLessThanOrEqual(PARTICLE_BUDGET);
    await gotoReady(page, url('tiers&tier=6', '23:00', KOBZAR_SEED, KOBZAR_FREEZE, TAVERN_CAM));
    expect((await readStats(page)).agents.visitor).toBe(0);
    await gotoReady(page, url('showcase', '13:00', KOBZAR_SEED, KOBZAR_FREEZE, TAVERN_CAM));
    expect((await readStats(page)).agents.visitor).toBe(0);
  });
});

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
  expect(stats.agents.visitor).toBeGreaterThan(0);
  expect(stats.agents.visitor).toBeLessThanOrEqual(AGENT_BUDGET.visitor);
  const dir = screensDir();
  mkdirSync(dir, { recursive: true });
  const file = `visitors-${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  expectGrid(png, testInfo, stats.scale, cam);
}

test.describe('M2-21 visitors in the suburb @screens @visitors', () => {
  test('кобзар 1300: playing by the tavern', async ({ page }, testInfo) => {
    await gotoReady(page, url('tiers&tier=6', '13:00', KOBZAR_SEED, KOBZAR_FREEZE, TAVERN_CAM));
    await shoot(page, testInfo, 'kobzar-1300', TAVERN_CAM);
  });

  for (const { name, seed, freeze, cam } of [
    { name: 'kobzar', seed: KOBZAR_SEED, freeze: KOBZAR_FREEZE, cam: TAVERN_CAM },
    { name: 'hanchar', seed: HANCHAR_SEED, freeze: HANCHAR_FREEZE, cam: FAIR_CAM },
    { name: 'lirnyk', seed: LIRNYK_SEED, freeze: 10, cam: WELL_CAM },
    { name: 'chumak', seed: CHUMAK_SEED, freeze: 10, cam: LAYBY_CAM },
  ]) {
    for (const hhmm of ['1300', '1930']) {
      if (name === 'kobzar' && hhmm === '1300') continue;
      test(`${name} ${hhmm}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.use.viewport?.width !== 390, 'one shot on 390');
        await gotoReady(page, url('tiers&tier=6', `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`, seed, freeze, cam));
        await shoot(page, testInfo, `${name}-${hhmm}`, cam);
      });
    }
  }
});
