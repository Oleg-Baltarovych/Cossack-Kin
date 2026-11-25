// The raid squad on the scene (plan M3-14, SPEC §6.6; route: art-director M3-13). On `state=chests` (both squads back
// with their chests from before the load — no parade, Q14; 12 Cossacks): squad 1's chest is claimed and the squad sent
// again; it musters on the maidan, marches up the trail into the gate and is gone; a live return brings it back the
// same way with the chest, set down mid-maidan, villagers cheering at the Sich's threshold. A live world (no `?freeze`)
// on a paused, stepped page clock with native frames (build.spec), so every shot is an exact moment; the game's own
// loop runs on the same clock. Draw calls within the world shots' budget, particles ≤ 300 at every shot.
// `@raid` checks the phases (functional run, 13:00); `@raid @screens` writes reports/screens/<date>/raid-<step>-<hhmm>-
// <project>.png at 13:00 and 23:00 for the art review.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
// Type-only: the window.__CK_GAME__ declaration.
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { MAX_DRAW_CALLS, PARTICLE_BUDGET } from '../helpers/budgets.ts';
import { screensDir } from '../helpers/reports.ts';
import { assertNativeFrames, gotoReady, nativeFrames, readStats, type WorldStats } from '../helpers/world.ts';

const T0 = new Date('2026-06-01T10:00:00Z').getTime();
/** The Sich zone (x 1152) and a little of the road before it: the threshold where villagers cheer is in view. */
const CAM = 1128;
const STEP_MS = 500;

/** Runs the paused clock for `ms`, then waits for one native frame: the world is drawn at the new moment. */
async function step(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );
}

/** Steps until squad 1 is in `phase` (at most `maxS` s of the page clock). */
async function until(page: Page, phase: string, maxS = 60): Promise<WorldStats> {
  for (let ms = 0; ms <= maxS * 1000; ms += STEP_MS) {
    const stats = await readStats(page);
    if (stats.squads[0] === phase) return stats;
    await step(page, STEP_MS);
  }
  throw new Error(`squad 1 never reached "${phase}" (now ${(await readStats(page)).squads.join(', ')})`);
}

async function within(page: Page, name: string): Promise<WorldStats> {
  const stats = await readStats(page);
  expect(stats.drawCalls, `${name}: draw calls`).toBeLessThanOrEqual(MAX_DRAW_CALLS);
  expect(stats.particles, `${name}: particles`).toBeLessThanOrEqual(PARTICLE_BUDGET);
  return stats;
}

const dispatch = (page: Page, action: object): Promise<readonly string[]> =>
  page.evaluate((a) => window.__CK_GAME__?.dispatch(JSON.parse(a) as never) ?? [], JSON.stringify(action));

/** Squad 1's return time (game ms) and the page's game clock now. */
const timing = (page: Page): Promise<{ returnAt: number; now: number }> =>
  page.evaluate(() => {
    const s = JSON.parse(window.__CK_GAME__?.state() ?? 'null') as {
      raids: { slots: { kind: string; raid?: { returnAt: number } }[] };
    };
    return { returnAt: s.raids.slots[0]?.raid?.returnAt ?? 0, now: Date.now() };
  });

/** The whole round at `time`; `shoot` writes the review shots. */
async function round(page: Page, time: string, shoot: boolean): Promise<void> {
  const key = time.replace(':', '');
  const dir = screensDir();
  mkdirSync(dir, { recursive: true });
  const shot = async (name: string): Promise<WorldStats> => {
    const stats = await within(page, name);
    if (shoot)
      await page.screenshot({
        path: join(dir, `raid-${name}-${key}-${test.info().project.name}.png`),
        scale: 'device',
      });
    return stats;
  };

  await page.clock.install({ time: T0 });
  await nativeFrames(page);
  await gotoReady(page, `/?seed=1&time=${time}&cam=${String(CAM)}&state=chests`);
  await assertNativeFrames(page);
  await page.clock.pauseAt(T0 + 60_000);
  await step(page, 48);

  // Loaded with both squads back: two chests on the maidan, no parade.
  const loaded = await shot('0-loaded');
  expect(loaded.squads).toEqual(['home', 'home']);

  // Claim the chest, send the squad again: it musters, then marches into the gate.
  expect(await dispatch(page, { type: 'claimRaid', slot: 0 })).toContain('RaidClaimed');
  expect(await dispatch(page, { type: 'startRaid', slot: 0, tier: 'm5' })).toContain('RaidStarted');
  await step(page, STEP_MS);
  expect((await readStats(page)).squads[0]).toBe('muster');
  await until(page, 'out');
  await step(page, 2000);
  await shot('1-leave');

  // On the road: the squad is not on the scene.
  const away = await until(page, 'away');
  await step(page, STEP_MS);
  await shot('2-road');
  expect(away.agents.cossack).toBeLessThan(loaded.agents.cossack);

  // Back live: the banner first out of the gate, the carriers last, the chest set down, villagers cheering.
  const { returnAt, now } = await timing(page);
  await step(page, Math.max(0, returnAt - now - 1000));
  await until(page, 'in', 10);
  await step(page, 3000);
  await shot('3-return');
  await until(page, 'halt', 20);
  await step(page, STEP_MS);
  await shot('4-halt');
  const home = await until(page, 'home', 20);
  expect(home.agents.cossack).toBe(loaded.agents.cossack);
}

test.describe('M3-14 the raid squad on the scene', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');
  test.describe.configure({ timeout: 300_000 });

  test('a squad leaves, is away and comes back with its chest (13:00) @raid', async ({ page }) => {
    await round(page, '13:00', false);
  });

  for (const time of ['13:00', '23:00'] as const) {
    test(`review shots: loaded, leave, road, return, halt (${time}) @raid @screens`, async ({ page }) => {
      await round(page, time, true);
    });
  }
});
