// Saves in the real page (plan M1-13; M1-20 adds the v1 fixture and the fake-clock reload): progress survives a
// reload, a damaged save is explained. No debug preset here — presets play in memory — so the page loads the save.
import { expect, test, type Page } from '@playwright/test';
import { validateState, type GameState } from '../../../src/core/state.ts';
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { closeWelcome } from '../helpers/story.ts';
import { waitReady } from '../helpers/world.ts';

const URL = '/?time=13:00&seed=3&ui=1';

async function gameState(page: Page): Promise<GameState> {
  const r = validateState(JSON.parse(await page.evaluate(() => window.__CK_GAME__?.state() ?? 'null')));
  if (!r.ok) throw new Error(`page state invalid: ${r.error.reason} at ${r.error.path}`);
  return r.state;
}

test.describe('M1-13 saves', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('a purchase survives a reload (pagehide saves), with the same seed and levels', async ({ page }) => {
    await page.goto(URL);
    await waitReady(page);
    // A new game: its welcome beat first (M2-25).
    await closeWelcome(page);
    await page.getByRole('button', { name: /Пшеничне поле/ }).click();
    const before = await gameState(page);
    expect(before.village.levels.field).toBe(1);

    await page.reload();
    await waitReady(page);
    const after = await gameState(page);
    expect(after.seed).toBe(before.seed);
    expect(after.village.levels.field).toBe(1);
    expect(after.stats.purchases).toBe(1);
    // The fields kept earning between the save and the check: never less than what was saved.
    expect(after.currencies.ducats.gte(before.currencies.ducats)).toBe(true);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('both slots damaged → a new game and the «Збереження пошкоджене» notice', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('ck.save_a', '{"version":1,');
      localStorage.setItem('ck.save_b', 'garbage');
    });
    await page.goto(URL);
    await waitReady(page);
    const notice = page.getByRole('alertdialog', { name: 'Збереження пошкоджене' });
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Зрозуміло' }).click();
    await expect(notice).toBeHidden();
    expect((await gameState(page)).village.levels.field).toBe(0);
  });
});
