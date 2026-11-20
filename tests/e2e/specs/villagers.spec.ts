// The villagers' day (plan M2-18): at work by day where the buildings stand, at the doors and the forge at night, no
// work on an empty plot; ≥ 8 villagers on `rich`. `@screens @villagers` writes the shots for review to
// reports/screens/<date>/villagers-*.png: farm (west, east), suburb and Sich at 07:00 / 13:00 / 23:00 for `state=rich`
// (nothing built yet) and `state=showcase` (every plot built), on 390×844; one day shot on 360 and 412.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { decodePng } from '../../../tools/lib/png.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady, readStats } from '../helpers/world.ts';

/** World shots: the M0–M2a scene budget (screens.spec.ts), unchanged by the villagers. */
const MAX_DRAW_CALLS = 11;
const PARTICLE_BUDGET = 300;
/** AC: at least this many villagers in the scene on `rich`. */
const MIN_VILLAGERS = 8;

const url = (state: string, time: string, cam = 40) =>
  `/?time=${time}&freeze=6&seed=1&cam=${String(cam)}&state=${state}`;

test.describe('M2-18 villagers', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('rich (nothing built): ≥ 8 villagers, nobody at work', async ({ page }) => {
    await gotoReady(page, url('rich', '13:00'));
    const stats = await readStats(page);
    expect(stats.agents.villager).toBeGreaterThanOrEqual(MIN_VILLAGERS);
    expect(stats.working).toBe(0);
  });

  test('every plot built: most villagers at work by day, none at night', async ({ page }) => {
    for (const time of ['07:00', '13:00']) {
      await gotoReady(page, url('showcase', time));
      expect((await readStats(page)).working, time).toBeGreaterThanOrEqual(5);
    }
    await gotoReady(page, url('showcase', '23:00'));
    const night = await readStats(page);
    expect(night.working).toBe(0);
    expect(night.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
    expect(night.particles).toBeLessThanOrEqual(PARTICLE_BUDGET);
  });
});

/** Where the villagers are on screen (camera left edge, logical px). */
const SHOTS = [
  { zone: 'farm-w', cam: 40 },
  { zone: 'farm-e', cam: 380 },
  { zone: 'suburb', cam: 880 },
  { zone: 'sich', cam: 1180 },
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
  const file = `villagers-${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  expectGrid(png, testInfo, stats.scale, cam);
}

test.describe('M2-18 villagers by the hour @screens @villagers', () => {
  for (const state of ['rich', 'showcase'] as const) {
    for (const { zone, cam } of SHOTS) {
      for (const hhmm of ['0700', '1300', '2300']) {
        // The other phones: one day shot of the farm's built field.
        const allPhones = state === 'showcase' && zone === 'farm-e' && hhmm === '1300';
        test(`${state} ${zone} ${hhmm}`, async ({ page, viewport }, testInfo) => {
          test.skip(!allPhones && viewport?.width !== 390, 'one day shot only on the other phones');
          await gotoReady(page, url(state, `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`, cam));
          await shoot(page, testInfo, `${state}-${zone}-${hhmm}`, cam);
        });
      }
    }
  }
});

/**
 * The work-done glint mid-rise (M2-18 review): a live (not frozen) world on a paused, stepped page clock — the field
 * at work until a spell ends and its glint is in the air, then a shot of it rising over the worker.
 */
test.describe('M2-18 work-done glint @screens @villagers', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('a glint rises over a villager who finishes work (not a coin)', async ({ page }, testInfo) => {
    test.setTimeout(400_000);
    const CAM = 380;
    const t0 = 1_780_315_800_000;
    await page.clock.install({ time: t0 });
    await gotoReady(page, `/?time=13:00&seed=1&cam=${String(CAM)}&state=showcase`);
    await page.clock.pauseAt(t0 + 60_000);
    await page.clock.runFor(200);
    const dir = screensDir();
    mkdirSync(dir, { recursive: true });
    // Step until a glint is born on screen (the newest one, debug stats), then shoot it 300 ms into its rise.
    let shots = 0;
    let seen = -1;
    for (let ms = 0; ms < 180_000 && shots < 2; ms += 100) {
      await page.clock.runFor(100);
      const { glint } = await readStats(page);
      if (!glint || glint.x === seen || glint.x < CAM + 20 || glint.x > CAM + 370) continue;
      seen = glint.x;
      await page.clock.runFor(300);
      ms += 300;
      const stats = await readStats(page);
      expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
      expect(stats.particles).toBeLessThanOrEqual(PARTICLE_BUDGET);
      const file = `villagers-glint-${String(shots)}-${testInfo.project.name}.png`;
      const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
      await testInfo.attach(file, { body: png, contentType: 'image/png' });
      shots += 1;
    }
    expect(shots, 'a glint was born on screen within three minutes').toBeGreaterThan(0);
  });
});
