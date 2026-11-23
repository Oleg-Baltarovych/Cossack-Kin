// Construction and tier juice (plan M2-12, SPEC §6.5/§6.7, Q5): buying a building's first level puts the level in the
// state at once while the world plays scaffold stages → pop → confetti; a milestone shows the «Тір II» banner, the
// flash and the rising standard. «Менше руху» keeps the information (the stages, the banner text) and drops the pop and
// the confetti. Time is Playwright's fake clock (paused, `runFor`; frames are native, `nativeFrames`), so every shot is
// of an exact moment; each stage is written to reports/screens/<date>/build-*.png (day and night) for the art review.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { validateState, type GameState } from '../../../src/core/state.ts';
import { BUILD } from '../../../src/render/atmosphere/config.ts';
import { split } from '../../../src/render/camera.ts';
import { SCAFFOLD_MS } from '../../../src/render/fx/construction.ts';
import { PARTICLE_BUDGET } from '../../../src/render/fx/registry.ts';
import { decodePng } from '../../../tools/lib/png.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { SPEC_MAX_DRAW_CALLS } from '../helpers/budgets.ts';
import { assertNativeFrames, gotoReady, nativeFrames, readStats } from '../helpers/world.ts';
// Type-only: the window.__CK_GAME__ declaration.
import type {} from '../../../src/ui/debug/gameDebug.ts';

const T0 = new Date('2026-06-01T10:00:00Z').getTime();
const FRAME_MS = 16;
/** ≥ 3 frames: Pixi's ticker (maxFPS 60) may skip one rAF (camera.spec.ts). */
const SETTLE_MS = 3 * FRAME_MS;
/** The field (x 450) and the apiary (660) on the farm's second screen. */
const CAM = 330;
/** The Sich zone's left edge (its camera anchor): the kurins (local x 92) and the gate (198) in view. */
const SICH_CAM = KHORTYTSIA_WORLD.zones.find((z) => z.id === 'sich')?.anchorX ?? 0;

const today = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const DIR = join('reports', 'screens', today());

async function gameState(page: Page): Promise<GameState> {
  const r = validateState(JSON.parse(await page.evaluate(() => window.__CK_GAME__?.state() ?? 'null')));
  if (!r.ok) throw new Error(`page state invalid: ${r.error.reason} at ${r.error.path}`);
  return r.state;
}

async function openPaused(page: Page, url: string): Promise<void> {
  await page.clock.install({ time: T0 });
  // `runFor(2400)` would fire 150 fake 16-ms frames at once, each a full WebGL frame: the next screenshot waited out
  // that backlog on CI SwiftShader (≈ 0.4 s a frame, 64 s for one shot). One native frame draws the moment instead.
  await nativeFrames(page);
  await gotoReady(page, url);
  await assertNativeFrames(page);
  await page.clock.pauseAt(T0 + 60_000);
  await advance(page, SETTLE_MS);
}

/**
 * Runs the paused clock for `ms`, then waits for one native frame: the world is drawn at the new moment. With native
 * frames nothing is drawn while the clock stands, so the frame after a buy's first `advance` is where its build starts
 * (`BuildFx` anchors the stages at the first frame that presents it): the offsets below count from there.
 */
