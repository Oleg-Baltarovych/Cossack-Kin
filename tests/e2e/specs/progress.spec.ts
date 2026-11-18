// Progress across reloads (plan M1-20, SPEC §12.2: «перезавантаження → вікно повернення з правильною сумою»). The page
// clock is fixed with Playwright's `clock.setFixedTime` (Date.now stands still, timers and frames run), so the
// numbers are exact; the save the page will load is read from
// localStorage and decoded in Node with the same core.
import { expect, test, type Page } from '@playwright/test';
import { chooseSave } from '../../../src/core/save/load.ts';
import { resume } from '../../../src/core/offline.ts';
import { validateState, type GameState } from '../../../src/core/state.ts';
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { waitReady } from '../helpers/world.ts';

const URL = '/?time=13:00&seed=5&ui=1';
const T0 = new Date('2026-06-01T09:00:00Z').getTime();
const HOUR = 3600_000;

async function gameState(page: Page): Promise<GameState> {
  const r = validateState(JSON.parse(await page.evaluate(() => window.__CK_GAME__?.state() ?? 'null')));
  if (!r.ok) throw new Error(`page state invalid: ${r.error.reason} at ${r.error.path}`);
  return r.state;
}

/** The save the page would load now (both slots through the core's own choice). */
async function savedState(page: Page): Promise<GameState> {
  const [a, b] = await page.evaluate(() => [localStorage.getItem('ck.save_a'), localStorage.getItem('ck.save_b')]);
  const choice = chooseSave(a ?? null, b ?? null);
  if (choice.kind !== 'loaded') throw new Error(`no loadable save: ${choice.kind}`);
  return choice.state;
}

async function hide(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('M1-20 progress across reloads', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('buy → reload: the same levels and the same ducats (clock fixed)', async ({ page }) => {
    await page.clock.setFixedTime(T0);
    await page.goto(URL);
    await waitReady(page);
    await page.getByRole('button', { name: /Пшеничне поле/ }).click();
    const before = await gameState(page);
    expect(before.village.levels.field).toBe(1);

    await page.reload();
    await waitReady(page);
    const after = await gameState(page);
    expect(after.village.levels).toEqual(before.village.levels);
    expect(after.currencies.ducats.eq(before.currencies.ducats)).toBe(true);
    expect(after.time.lastSeen).toBe(before.time.lastSeen);
  });

  test('3 hours later (fake clock): the return window shows what the core computes for the saved game', async ({
    page,
  }) => {
    await page.clock.setFixedTime(T0);
    await page.goto(URL);
    await waitReady(page);
    await page.getByRole('button', { name: /Пшеничне поле/ }).click();
    // Hiding the page saves it (lifecycle onPause): that save is what the reload loads.
    await hide(page);
    const saved = await savedState(page);
    expect(saved.village.levels.field).toBe(1);

    const back = saved.time.lastSeen + 3 * HOUR;
    await page.clock.setFixedTime(back);
    await page.reload();
    await waitReady(page);
    const dialog = page.getByRole('dialog', { name: 'З поверненням!' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Час відсутності: 3 години');

    const expected = resume(saved, back).state.returnReport;
    const shown = (await gameState(page)).returnReport;
    if (!expected || !shown) throw new Error('no return report');
    expect(shown.awaySec).toBe(expected.awaySec);
    expect(shown.countedSec).toBe(expected.countedSec);
    expect(shown.ducats.eq(expected.ducats)).toBe(true);
    expect(shown.glory.eq(expected.glory)).toBe(true);
  });
});
