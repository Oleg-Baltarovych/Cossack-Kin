// People on the path graph (plan M2-16): `__CK__.stats.agents` counts the pool by role within the Q11 budgets, and a
// frozen frame is the same for the same seed (the pool steps whole ticks on the animation clock). `@screens @agents`
// writes day and night shots of the agents in every zone to reports/screens/<date>/agents-*.png for review.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { AGENT_BUDGET, type AgentRole } from '../../../src/content/agents.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { decodePng } from '../../../tools/lib/png.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady, readStats } from '../helpers/world.ts';
import { MAX_DRAW_CALLS } from '../helpers/budgets.ts';

const ROLES: readonly AgentRole[] = ['villager', 'cossack', 'visitor', 'cart'];

async function worldShot(page: Page): Promise<Buffer> {
  return page.screenshot({ scale: 'device' });
}

test.describe('M2-16 agents', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('stats.agents counts the pool by role within the Q11 budgets', async ({ page }) => {
    await gotoReady(page, '/?time=13:00&freeze=6&seed=1&zone=farm');
    const { agents, drawCalls } = await readStats(page);
    // People: every spawn is on the scene (showcase: the household at its full budget, M2-29 D; the whole army). Food carts (M2-20) and visitors (M2-21) come and go: those in the village
    // count — carts on the road (≤ 3), visitors on a visit (agents, one at a time; the чумак's віз is his, not a cart).
    const comeAndGo: readonly AgentRole[] = ['cart', 'visitor'];
    const people = KHORTYTSIA_WORLD.agents.filter((a) => !comeAndGo.includes(a.role));
    const expected = Object.fromEntries(
      ROLES.filter((r) => !comeAndGo.includes(r)).map((r) => [r, people.filter((a) => a.role === r).length]),
    );
    expect(agents).toEqual({
      total: people.length + agents.cart + agents.visitor,
      cart: agents.cart,
      visitor: agents.visitor,
      ...expected,
    });
    expect(agents.visitor).toBeLessThanOrEqual(1);
    for (const r of ROLES) expect(agents[r], r).toBeLessThanOrEqual(AGENT_BUDGET[r]);
    expect(drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
  });

  test('a frozen frame is the same for the same seed', async ({ page }) => {
    const url = '/?time=13:00&freeze=7.5&seed=3&cam=60';
    await gotoReady(page, url);
    const a = await worldShot(page);
    await gotoReady(page, url);
    const b = await worldShot(page);
    expect(a.equals(b)).toBe(true);
  });
});

/** Where the agents are on screen in each zone (camera left edge, logical px). */
const SHOTS = [
  { zone: 'farm', cam: 40 },
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

test.describe('M2-16 agents on the graph @screens @agents', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  for (const { zone, cam } of SHOTS) {
    for (const hhmm of ['1300', '2300']) {
      test(`${zone} ${hhmm}: people on the path graph, within budget`, async ({ page }, testInfo) => {
        const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
        await gotoReady(page, `/?time=${time}&freeze=6&seed=1&cam=${String(cam)}`);
        const stats = await readStats(page);
        expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
        const dir = screensDir();
        mkdirSync(dir, { recursive: true });
        const file = `agents-${zone}-${hhmm}-${testInfo.project.name}.png`;
        const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
        await testInfo.attach(file, { body: png, contentType: 'image/png' });
        expectGrid(png, testInfo, stats.scale, cam);
      });
    }
  }
});

/** M2-17: every villager animation on both bodies (`?lineup`, render/debug/lineup.ts) in the farm meadow. */
test.describe('M2-17 villager animations in the scene @screens @lineup', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');
  const cam = 40;
  for (const [hhmm, zoom] of [
    ['1300', 0],
    ['2300', 0],
    ['1300', 1],
    ['2300', 1],
  ] as const) {
    test(`lineup ${hhmm}${zoom ? ' closer' : ''}: work, talk, sit, cheer on both bodies`, async ({
      page,
    }, testInfo) => {
      const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
      const closer = zoom ? '&zoom=1' : '';
      await gotoReady(page, `/?time=${time}&freeze=6.3&seed=1&cam=${String(cam)}&lineup${closer}`);
      const stats = await readStats(page);
      expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
      const dir = screensDir();
      mkdirSync(dir, { recursive: true });
      const file = `lineup-${hhmm}${zoom ? '-closer' : ''}-${testInfo.project.name}.png`;
      const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
      await testInfo.attach(file, { body: png, contentType: 'image/png' });
      if (!zoom) expectGrid(png, testInfo, stats.scale, cam);
    });
  }
});

/** M3-13: the raid's figures (`?lineup=raid`): march ×3, the otaman, the корогвоносець with the wind-blown корогва, the chest carriers, cheer. */
test.describe('M3-13 raid figures in the scene @screens @lineup', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');
  const cam = 40;
  for (const [hhmm, zoom] of [
    ['1300', 0],
    ['2300', 0],
    ['1300', 1],
    ['2300', 1],
  ] as const) {
    test(`raid lineup ${hhmm}${zoom ? ' closer' : ''}`, async ({ page }, testInfo) => {
      const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
      const closer = zoom ? '&zoom=1' : '';
      await gotoReady(page, `/?time=${time}&freeze=6.3&seed=1&cam=${String(cam)}&lineup=raid&wind=breeze${closer}`);
      const stats = await readStats(page);
      expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
      const dir = screensDir();
      mkdirSync(dir, { recursive: true });
      const file = `lineup-raid-${hhmm}${zoom ? '-closer' : ''}-${testInfo.project.name}.png`;
      const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
      await testInfo.attach(file, { body: png, contentType: 'image/png' });
      if (!zoom) expectGrid(png, testInfo, stats.scale, cam);
    });
  }
});