async function advance(page: Page, ms: number): Promise<void> {
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

/** The world between the HUD and the panel (device px rows). */
async function worldRows(page: Page, testInfo: TestInfo): Promise<{ y0: number; y1: number; x1: number }> {
  const hud = await page.locator('header').boundingBox();
  const panel = await page.locator('section').first().boundingBox();
  const { viewport, deviceScaleFactor: dpr = 1 } = testInfo.project.use;
  if (!hud || !panel || !viewport) throw new Error('no HUD, panel or viewport');
  return {
    y0: Math.ceil((hud.y + hud.height) * dpr) + 1,
    y1: Math.floor(panel.y * dpr) - 1,
    x1: Math.floor(viewport.width * dpr),
  };
}

/** A device-px shot of the page (written for the art review), its stats within budget. */
async function shot(page: Page, testInfo: TestInfo, name: string): Promise<Buffer> {
  mkdirSync(DIR, { recursive: true });
  const file = `build-${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(DIR, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  const stats = await readStats(page);
  expect(stats.drawCalls, `${name}: draw calls`).toBeLessThanOrEqual(SPEC_MAX_DRAW_CALLS);
  expect(stats.particles, `${name}: particles`).toBeLessThanOrEqual(PARTICLE_BUDGET);
  return png;
}

/** The world region of a shot (between HUD and panel) as one buffer, for frame-to-frame comparisons. */
function region(png: Buffer, rows: { y0: number; y1: number }): Buffer {
  const img = decodePng(png);
  const stride = img.width * 4;
  return Buffer.from(img.data.subarray(rows.y0 * stride, rows.y1 * stride));
}

/** The «тір II» banner: the live region with an explicit aria-live (the quest strip's claim read-out, M2-25, is another status). */
const tierBanner = (page: Page) => page.getByRole('status').and(page.locator('[aria-live="polite"]'));

test.describe('M2-12 construction and tiers', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');
  // 4–6 full-page device-scale screenshots per test; CI SwiftShader takes ~15 s per shot.
  test.describe.configure({ timeout: 180_000 });

  for (const time of ['13:00', '23:00'] as const) {
    test(`first level: in the state at once; scaffold 3 stages → pop → confetti (${time})`, async ({
      page,
    }, testInfo) => {
      const key = time.replace(':', '');
      await openPaused(page, `/?seed=1&freeze&time=${time}&cam=${String(CAM)}&ui=1&state=rich`);
      const rows = await worldRows(page, testInfo);
      const empty = region(await shot(page, testInfo, `${key}-0-empty`), rows);
      const { particles: idle, scale } = await readStats(page);

      await page.getByRole('button', { name: /Пшеничне поле/ }).click();
      // The economy never waits for the animation.
      expect((await gameState(page)).village.levels.field).toBe(1);

      await advance(page, SETTLE_MS); // the build starts at this frame
      const frames: Buffer[] = [];
      let at = 0;
      const step = async (ms: number, name: string): Promise<Buffer> => {
        await advance(page, ms - at);
        at = ms;
        const png = await shot(page, testInfo, `${key}-${name}`);
        frames.push(region(png, rows));
        return png;
      };
      await step(40, '1-stage0');
      await step(BUILD.stageMs + 40, '2-stage1');
      await step(2 * BUILD.stageMs + 40, '3-stage2');
      const pop = await step(SCAFFOLD_MS + Math.round(BUILD.popMs / 2), '4-pop');
      // Q5: the pop scales in the low-res target — whole scale×scale blocks, the grid holds.
      const report = checkPixelGrid(decodePng(pop), { scale, fracDevicePx: split(CAM, scale).fracDevicePx, ...rows });
      expect(report.violations, `${String(report.violationCount)} px break the grid in the pop`).toEqual([]);
      expect((await readStats(page)).particles).toBeGreaterThan(idle); // the confetti is flying
      await step(SCAFFOLD_MS + 400, '5-confetti');
      await step(SCAFFOLD_MS + BUILD.confettiMs + SETTLE_MS, '6-built');
      // The builders knocked once per scaffold stage (M2-18: the hook the audio will play, M7).
      expect((await readStats(page)).knocks).toBe(3);

      // Every stage shows something new: nothing, three scaffolds, the popping building, confetti, the field.
      for (let i = 0; i < frames.length; i++) {
        expect(frames[i]?.equals(empty), `frame ${String(i)} differs from the empty plot`).toBe(false);
        for (let j = i + 1; j < frames.length; j++)
          expect(frames[i]?.equals(frames[j] ?? Buffer.alloc(0)), `frames ${String(i)}/${String(j)}`).toBe(false);
      }
      expect((await readStats(page)).particles).toBe(idle);
    });
  }

  for (const time of ['13:00', '23:00'] as const) {
    test(`a milestone: banner «тір II», flash, rising standard (${time})`, async ({ page }, testInfo) => {
      const key = time.replace(':', '');
      await openPaused(page, `/?seed=1&freeze&time=${time}&cam=${String(CAM)}&ui=1&state=rich`);
      await page.getByRole('button', { name: /Пшеничне поле/ }).click();
      await advance(page, SETTLE_MS); // the build starts
      await advance(page, SCAFFOLD_MS + BUILD.confettiMs + SETTLE_MS);

      await page.getByRole('button', { name: '×10' }).click();
      await page.getByRole('button', { name: /Пшеничне поле/ }).click();
      expect((await gameState(page)).village.levels.field).toBe(11);
      const banner = tierBanner(page);
      await expect(banner).toHaveText('Пшеничне поле — тір II');
      await expect(banner).toHaveAttribute('aria-live', 'polite');
      // The banner never takes taps: a tap through it reaches the world.
      expect(await banner.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

      await advance(page, SETTLE_MS + 20);
      await shot(page, testInfo, `${key}-tier-1-flash`);
      await advance(page, 250);
      await shot(page, testInfo, `${key}-tier-2-rising`);
      await advance(page, 700);
      await shot(page, testInfo, `${key}-tier-3-raised`);
      await advance(page, BUILD.celebrationMs);
      await expect(banner).toHaveText('');
    });
  }

  for (const time of ['13:00', '23:00'] as const) {
    test(`a Sich building goes up under scaffolding too (M2-12 tail, ${time})`, async ({ page }, testInfo) => {
      const key = time.replace(':', '');
      // The camera at the Sich anchor (its left edge): the «Січ» tab then glides nowhere.
      await openPaused(page, `/?seed=1&freeze&time=${time}&cam=${String(SICH_CAM)}&ui=1&state=rich`);
      await page.getByRole('tab', { name: 'Січ' }).click();
      await advance(page, SETTLE_MS);
      const rows = await worldRows(page, testInfo);
      for (const [name, label] of [
        ['kurins', /«Курені»/],
        ['walls', /«Вали, частокіл і брама»/],
      ] as const) {
        const empty = region(await shot(page, testInfo, `sich-${key}-${name}-0-empty`), rows);
        await page.getByRole('button', { name: label }).click();
        expect((await gameState(page)).village.sichLevels[name]).toBe(1);
        await advance(page, SETTLE_MS); // the build starts
        await advance(page, 40);
        const stage0 = region(await shot(page, testInfo, `sich-${key}-${name}-1-stage0`), rows);
        await advance(page, 2 * BUILD.stageMs);
        const stage2 = region(await shot(page, testInfo, `sich-${key}-${name}-2-stage2`), rows);
        await advance(page, SCAFFOLD_MS + BUILD.confettiMs);
        const built = region(await shot(page, testInfo, `sich-${key}-${name}-3-built`), rows);
        expect(stage0.equals(empty), 'the scaffold stands on the empty plot').toBe(false);
        expect(stage2.equals(stage0), 'the scaffold grows').toBe(false);
        expect(built.equals(stage2), 'the building stands').toBe(false);
      }
      expect((await readStats(page)).knocks).toBe(6);
    });
  }

  test('«менше руху»: the stages and the banner stay, no pop and no confetti', async ({ page }, testInfo) => {
    await openPaused(page, `/?seed=1&freeze&time=13:00&cam=${String(CAM)}&ui=1&state=rich&still`);
    const rows = await worldRows(page, testInfo);
    const { particles: idle } = await readStats(page);
    const before = region(await shot(page, testInfo, 'still-0-empty'), rows);

    await page.getByRole('button', { name: /Пшеничне поле/ }).click();
    expect((await gameState(page)).village.levels.field).toBe(1);
    await advance(page, SETTLE_MS); // the build starts
    await advance(page, 40);
    const stage = region(await shot(page, testInfo, 'still-1-stage0'), rows);
    expect(stage.equals(before)).toBe(false); // the scaffold is information: it stays
    expect((await readStats(page)).particles).toBe(idle); // no dust

    await advance(page, SCAFFOLD_MS - 40 + Math.round(BUILD.popMs / 2));
    const popTime = region(await shot(page, testInfo, 'still-2-pop-time'), rows);
    expect((await readStats(page)).particles).toBe(idle); // no confetti
    await advance(page, BUILD.confettiMs + SETTLE_MS);
    const built = region(await shot(page, testInfo, 'still-3-built'), rows);
    expect(popTime.equals(built), 'no squash: the building stands at its size from the reveal').toBe(true);

    await page.getByRole('button', { name: '×10' }).click();
    await page.getByRole('button', { name: /Пшеничне поле/ }).click();
    await expect(tierBanner(page)).toHaveText('Пшеничне поле — тір II');
  });
});
