// A tap on the quest strip leads to its target (plan M3-15, SPEC §10.3, SPEC-REVIEW R-M2-25): a farm step opens
// «Хутір» at half with the building's row lit and current, and the camera goes to the building from the Sich.
// Review shots (not baselines, @screens) → reports/screens/<date>/m3-15-{farm-day,farm-night,hire}-<project>.png.
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import type { Action } from '../../../src/core/actions.ts';
import { QUEST_CHAIN } from '../../../src/content/quests.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { encodeSave } from '../../../src/core/save/serialize.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady, waitReady } from '../helpers/world.ts';

const T0 = new Date('2026-06-01T10:00:00Z').getTime();

// A running fake clock (not `setFixedTime`: the saves below are made at T0 and the game's clock and highlight timers
// must keep advancing); the `test` fixture keeps the frames native and GPU-paced under it (helpers/test.ts).
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: T0 });
});

const url = (time: string, extra = '') => `/?time=${time}&freeze&seed=1&state=rich&ui=1&lang=uk&zone=sich${extra}`;

async function dispatch(page: Page, action: Action): Promise<readonly string[]> {
  return page.evaluate((a) => window.__CK_GAME__?.dispatch(a) ?? [], action);
}

const strip = (page: Page) => page.getByRole('region', { name: 'Завдання' });
const goButton = (page: Page) => strip(page).getByRole('button', { name: /показати ціль$/ });
const fieldRow = (page: Page) => page.locator('li[data-building="field"]');
const buildingAt = (page: Page, b: 'field') => page.evaluate((id) => window.__CK__?.buildingAt(id) ?? null, b);
const cam = (page: Page) => page.evaluate(() => window.__CK__?.stats.cam ?? Number.NaN);

/** The camera at rest (two reads one frame apart agree). */
async function camSettled(page: Page): Promise<number> {
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const now = await cam(page);
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
  return last;
}

/** The rich farm with its field bought (drawn), so the chain's first step «Засій поле» is on the strip. */
async function fieldStep(page: Page, time: string, extra = ''): Promise<void> {
  await gotoReady(page, url(time, extra));
  expect(await dispatch(page, { type: 'buyBuilding', id: 'field', mode: 10 })).toContain('BuildingUpgraded');
  await expect(goButton(page)).toBeVisible();
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(screensDir(), `m3-15-${name}-${test.info().project.name}.png`) });
}

test.describe('M3-15 the quest strip leads to its target', () => {
  test('a farm step: «Хутір» at half, the field row lit and current, the camera at the field', async ({ page }) => {
    await fieldStep(page, '13:00');
    await camSettled(page);
    // The camera starts at the Sich: the field is off screen.
    expect(await buildingAt(page, 'field')).toBeNull();
    await page.getByRole('button', { name: 'Розгорнути панель на весь екран' }).click();
    await goButton(page).click();
    await expect(page.getByRole('tab', { name: 'Хутір' })).toHaveAttribute('aria-selected', 'true');
    // Exactly half again (the bar button offers «full» only from half).
    await expect(page.getByRole('button', { name: 'Розгорнути панель на весь екран' })).toBeVisible();
    await expect(fieldRow(page)).toHaveAttribute('aria-current', 'true');
    await expect(fieldRow(page)).toHaveClass(/lit/);
    // The camera glides to the field and centres it (clamped to the world).
    const site = KHORTYTSIA_WORLD.tierSprites.find((t) => t.building === 'field');
    if (!site) throw new Error('no field site');
    await expect.poll(() => buildingAt(page, 'field')).not.toBeNull();
    const x = await camSettled(page);
    const w = await page.evaluate(() => window.__CK__?.stats.logicalW ?? 0);
    expect(x).toBeLessThanOrEqual(site.x);
    expect(x + w).toBeGreaterThanOrEqual(site.x);
    expect(await buildingAt(page, 'field')).not.toBeNull();
    await expect(page.getByRole('status').filter({ hasText: 'Ціль — на вкладці «Хутір»' })).toBeAttached();
  });

  test('«менше руху»: the camera jumps to the field at once', async ({ page }) => {
    await fieldStep(page, '13:00', '&still');
    const before = await camSettled(page);
    await goButton(page).click();
    await expect(fieldRow(page)).toHaveAttribute('aria-current', 'true');
    // No glide: the next frame already shows the field.
    await expect.poll(() => buildingAt(page, 'field')).not.toBeNull();
    expect(await cam(page)).not.toBe(before);
  });
});

