// Story windows and the quest strip on the phones (plan M2-25 AC «знімки uk/en 3 телефони», SPEC §2.5, §3.10, §6.1):
// review shots (not baselines) → reports/screens/<date>/m2-25-{strip,beat,welcome}-<lang>-<project>.png, by day, with
// the game clock frozen. The strip: `state=mid` with its chain step («hire a Cossack») done, so «Забрати» shows. The
// beat with a reward: `state=rich`, fields bought and three Cossacks hired → «Гонець з городка». The welcome: a fresh
// game's first action → «Берег Дніпра». Each shot also checks the layout: claim buttons no taller than one tap target,
// no strip text cut, the portrait at ×2 (whole logical px).
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Action } from '../../../src/core/actions.ts';
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady } from '../helpers/world.ts';

const LANGS = ['uk', 'en'] as const;
const url = (state: string, lang: string) => `/?time=13:00&freeze&seed=1&state=${state}&ui=1&lang=${lang}`;

async function dispatch(page: Page, action: Action): Promise<readonly string[]> {
  return page.evaluate((a) => window.__CK_GAME__?.dispatch(a) ?? [], action);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(screensDir(), `m2-25-${name}-${test.info().project.name}.png`) });
}

/**
 * Layout problems of the quest strip (or the «Ще» board): a claim button not one tap target tall, a token cut in its
 * line, the one-line strip taller than a tap target + its padding (≈ 50 css px), and — at half height — the first
 * building row not wholly in view under it.
 */
const questProblems = (page: Page, board: 'strip' | 'more') =>
  page.evaluate((which) => {
    const root = document.documentElement;
    const tap = parseFloat(getComputedStyle(root).getPropertyValue('--tap'));
    const px = parseFloat(getComputedStyle(root).getPropertyValue('--px'));
    const box = document.querySelector<HTMLElement>(
      '[role="tabpanel"] section[aria-label], [role="tabpanel"] section[aria-labelledby]',
    );
    if (!box) return ['no quest box'];
    // The title of a line is a button too (M3-15): at least one tap target; the claim buttons exactly one.
    const go = (b: HTMLElement): boolean => b.matches('[data-quest] > button:first-child');
    const out = [...box.querySelectorAll<HTMLElement>('button')]
      .filter((b) =>
        go(b)
          ? b.offsetHeight < tap - 1
          : b.offsetHeight > tap + 1 || b.offsetHeight < tap - 1 || b.scrollWidth > b.clientWidth,
      )
      .map((b) => `button ${b.textContent}: ${String(b.offsetHeight)} px`);
    // Tokens never wrap inside (white-space: nowrap): a wider box than its line is cut.
    for (const e of box.querySelectorAll<HTMLElement>('[data-quest] > :first-child > span > span'))
      if (e.scrollWidth > e.clientWidth + 1) out.push(`cut: ${e.textContent}`);
    if (which === 'strip') {
      // One line: the tap target and 2 × 3 logical px of padding (+ the border); a two-line title fits inside.
      const limit = tap + 7 * px + 1;
      if (box.offsetHeight > limit) out.push(`strip ${String(box.offsetHeight)} px > ${String(limit)}`);
      const scroll = box.parentElement?.querySelector<HTMLElement>('ul')?.parentElement;
      const row = document.querySelector<HTMLElement>('[role="tabpanel"] li[data-building]');
      if (!scroll || !row) out.push('no list');
      else if (row.getBoundingClientRect().bottom > scroll.getBoundingClientRect().bottom + 0.5)
        out.push(
          `first row cut: ${String(row.getBoundingClientRect().bottom)} > ${String(scroll.getBoundingClientRect().bottom)}`,
        );
    }
    return out;
  }, board);

/** The portrait's sprite: its box in logical px (2 × the atlas frame) and its device px per atlas px. */
async function portraitScale(page: Page): Promise<{ readonly perAtlasPx: number; readonly logicalW: number }> {
  const sprite = page.locator('[data-portrait] > span');
  await expect(sprite).toBeAttached();
  return sprite.evaluate((el) => {
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px'));
    const r = el.getBoundingClientRect();
    const atlasW = parseFloat(el.style.width);
    return { perAtlasPx: (r.width * devicePixelRatio) / atlasW, logicalW: r.width / px };
  });
}

