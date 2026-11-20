// Bottom sheet (plan M2-13, SPEC §6.1/§3.3): a drag on the bar moves between collapsed / half / full; a tap on a
// building opens half with its row marked and earns nothing; a tap on open ground still earns.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { gotoReady, readStats } from '../helpers/world.ts';

const today = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const DIR = join('reports', 'screens', today());
const MAX_DRAW_CALLS = 30;

/** A device-px shot for the UI review, draw calls within budget. */
async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const file = `sheet-${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(DIR, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  expect((await readStats(page)).drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
}

const toggle = (page: Page) => page.getByRole('button', { name: /панель/i });
const sheetState = (page: Page) => page.locator('section[data-state]');

/**
 * The sheet in `state` at its resting height: the snap tween is finished at once (a screenshot can stall a running CSS
 * transition in headless Chromium; its length is not what these tests measure).
 */
async function settled(page: Page, state: string): Promise<void> {
  await expect(sheetState(page)).toHaveAttribute('data-state', state);
  await page.evaluate(() => {
    for (const a of document.querySelector('section[data-state]')?.getAnimations() ?? []) a.finish();
  });
}

/** A drag on the bar from the middle of the «Січ» tab by `dy` css px, one move per animation frame. */
async function drag(page: Page, dy: number): Promise<void> {
  const box = await page.getByRole('tab', { name: 'Січ' }).boundingBox();
  if (!box) throw new Error('no tab bar');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // A few frames: each is slow under SwiftShader at 3.5 DPR, and the end state does not depend on the speed.
  const frames = 6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= frames; i += 1) {
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.mouse.move(x, y + (dy * i) / frames);
  }
  await page.mouse.up();
}

/** The first client point (and its building) where the world draws a building, in the part of the screen left free. */
async function findBuilding(page: Page): Promise<{ x: number; y: number; building: string }> {
  const pt = await page.evaluate(() => {
    const top = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const bottom = document.querySelector('section[data-state]')?.getBoundingClientRect().top ?? innerHeight;
    for (let y = Math.ceil(top) + 2; y < bottom - 2; y += 3)
      for (let x = 2; x < innerWidth - 2; x += 3) {
        const building = window.__CK__?.plotAt(x, y);
        if (building) return { x, y, building };
      }
    return null;
  });
  if (!pt) throw new Error('no building on screen');
  return pt;
}

test.describe('M2-13 bottom sheet', () => {
  // Fling speeds depend on headless frame rates; the flick rule itself is unit-tested (snapSheet). Each drag here ends
  // in the same state whether it reads as a flick or as a slow drag.
  test('drag on the bar: half → full → half → collapsed; the drag never picks a tab', async ({ page }) => {
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=mid&ui=1');
    await settled(page, 'half');
    await drag(page, -400);
    await settled(page, 'full');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('tab', { name: 'Хутір' })).toHaveAttribute('aria-selected', 'true');
    await drag(page, 450);
    await settled(page, 'half');
    await drag(page, 200);
    await settled(page, 'collapsed');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('tabpanel')).toBeHidden();
    // Collapsed = the tab bar only.
    const box = await sheetState(page).boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(60);
    await toggle(page).click();
    await settled(page, 'half');
  });

  test('tap on a building opens half with its row marked and earns nothing; open ground earns', async ({ page }) => {
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=mid&ui=1');
    await toggle(page).click(); // full
    await toggle(page).click(); // collapsed
    await settled(page, 'collapsed');
    const ducats = page.locator('header p').first();
    const before = await ducats.textContent();
    const hit = await findBuilding(page);
    await page.touchscreen.tap(hit.x, hit.y);
    const row = page.locator(`li[data-building="${hit.building}"]`);
    await expect(row).toHaveAttribute('aria-current', 'true');
    await settled(page, 'half');
    await expect(row).toBeInViewport();
    await expect(ducats).toHaveText(before ?? '');
    // A double tap on the building keeps the camera (no centring).
    const cam = await page.evaluate(() => window.__CK__?.stats.cam);
    await page.touchscreen.tap(hit.x, hit.y);
    await page.touchscreen.tap(hit.x, hit.y);
    // Past 2 × doubleTapMs + a glide: a scheduled centring would have moved the camera by now.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
    expect(await page.evaluate(() => window.__CK__?.stats.cam)).toBe(cam);
    await expect(ducats).toHaveText(before ?? '');
    // The sky earns (SPEC §3.3).
    await page.touchscreen.tap(200, 160);
    await expect(ducats).not.toHaveText(before ?? '');
  });
});

test.describe('M2-13 bottom sheet @screens', () => {
  test('3 states + a tapped building (13:00, mid)', async ({ page }, testInfo) => {
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=mid&ui=1');
    await page.evaluate(() => document.fonts.ready);
    await settled(page, 'half');
    await shoot(page, testInfo, 'half-1300');
    await toggle(page).click();
    await settled(page, 'full');
    await shoot(page, testInfo, 'full-1300');
    await toggle(page).click();
    await settled(page, 'collapsed');
    await shoot(page, testInfo, 'collapsed-1300');
    const hit = await findBuilding(page);
    await page.touchscreen.tap(hit.x, hit.y);
    await expect(page.locator(`li[data-building="${hit.building}"]`)).toHaveAttribute('aria-current', 'true');
    await settled(page, 'half');
    await shoot(page, testInfo, 'tapped-1300');
  });

  // M2-12 follow-up: the big scaffold on the potter's khata (low on the farm) with the sheet collapsed.
  test('big scaffold with the sheet collapsed (13:00)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== '390x844@3', 'one phone is enough');
    await page.clock.install({ time: new Date('2026-06-01T10:00:00Z').getTime() });
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=rich&ui=1&cam=140');
    await page.clock.pauseAt(new Date('2026-06-01T10:01:00Z').getTime());
    await page.getByRole('button', { name: /Хата гончаря/ }).click();
    await toggle(page).click(); // full
    await toggle(page).click(); // collapsed
    await page.clock.runFor(700);
    await expect(sheetState(page)).toHaveAttribute('data-state', 'collapsed');
    await shoot(page, testInfo, 'collapsed-scaffold-1300');
  });
});
