// The culture tree and the node card (plan M4-13, SPEC §10.3): a tap on a node opens its sticky card, «Вивчити» learns
// one rank, a node whose prerequisites are missing refuses with the reason in the button's description (and the reason
// moves on to glory once they are met); the arrows move focus along the tree and Enter/Space open and close the card.
// Every node and the card stay whole (tap targets, no clipped words) on every phone, uk + en, and with larger text at
// 360. @screens: the full sheet scrolled to the tree with a card open, by day and evening, uk + en →
// reports/screens/<date>/m4-13-<name>-<project>.png. `state=culture`: both roots learned, row 2 open, row 3 waiting.
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady } from '../helpers/world.ts';

test.use({ timezoneId: 'Europe/Kyiv' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-01T10:00:00Z'));
});

const LANGS = ['uk', 'en'] as const;
type Lang = (typeof LANGS)[number];
const url = (lang: Lang, time = '13:00') => `/?time=${time}&freeze&seed=1&state=culture&ui=1&lang=${lang}`;
const T = {
  uk: { culture: 'Культура', full: 'Розгорнути панель на весь екран', branches: 'Гілки культури', learn: /^Вивчити/ },
  en: { culture: 'Culture', full: 'Open the panel full screen', branches: 'Culture branches', learn: /^Learn/ },
} as const;

/** The «Культура» tab with the sheet full screen (a half sheet's lower rows hang at «stable» on a click). */
async function openTree(page: Page, lang: Lang, time?: string): Promise<void> {
  await gotoReady(page, url(lang, time));
  await page.getByRole('tab', { name: T[lang].culture }).click();
  await page.getByRole('button', { name: T[lang].full }).click();
  await expect(page.locator('section[data-state="full"]')).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

const node = (page: Page, id: string) => page.locator(`[data-node="${id}"]`);
const card = (page: Page) => page.locator('[data-card]');

/** Layout problems of the tree and the open card: a button under a tap target, words cut or past the screen edge. */
const treeProblems = (page: Page) =>
  page.evaluate(() => {
    const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap'));
    const out: string[] = [];
    const boxes = [...document.querySelectorAll<HTMLElement>('[data-node], [data-card] button')];
    for (const b of boxes) {
      const r = b.getBoundingClientRect();
      if (r.height < tap - 1) out.push(`small: ${b.textContent} ${String(r.height)}`);
      if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`wide: ${b.textContent}`);
      for (const e of b.querySelectorAll<HTMLElement>('span'))
        if (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > r.right + 0.5)
          out.push(`clipped: ${e.textContent}`);
    }
    const c = document.querySelector<HTMLElement>('[data-card]');
    if (c) {
      for (const p of c.querySelectorAll<HTMLElement>('p, li'))
        if (p.scrollWidth > p.clientWidth + 1) out.push(`cut: ${p.textContent}`);
      if (c.getBoundingClientRect().bottom > innerHeight + 0.5) out.push('card below the screen');
    }
    return out;
  });

test.describe('M4-13 culture tree', () => {
  test('a tap opens the card; «Вивчити» learns one rank', async ({ page }) => {
    await openTree(page, 'uk');
    const maidan = node(page, 'music.maidan');
    await expect(maidan).toHaveAccessibleName(/^Пісні на майдані: ранг 0 з \d+, можна вивчити$/);
    await maidan.click();
    await expect(maidan).toHaveAttribute('aria-expanded', 'true');
    await expect(card(page)).toContainText('Ранг 0/');
    // The glory per second now → after, on the effect's line.
    await expect(card(page)).toContainText(/ · [\d,]+\/с → [\d,]+\/с/);
    await card(page)
      .getByRole('button', { name: /^Вивчити «Пісні на майдані», ранг 1, за / })
      .click();
    await expect(card(page)).toContainText('Ранг 1/');
    await expect(maidan).toHaveAccessibleName(/: ранг 1 з /);
    expect(await treeProblems(page)).toEqual([]);
  });

  test('a missing prerequisite refuses with the reason; once met, the reason is glory', async ({ page }) => {
    await openTree(page, 'uk');
    await node(page, 'music.bandura').click();
    const learn = card(page).getByRole('button', { name: T.uk.learn });
    await expect(learn).toBeDisabled();
    await expect(learn).toHaveAccessibleDescription('Спершу вивчіть «Пісні на майдані» або «Думи про походи»');
    await node(page, 'music.maidan').click();
    await card(page).getByRole('button', { name: T.uk.learn }).click();
    await node(page, 'music.bandura').click();
    await expect(card(page).getByRole('button', { name: T.uk.learn })).not.toHaveAccessibleDescription(/Спершу/);
    await expect(node(page, 'music.bandura')).not.toHaveAccessibleName(/спершу попередній вузол/);
  });

  test('keyboard: arrows along the tree, Enter opens the card, Space closes it', async ({ page }) => {
    await openTree(page, 'uk');
    await node(page, 'music.dumy').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    const campaign = node(page, 'music.campaign');
    await expect(campaign).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(card(page)).toContainText('Думи про походи');
    await page.keyboard.press('Space');
    await expect(card(page)).toHaveCount(0);
    await expect(campaign).toHaveAttribute('aria-expanded', 'false');
  });

  for (const lang of LANGS) {
    test(`every node and the card stay whole (${lang})`, async ({ page }) => {
      await openTree(page, lang);
      await node(page, 'music.bandura').click();
      expect(await treeProblems(page)).toEqual([]);
    });
  }
});

const shot = async (page: Page, name: string): Promise<void> => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(screensDir(), `m4-13-${name}-${test.info().project.name}.png`) });
};

/** Scrolls the sheet so the «Музика» tree starts at the top (the card stays stuck at the bottom). */
const toTree = (page: Page) =>
  page.locator('[data-branch="music"]').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
  });

test.describe('M4-13 culture tree @screens', () => {
  for (const lang of LANGS) {
    for (const [time, key] of [
      ['13:00', 'day'],
      ['19:30', 'evening'],
    ] as const) {
      test(`tree with a card (${key}, ${lang})`, async ({ page }) => {
        await openTree(page, lang, time);
        await node(page, 'music.bandura').click();
        await toTree(page);
        expect(await treeProblems(page)).toEqual([]);
        await shot(page, `tree-${key}-${lang}`);
        await node(page, 'music.maidan').click();
        await page.locator('[data-branch="customs"]').evaluate((el) => {
          el.scrollIntoView({ block: 'start' });
        });
        await shot(page, `customs-${key}-${lang}`);
      });
    }
  }
});

test.describe('M4-13 culture tree with larger text at 360 @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 360, 'runs on the 360-px project only');

  for (const lang of LANGS) {
    test(`nodes and the card stay whole (${lang})`, async ({ page }) => {
      await gotoReady(page, url(lang));
      // «Більший текст» (SPEC §6.8): the setting comes later; its token is set here (culture-tab.spec).
      await page.evaluate(() => {
        const root = document.documentElement;
        for (const v of ['--font-s', '--font-m'])
          root.style.setProperty(v, `${String(parseFloat(getComputedStyle(root).getPropertyValue(v)) * 1.25)}px`);
      });
      await page.getByRole('tab', { name: T[lang].culture }).click();
      await page.getByRole('button', { name: T[lang].full }).click();
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
      await node(page, 'music.great').click();
      await toTree(page);
      expect(await treeProblems(page)).toEqual([]);
      await shot(page, `tree-large-${lang}`);
    });
  }
});
