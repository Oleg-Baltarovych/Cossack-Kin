// The «Культура» tab (plan M4-12, SPEC §10.3): the tab bar holds four tabs one tap target tall with every label on one
// line (uk and en, every phone); the tab opens without moving the camera, a hero levels from his card, and the red dot
// stands on the tab only while the sheet is down. @screens: review shots of the tab at half and full height, by day and
// evening, uk + en → reports/screens/<date>/m4-12-<state>-<time>-<lang>-<project>.png; the full sheet (uk, day) is
// also a Linux baseline (since M4-13 it shows the top of the «Музика» tree under the heroes). `state=culture`: every
// hero come, both branch roots learned, the otaman at level 4.
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { expectBaseline } from '../helpers/baseline.ts';
import { screensDir } from '../helpers/reports.ts';
import { cameraSettled, gotoReady } from '../helpers/world.ts';

test.use({ timezoneId: 'Europe/Kyiv' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-01T10:00:00Z'));
});

const LANGS = ['uk', 'en'] as const;
type Lang = (typeof LANGS)[number];
const url = (state: string, lang: Lang, time = '13:00') =>
  `/?time=${time}&freeze&seed=1&state=${state}&ui=1&lang=${lang}`;
const T = {
  uk: { culture: 'Культура', heroes: 'Герої', full: 'Розгорнути панель на весь екран', up: 'Підвищити' },
  en: { culture: 'Culture', heroes: 'Heroes', full: 'Open the panel full screen', up: 'Level up' },
} as const;

/** Tab-bar problems: a tab below one tap target, a label cut or on two lines (the bar taller than its button). */
const barProblems = (page: Page) =>
  page.getByRole('tablist').evaluate((list) => {
    const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap'));
    const out: string[] = [];
    const bar = list.parentElement;
    const toggle = bar?.querySelector<HTMLElement>('button[aria-expanded]');
    for (const tab of list.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const r = tab.getBoundingClientRect();
      if (r.height < tap - 0.5 || r.width < tap - 0.5) out.push(`small: ${tab.textContent} ${String(r.width)}`);
      if (tab.scrollWidth > tab.clientWidth + 0.5) out.push(`cut: ${tab.textContent}`);
      if (toggle && Math.abs(r.height - toggle.getBoundingClientRect().height) > 0.5)
        out.push(`two lines: ${tab.textContent}`);
    }
    return out;
  });

/** Layout problems of the heroes block: a button under a tap target or cut, a line cut (the one-line title, with its
 * `title`, ends in «…» by design), a card past the screen edge. */
const blockProblems = (page: Page, name: string) =>
  page.getByRole('region', { name }).evaluate((box) => {
    const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap'));
    const out: string[] = [];
    for (const b of box.querySelectorAll<HTMLElement>('button'))
      if (b.offsetHeight < tap - 1 || b.scrollWidth > b.clientWidth + 1)
        out.push(`button ${b.textContent}: ${String(b.offsetHeight)} px`);
    for (const e of box.querySelectorAll<HTMLElement>('p:not([title]), li li'))
      if (e.scrollWidth > e.clientWidth + 1) out.push(`cut: ${e.textContent}`);
    for (const li of box.querySelectorAll<HTMLElement>('li'))
      if (li.getBoundingClientRect().right > innerWidth + 0.5) out.push(`wide: ${li.textContent}`);
    return out;
  });

