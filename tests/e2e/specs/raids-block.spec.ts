// The «Походи» block on «Січ» on the phones (plan M3-09 AC «@screens half/full 390/360/412»): review shots → reports/screens/<date>/m3-09-<state>-<lang>-<project>.png, by day, clock frozen, Kyiv
// time. Idle: `state=mid` (6 Cossacks, two free squads). Running and back: `state=raids` (squad 1 back from a 5-min
// scouting, squad 2 on a 30-min patrol, one relic found), in half and full; then «Ще раз» (both on the road) and
// «Забрати» (one idle). The idle block at half height (uk) is also a Linux baseline (M3-18). Each shot checks the layout: buttons one tap target tall, nothing cut, the cards not wider
// than the screen, and the block's text on whole lines (no price or time split).
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { expectBaseline } from '../helpers/baseline.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady } from '../helpers/world.ts';

test.use({ timezoneId: 'Europe/Kyiv' });

// A fixed clock: no «Повернуться о …» drift between the shots (frames stay GPU-paced, helpers/test.ts).
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-01T10:00:00Z'));
});

const LANGS = ['uk', 'en'] as const;
const url = (state: string, lang: string) => `/?time=13:00&freeze&seed=1&state=${state}&ui=1&lang=${lang}`;
const T = {
  uk: {
    sich: 'Січ',
    block: 'Походи',
    squad: 'Загін',
    sheet: 'Розгорнути панель на весь екран',
    again: /^Забрати й знову/,
  },
  en: { sich: 'Sich', block: 'Raids', squad: 'Squad', sheet: 'Open the panel full screen', again: /^Collect and send/ },
} as const;

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(screensDir(), `m3-09-${name}-${test.info().project.name}.png`) });
}

/** Layout problems of the block: a button not one tap target tall or cut, a cut line, a card past the screen edge. */
const blockProblems = (page: Page, name: string) =>
  page.getByRole('region', { name }).evaluate((box) => {
    const root = document.documentElement;
    const tap = parseFloat(getComputedStyle(root).getPropertyValue('--tap'));
    const out: string[] = [];
    for (const b of box.querySelectorAll<HTMLElement>('button'))
      if (b.offsetHeight < tap - 1 || b.scrollWidth > b.clientWidth + 1)
        out.push(`button ${b.textContent}: ${String(b.offsetHeight)} px`);
    for (const e of box.querySelectorAll<HTMLElement>('p:not([role="status"]), li span'))
      if (e.scrollWidth > e.clientWidth + 1) out.push(`cut: ${e.textContent}`);
    for (const li of box.querySelectorAll<HTMLElement>('li'))
      if (li.getBoundingClientRect().right > innerWidth + 0.5) out.push(`wide: ${li.textContent}`);
    return out;
  });

async function openSich(page: Page, lang: (typeof LANGS)[number]): Promise<void> {
  await page.getByRole('tab', { name: T[lang].sich }).click();
  await expect(page.getByRole('region', { name: T[lang].block })).toBeVisible();
}

test.describe('M3-09 «Походи» block @screens', () => {
  for (const lang of LANGS) {
    test(`idle squads (${lang})`, async ({ page }) => {
      await gotoReady(page, url('mid', lang));
      await openSich(page, lang);
      const block = page.getByRole('region', { name: T[lang].block });
      await expect(block.getByRole('listitem', { name: new RegExp(`^${T[lang].squad}`) })).toHaveCount(2);
      expect(await blockProblems(page, T[lang].block)).toEqual([]);
      // Two compact idle cards leave the hire row peeking in at half height (M3-09 review).
      const peek = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('[role="tabpanel"] ul:not([aria-label]) > li');
        const panel = document.querySelector<HTMLElement>('[role="tabpanel"]');
        return row && panel ? panel.getBoundingClientRect().bottom - row.getBoundingClientRect().top : -1;
      });
      // 360×800 cannot peek at half (owner decision, M2-29 D / M3-09): it may stay at most 7 px short (−5 after
      // the M3 spacing fix); 390 needs a visible edge (≥ 8 px, the «list goes on» hint), 412 likewise.
      if (test.info().project.name.startsWith('360'))
        expect(peek, 'the hire row stays within 7 px of the sheet edge').toBeGreaterThanOrEqual(-7);
      else expect(peek, 'the hire row shows under the block').toBeGreaterThanOrEqual(8);
      await shot(page, `idle-half-${lang}`);
      // Clock fixed and native frames (beforeEach), world frozen, nothing in the block counts down.
      if (lang === 'uk') await expectBaseline(page, 'm3-raids-half');
    });

    test(`on the road and back (${lang})`, async ({ page }) => {
      await gotoReady(page, url('raids', lang));
      await openSich(page, lang);
      const block = page.getByRole('region', { name: T[lang].block });
      await expect(block.getByRole('progressbar')).toHaveCount(1);
      await expect(block.getByRole('button', { name: T[lang].again })).toBeEnabled();
      expect(await blockProblems(page, T[lang].block)).toEqual([]);
      await shot(page, `back-half-${lang}`);
      await page.getByRole('button', { name: T[lang].sheet }).click();
      expect(await blockProblems(page, T[lang].block)).toEqual([]);
      await shot(page, `back-full-${lang}`);
      // «Ще раз»: squad 1 claims and sets off again — both on the road.
      await block.getByRole('button', { name: T[lang].again }).click();
      // The claim's chest window (M3-12) comes first: «менше руху»-independent, its button closes it at once.
      await page
        .getByRole('dialog')
        .getByRole('button', { name: lang === 'uk' ? 'Забрати' : 'Collect' })
        .click();
      await expect(block.getByRole('progressbar')).toHaveCount(2);
      expect(await blockProblems(page, T[lang].block)).toEqual([]);
      await shot(page, `running-full-${lang}`);
    });
  }
});
