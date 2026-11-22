// UI juice on the phone (plan M2-26, SPEC §6.7): a pressed button sits exactly BUTTON.pressPx logical px lower; claim
// coins fly a curve on the logical pixel grid and are gone after their flight; «менше руху» sends none and the HUD
// still says the new amount. One review shot (390 only): coins mid-flight on a paused clock →
// reports/screens/<date>/m2-26-coins-<project>.png.
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { BUTTON, COIN_FLIGHT } from '../../../src/content/juice.ts';
import type { Action } from '../../../src/core/actions.ts';
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady } from '../helpers/world.ts';

const URL = '/?time=13:00&freeze&seed=1&state=mid&ui=1';

async function dispatch(page: Page, action: Action): Promise<readonly string[]> {
  return page.evaluate((a) => window.__CK_GAME__?.dispatch(a) ?? [], action);
}

/** The mid farm's chain step («hire a Cossack») done, so the strip shows «Забрати». */
async function chainStepDone(page: Page): Promise<void> {
  for (let i = 0; i < 5 && !(await dispatch(page, { type: 'hire', n: 1 })).includes('CossackHired'); i++)
    await dispatch(page, { type: 'buyBuilding', id: 'field', mode: 10 });
  await expect(claimButton(page)).toBeVisible();
}

const claimButton = (page: Page) =>
  page.getByRole('region', { name: 'Завдання' }).getByRole('button', { name: /^Забрати/ });

/** Every coin's position in logical px from its transform, and whether it is in the air. */
const coins = (page: Page) =>
  page.evaluate(() => {
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px'));
    return [...document.querySelectorAll<HTMLElement>('[data-coin]')].map((el) => {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
      return { flying: el.dataset['flying'] !== undefined, x: Number(m?.[1]) / px, y: Number(m?.[2]) / px };
    });
  });

/** Claims the chain step on a paused clock and stops half-way through the coins' flight. */
async function claimMidFlight(page: Page): Promise<void> {
  await gotoReady(page, URL);
  await chainStepDone(page);
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  await claimButton(page).click();
  expect((await coins(page)).length).toBeGreaterThan(0);
  await page.clock.runFor(COIN_FLIGHT.flightMs / 2);
}

test.describe('M2-26 juice', () => {
  test('a pressed buy button sits BUTTON.pressPx logical px lower, and comes back', async ({ page }) => {
    await gotoReady(page, URL);
    const button = page.locator('[role="tabpanel"] li[data-building] button:not([disabled])').first();
    await expect(button).toBeVisible();
    const px = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')),
    );
    const up = await button.boundingBox();
    if (!up) throw new Error('no button');
    await page.mouse.move(up.x + up.width / 2, up.y + up.height / 2);
    await page.mouse.down();
    const down = await button.boundingBox();
    // Released off the button: no purchase.
    await page.mouse.move(2, 2);
    await page.mouse.up();
    expect(((down?.y ?? 0) - up.y) / px).toBeCloseTo(BUTTON.pressPx, 3);
    expect((await button.boundingBox())?.y).toBeCloseTo(up.y, 3);
  });

  test('claim coins fly a curve on the logical grid to the counter, then are gone', async ({ page }) => {
    await claimMidFlight(page);
    const mid = await coins(page);
    const inAir = mid.filter((c) => c.flying);
    expect(inAir.length).toBeGreaterThan(1);
    for (const c of inAir) {
      expect(Math.abs(c.x - Math.round(c.x))).toBeLessThan(1e-3);
      expect(Math.abs(c.y - Math.round(c.y))).toBeLessThan(1e-3);
    }
    // Fanned out: the coins in the air are not on one line.
    expect(new Set(inAir.map((c) => c.x)).size).toBeGreaterThan(1);
    // Each coin is the 16-logical-px UI icon (whole device px).
    const icon = await page.evaluate(() => {
      const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px'));
      const r = document.querySelector('[data-coin] [data-icon]')?.getBoundingClientRect();
      return { w: (r?.width ?? 0) / px, h: (r?.height ?? 0) / px };
    });
    expect(icon.w).toBeCloseTo(16, 1);
    expect(icon.h).toBeCloseTo(16, 1);
    await page.clock.runFor(COIN_FLIGHT.flightMs + COIN_FLIGHT.staggerMs * 10);
    await expect(page.locator('[data-coin]')).toHaveCount(0);
  });

  test('«менше руху»: no coins, the HUD says the new amount at once', async ({ page }) => {
    await gotoReady(page, `${URL}&still`);
    await chainStepDone(page);
    await claimButton(page).click();
    await expect(page.locator('[data-coin]')).toHaveCount(0);
    // A big purchase moves the ducats visibly; in the same task, before any frame, the number on screen already
    // says the exact amount (a roll would still show the old one for COUNTER.lerpMs).
    const read = () =>
      page.evaluate(() => ({
        shown: document.querySelector('header [data-counter="ducats"]')?.textContent,
        exact: document.querySelector('header [data-counter="ducats"] + span')?.textContent,
      }));
    const before = await read();
    const after = await page.evaluate(async () => {
      window.__CK_GAME__?.dispatch({ type: 'buyBuilding', id: 'field', mode: 10 });
      // React commits a store update in a microtask; an animation frame would come much later.
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      return {
        shown: document.querySelector('header [data-counter="ducats"]')?.textContent,
        exact: document.querySelector('header [data-counter="ducats"] + span')?.textContent,
      };
    });
    expect(after.exact).not.toBe(before.exact);
    expect(after.shown).toBe(after.exact);
  });
});

test.describe('M2-26 juice @screens', () => {
  test('coins mid-flight from the strip to the ducats (390 only)', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('390x844'), 'one review shot on 390');
    await claimMidFlight(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(screensDir(), `m2-26-coins-${testInfo.project.name}.png`) });
  });
});