test.describe('M4-12 «Культура» tab', () => {
  for (const lang of LANGS) {
    test(`four tabs fit the bar (${lang})`, async ({ page }) => {
      await gotoReady(page, url('culture', lang));
      await expect(page.getByRole('tab')).toHaveCount(4);
      expect(await barProblems(page)).toEqual([]);
    });
  }

  test('opens without moving the camera; a hero levels from his card; the dot only while the sheet is down', async ({
    page,
  }) => {
    await gotoReady(page, url('culture', 'uk'));
    await cameraSettled(page);
    const cam = () => page.evaluate(() => window.__CK__?.stats.cam);
    const before = await cam();
    const tab = page.getByRole('tab', { name: T.uk.culture });
    // The sheet open (half): no dot.
    await expect(tab.locator('[data-dot]')).toHaveCount(0);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await cameraSettled(page);
    expect(await cam()).toEqual(before);
    const heroes = page.getByRole('region', { name: T.uk.heroes });
    const otaman = heroes.locator('[data-hero="otaman"]');
    await expect(otaman).toContainText('Рів. 4/25');
    await otaman.getByRole('button', { name: /^Підвищити «Кошовий отаман» на 1 рів\./ }).click();
    await expect(otaman).toContainText('Рів. 5/25');
    // Down: something new to take (the kobzar never levelled, a node of row 2 affordable) — the dot.
    await page.keyboard.press('Escape');
    await expect(tab.locator('[data-dot]')).toHaveCount(1);
    await expect(tab).toHaveAccessibleDescription('Нове в культурі');
  });

  test('no hero come, nothing to learn: silhouettes, «Прийде, коли…», no dot', async ({ page }) => {
    await gotoReady(page, url('mid', 'uk'));
    await page.keyboard.press('Escape');
    const tab = page.getByRole('tab', { name: T.uk.culture });
    await expect(tab.locator('[data-dot]')).toHaveCount(0);
    await tab.click();
    const heroes = page.getByRole('region', { name: T.uk.heroes });
    await expect(heroes.locator('[data-silhouette]')).toHaveCount(3);
    await expect(heroes.getByRole('button')).toHaveCount(0);
    await expect(heroes).toContainText('Прийде, коли Майдан сягне рівня 10');
  });
});

test.describe('M4-12 «Культура» tab @screens', () => {
  const shot = async (page: Page, name: string): Promise<void> => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(screensDir(), `m4-12-${name}-${test.info().project.name}.png`) });
  };
  for (const lang of LANGS) {
    for (const [time, key] of [
      ['13:00', 'day'],
      ['19:30', 'evening'],
    ] as const) {
      test(`half and full (${key}, ${lang})`, async ({ page }) => {
        await gotoReady(page, url('culture', lang, time));
        await page.getByRole('tab', { name: T[lang].culture }).click();
        await expect(page.getByRole('region', { name: T[lang].heroes })).toBeVisible();
        expect(await barProblems(page)).toEqual([]);
        expect(await blockProblems(page, T[lang].heroes)).toEqual([]);
        await cameraSettled(page);
        await shot(page, `half-${key}-${lang}`);
        await page.getByRole('button', { name: T[lang].full }).click();
        await expect(page.locator('section[data-state="full"]')).toBeVisible();
        // The sheet's height transition done before the shot.
        await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
        expect(await blockProblems(page, T[lang].heroes)).toEqual([]);
        await shot(page, `full-${key}-${lang}`);
        if (lang === 'uk' && key === 'day') await expectBaseline(page, 'm4-culture-full');
      });
    }
  }
});

test.describe('M4-12 «Культура» with larger text at 360 @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 360, 'runs on the 360-px project only');

  for (const lang of LANGS) {
    test(`hero cards stay whole (${lang})`, async ({ page }) => {
      await gotoReady(page, url('culture', lang));
      // «Більший текст» (SPEC §6.8): the setting comes later; its token is set here (story-quest-ui.spec).
      await page.evaluate(() => {
        const root = document.documentElement;
        for (const v of ['--font-s', '--font-m'])
          root.style.setProperty(v, `${String(parseFloat(getComputedStyle(root).getPropertyValue(v)) * 1.25)}px`);
      });
      await page.getByRole('tab', { name: T[lang].culture }).click();
      await page.getByRole('button', { name: T[lang].full }).click();
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
      const heroes = page.getByRole('region', { name: T[lang].heroes });
      // Every price whole on its button, every button inside its card.
      const problems = await heroes.evaluate((box) => {
        const out: string[] = [];
        for (const card of box.querySelectorAll<HTMLElement>('[data-hero]')) {
          const c = card.getBoundingClientRect();
          for (const b of card.querySelectorAll<HTMLElement>('button')) {
            const r = b.getBoundingClientRect();
            if (r.left < c.left - 0.5 || r.right > c.right + 0.5) out.push(`outside: ${b.textContent}`);
            for (const e of b.querySelectorAll<HTMLElement>('span'))
              if (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > r.right + 0.5)
                out.push(`clipped: ${e.textContent}`);
          }
        }
        return out;
      });
      expect(problems).toEqual([]);
      expect(await blockProblems(page, T[lang].heroes)).toEqual([]);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(screensDir(), `m4-12-full-large-${lang}-${test.info().project.name}.png`) });
    });
  }
});