test.describe('M2-25 story windows and the quest strip @screens', () => {
  for (const lang of LANGS) {
    test(`quest strip with a claim (${lang})`, async ({ page }) => {
      await gotoReady(page, url('mid', lang));
      // The mid farm stands on «hire a Cossack»: one more makes it done (more fields first if the food is short).
      for (let i = 0; i < 5 && !(await dispatch(page, { type: 'hire', n: 1 })).includes('CossackHired'); i++)
        await dispatch(page, { type: 'buyBuilding', id: 'field', mode: 10 });
      const strip = page.getByRole('region', { name: lang === 'uk' ? 'Завдання' : 'Tasks' });
      await expect(strip.getByRole('button', { name: lang === 'uk' ? /^Забрати/ : /^Claim/ })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await questProblems(page, 'strip')).toEqual([]);
      await shot(page, `strip-${lang}`);
      // «Ще»: both quests in full (the chore with its kind and progress in words).
      await page.getByRole('tab', { name: lang === 'uk' ? 'Ще' : 'More' }).click();
      await expect(
        page.getByRole('region', { name: lang === 'uk' ? 'Завдання' : 'Tasks' }).getByRole('listitem'),
      ).toHaveCount(2);
      expect(await questProblems(page, 'more')).toEqual([]);
      await shot(page, `more-${lang}`);
    });

    test(`story beat with its reward (${lang})`, async ({ page }) => {
      await gotoReady(page, url('rich', lang));
      for (let i = 0; i < 10 && !(await dispatch(page, { type: 'hire', n: 3 })).includes('StoryBeatReached'); i++)
        await dispatch(page, { type: 'buyBuilding', id: 'field', mode: 10 });
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveCount(1);
      await expect(dialog.locator('dd')).toHaveText(/^\+\d/);
      await expect(dialog.getByRole('button')).toBeFocused();
      const p = await portraitScale(page);
      expect(Math.abs(p.logicalW - 64)).toBeLessThan(0.1);
      expect(Math.abs(p.perAtlasPx - Math.round(p.perAtlasPx))).toBeLessThan(0.1);
      await shot(page, `beat-${lang}`);
    });

    test(`welcome beat of a new game (${lang})`, async ({ page }) => {
      await gotoReady(page, url('fresh', lang));
      expect(await dispatch(page, { type: 'tap' })).toContain('StoryBeatReached');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveCount(1);
      await expect(dialog.locator('dl')).toHaveCount(0);
      await portraitScale(page);
      await shot(page, `welcome-${lang}`);
    });
  }
});

/** The window's button: wholly inside the viewport, and the topmost thing at its centre (so a tap reaches it). */
async function reachable(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole('dialog').getByRole('button', { name });
  const ok = await button.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const inside = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return inside && hit !== null && b.contains(hit);
  });
  expect(ok, 'the button is on screen and takes the tap').toBe(true);
  await button.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('M2-25 windows on a small screen with larger text', () => {
  test.skip(({ viewport }) => viewport?.width !== 360, 'runs on the 360-px project only');

  /** 360 × `height` and the text ×1.25 («більший текст», SPEC §6.8 — the setting comes later; its token is set here). */
  async function small(page: Page, path: string, height: number): Promise<void> {
    await page.setViewportSize({ width: 360, height });
    await gotoReady(page, path);
    await page.evaluate(() => {
      const root = document.documentElement;
      const s = parseFloat(getComputedStyle(root).getPropertyValue('--font-s'));
      const m = parseFloat(getComputedStyle(root).getPropertyValue('--font-m'));
      root.style.setProperty('--font-s', `${String(s * 1.25)}px`);
      root.style.setProperty('--font-m', `${String(m * 1.25)}px`);
    });
  }

  // 640: a small phone; 400: a split screen / landscape, where the window must meet the screen's height.
  for (const height of [640, 400]) {
    test(`the story window at 360×${String(height)}: the button stays reachable`, async ({ page }) => {
      await small(page, url('rich', 'uk'), height);
      for (let i = 0; i < 10 && !(await dispatch(page, { type: 'hire', n: 3 })).includes('StoryBeatReached'); i++)
        await dispatch(page, { type: 'buyBuilding', id: 'field', mode: 10 });
      const dialog = page.getByRole('dialog', { name: 'Гонець з городка' });
      await expect(dialog).toBeVisible();
      if (height === 400) {
        // The case the fix is for: the window is as tall as the screen allows, and its text scrolls inside it.
        const body = page.locator(`[id="${(await dialog.getAttribute('aria-describedby')) ?? ''}"]`);
        expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);
      }
      await reachable(page, 'Гаразд');
    });

    test(`the return window at 360×${String(height)}: the button stays reachable`, async ({ page }) => {
      await small(page, url('away', 'uk'), height);
      await expect(page.getByRole('dialog', { name: 'З поверненням!' })).toBeVisible();
      await reachable(page, 'Забрати');
    });
  }
});
