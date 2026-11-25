// The return window (plan M1-18, SPEC §3.8, §12.3): a hidden tab is an absence; coming back shows what the core
// counted for exactly that absence. The clock is Playwright's fake clock; visibility is switched by the test (a
// headless page cannot be hidden for real), and the game state is read through the dev/test `window.__CK_GAME__`.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { OFFLINE } from '../../../src/content/economy.ts';
import { applyOffline } from '../../../src/core/offline.ts';
import { validateState, type GameState } from '../../../src/core/state.ts';
// Type-only: brings the window.__CK_GAME__ declaration (the locale JSON cannot load in Node, so no i18n import here).
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { gotoReady } from '../helpers/world.ts';

/** 2026-06-01 10:00 UTC. */
const T0 = new Date('2026-06-01T10:00:00Z');

async function setVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function gameState(page: Page): Promise<GameState> {
  const json = await page.evaluate(() => window.__CK_GAME__?.state() ?? 'null');
  const r = validateState(JSON.parse(json));
  if (!r.ok) throw new Error(`state from the page failed validateState: ${r.error.reason} at ${r.error.path}`);
  return r.state;
}

test.describe('M1-18 return window', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('the tab hidden for 2 minutes → the window shows what the core counts for that absence', async ({ page }) => {
    await page.clock.install({ time: T0 });
    await gotoReady(page, '/?seed=1&state=mid&ui=1&time=13:00');
    await setVisibility(page, 'hidden');
    const left = await gameState(page);

    // Stop the clock exactly 2 min after the tab hid: the return tick and every later one read the same `now`.
    const backAt = left.time.lastSeen + 2 * 60_000;
    await page.clock.pauseAt(backAt);
    await setVisibility(page, 'visible');

    const dialog = page.getByRole('dialog', { name: 'З поверненням!' });
    await expect(dialog).toBeVisible();
    const back = await gameState(page);
    expect(back.time.lastSeen).toBe(backAt);
    const expected = applyOffline(left, backAt).state.returnReport;
    if (!expected) throw new Error('core made no return report for a 2-minute absence');
    expect(back.returnReport?.awaySec).toBe(expected.awaySec);
    expect(back.returnReport?.ducats.eq(expected.ducats)).toBe(true);
    // The text format of the window is pinned by tests/unit/ui/return.test.tsx; here: the same absence, the same sum.
    expect(expected.awaySec).toBe(120);
    await expect(dialog).toContainText('Час відсутності: 2 хвилини');

    await dialog.getByRole('button', { name: 'Забрати' }).click();
    await expect(dialog).toBeHidden();
    const claimed = await gameState(page);
    expect(claimed.returnReport).toBeNull();
    // The clock is paused at backAt: nothing else accrues, so the purse is exactly what was left plus the report.
    const want = left.currencies.ducats.add(expected.ducats);
    expect(claimed.currencies.ducats.sub(want).toNumber() / want.toNumber()).toBeCloseTo(0, 9);
  });

  test(`hidden for less than ${String(OFFLINE.returnMinSec)} s → no window, the income is simply there`, async ({
    page,
  }) => {
    await page.clock.install({ time: T0 });
    await gotoReady(page, '/?seed=1&state=mid&ui=1&time=13:00');
    await setVisibility(page, 'hidden');
    const left = await gameState(page);
    await page.clock.fastForward((OFFLINE.returnMinSec - 20) * 1000);
    await setVisibility(page, 'visible');
    const back = await gameState(page);
    expect(back.returnReport).toBeNull();
    expect(back.currencies.ducats.gt(left.currencies.ducats)).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('M1-18 return window @screens', () => {
  for (const lang of ['uk', 'en'] as const) {
    test(`away 9 h (over the limit), ${lang}`, async ({ page }, testInfo) => {
      await gotoReady(page, `/?seed=1&state=away&freeze&ui=1&time=13:00&lang=${lang}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('dialog')).toContainText(lang === 'uk' ? 'ліміт досягнуто' : 'the limit was reached');
      const dir = join('reports', 'screens', new Date().toISOString().slice(0, 10));
      mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: join(dir, `ui-return-away-${lang}-${testInfo.project.name}.png`),
        scale: 'device',
      });
    });
  }
});