/** The chain on «Найми козака» (field and garden steps done and claimed): its target is the hire row on «Січ». */
async function hireStep(page: Page, extra = ''): Promise<void> {
  await fieldStep(page, '13:00', extra);
  await dispatch(page, { type: 'claimQuest', kind: 'chain' });
  await dispatch(page, { type: 'buyBuilding', id: 'garden', mode: 1 });
  await dispatch(page, { type: 'claimQuest', kind: 'chain' });
  await expect(strip(page)).toContainText('Найми козака');
}

/**
 * A save on chain step `id` (no debug preset: the page loads it; the welcome beat seen), the game clock live. Presets
 * cannot reach a late step through actions in a few calls.
 */
async function onChainStep(page: Page, id: string, time: string): Promise<void> {
  const s0 = createInitialState({ seed: 1, now: T0 });
  const index = QUEST_CHAIN.findIndex((q) => q.id === id);
  const state: GameState = {
    ...s0,
    story: { seen: ['khortytsia.shore'] },
    quests: { ...s0.quests, chain: { kind: 'listed', index, base: 0 } },
  };
  await page.addInitScript((text) => {
    localStorage.setItem('ck.save_a', text);
  }, encodeSave(state));
  await page.goto(`/?time=${time}&seed=1&ui=1&lang=uk`);
  await waitReady(page);
}

test('M3-15 from the full sheet: a row low in the list ends wholly in view at half', async ({ page, viewport }) => {
  test.skip(viewport?.width !== 390, 'runs on the 390×844 project only');
  // «Відкрий корчму»: the tavern row is near the end of the farm list, in view at full and below the fold at half — so
  // it must be measured after the sheet has snapped.
  await onChainStep(page, 'khortytsia.tavern1', '13:00');
  await page.getByRole('button', { name: 'Розгорнути панель на весь екран' }).click();
  await expect(page.locator('section[data-state="full"]')).toBeAttached();
  const row = page.locator('li[data-target="tavern"]');
  await expect(row).toBeInViewport();
  await goButton(page).click();
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('section[data-state="half"]')).toBeAttached();
  await expect
    .poll(() =>
      row.evaluate((el) => {
        const scroll = el.closest('ul')?.parentElement;
        if (!scroll) return 'no list';
        const a = scroll.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return r.top >= a.top - 0.5 && r.bottom <= a.bottom + 0.5
          ? 'whole'
          : `${String(r.top)}–${String(r.bottom)} vs ${String(a.top)}–${String(a.bottom)}`;
      }),
    )
    .toBe('whole');
});

test.describe('M3-15 strip target highlight @screens', () => {
  for (const [name, time] of [
    ['farm-day', '13:00'],
    ['farm-night', '23:00'],
  ] as const) {
    test(`the lit field row and the field on screen (${name})`, async ({ page }) => {
      await fieldStep(page, time);
      await goButton(page).click();
      await expect(fieldRow(page)).toHaveClass(/lit/);
      await expect.poll(() => buildingAt(page, 'field')).not.toBeNull();
      await camSettled(page);
      await shot(page, name);
    });
  }

  test('a locked Sich goal: the church row lit with its notch, the reason as a hint over the world', async ({
    page,
  }) => {
    await onChainStep(page, 'khortytsia.church1', '13:00');
    await goButton(page).click();
    await expect(page.locator('li[data-target="church"]')).toHaveClass(/lit/);
    await expect(page.locator('[data-hint]')).toContainText('Ще закрито.');
    await page.evaluate(() => document.fonts.ready);
    await shot(page, 'locked');
  });

  test('the lit hire row on «Січ»', async ({ page }) => {
    // «Менше руху»: the camera jumps to the Sich, so the shot comes while the rim is still lit (SHEET.highlightMs).
    await hireStep(page, '&still');
    await page.getByRole('tab', { name: 'Хутір' }).click();
    await goButton(page).click();
    await expect(page.getByRole('tab', { name: 'Січ' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('li[data-target="hire"]')).toHaveClass(/lit/);
    await camSettled(page);
    await shot(page, 'hire');
  });
});
