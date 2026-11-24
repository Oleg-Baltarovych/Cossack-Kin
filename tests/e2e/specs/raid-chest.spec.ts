// The raid's chest, the return window's raids line and «Скарбниця» (plan M3-12). Functional (390): coming back after
// both raids returned, the return window says so in one line; «Забрати все» then opens one chest window for both
// squads, and a tap shows its whole loot. @screens — review shots (not baselines; M3-18 adds those) →
// reports/screens/<date>/m3-12-<state>-<lang>-<project>.png: the chest mid-shake, mid-reveal and finished, the same
// window under «менше руху» (`?still`), the return window with raids, and «Скарбниця». Each shot checks the layout:
// buttons ≥ --tap, nothing cut, nothing past the screen.
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { RAID_REVEAL } from '../../../src/content/juice.ts';
// Type-only: brings the window.__CK_GAME__ declaration.
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady } from '../helpers/world.ts';

test.use({ timezoneId: 'Europe/Kyiv' });

const T0 = new Date('2026-06-01T10:00:00Z');
const LANGS = ['uk', 'en'] as const;
const T = {
  uk: {
    sich: 'Січ',
    more: 'Ще',
    all: /^Забрати все: 2/,
    chest: 'Здобич 2 походів',
    collect: 'Забрати',
    back: 'З поверненням!',
    treasury: 'Скарбниця',
    sheet: 'Розгорнути панель на весь екран',
  },
  en: {
    sich: 'Sich',
    more: 'More',
    all: /^Collect all: 2/,
    chest: 'Loot of 2 raids',
    collect: 'Collect',
    back: 'Welcome back!',
    treasury: 'Treasury',
    sheet: 'Open the panel full screen',
  },
} as const;

async function setVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(screensDir(), `m3-12-${name}-${test.info().project.name}.png`) });
}

/** Layout problems inside `root`: a button under --tap or cut, a cut line, something past the screen's sides. */
const problems = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((box) => {
      const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap'));
      const out: string[] = [];
      for (const b of box.querySelectorAll<HTMLElement>('button'))
        if (b.offsetHeight < tap - 1 || b.scrollWidth > b.clientWidth + 1) out.push(`button ${b.textContent}`);
      for (const e of box.querySelectorAll<HTMLElement>('p:not([role="status"]), li, h2'))
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).position !== 'absolute')
          out.push(`cut: ${e.textContent}`);
      for (const e of box.querySelectorAll<HTMLElement>('section, li')) {
        const r = e.getBoundingClientRect();
        if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`wide: ${e.textContent}`);
      }
      return out;
    });

/** Back after both raids of `state=raids` returned: the return window names them; then «Забрати все». */
async function comeBack(page: Page, lang: (typeof LANGS)[number]) {
  await setVisibility(page, 'hidden');
  const left = await page.evaluate(
    () => JSON.parse(window.__CK_GAME__?.state() ?? 'null') as { time: { lastSeen: number } },
  );
  await page.clock.pauseAt(left.time.lastSeen + 40 * 60_000);
  await setVisibility(page, 'visible');
  const back = page.getByRole('dialog', { name: T[lang].back });
  await expect(back).toBeVisible();
  return back;
}

test.describe('M3-12 chest and return', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('away while both squads came back: one return line; «Забрати все» → one chest with both', async ({ page }) => {
    await page.clock.install({ time: T0 });
    await gotoReady(page, '/?seed=1&state=raids&ui=1&time=13:00');
    const back = await comeBack(page, 'uk');
    await expect(back.locator('[data-return="raids"]')).toHaveText(
      /^Походи: 2 повернулися \(.+, .+\) — скрині чекають на Січі$/,
    );
    await back.getByRole('button', { name: 'Забрати' }).click();
    await page.getByRole('tab', { name: T.uk.sich }).click();
    await page.getByRole('button', { name: T.uk.all }).click();
    const chest = page.getByRole('dialog', { name: T.uk.chest });
    await expect(chest).toBeVisible();
    await expect(chest.getByRole('region')).toHaveCount(2);
    // A tap shows it all; Enter on the focused «Забрати» closes (at any moment of the show).
    await chest.getByRole('heading').click();
    await expect(chest).toHaveAttribute('data-reveal', 'done');
    await expect(chest.getByRole('button', { name: T.uk.collect })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(chest).toBeHidden();
    await expect(page.getByRole('region', { name: 'Походи' })).toBeFocused();
  });
});

test.describe('M3-12 chest, return window, treasury @screens', () => {
  for (const lang of LANGS) {
    test(`the chest: shake, mid-reveal, finished; «менше руху» (${lang})`, async ({ page }) => {
      await page.clock.install({ time: T0 });
      await gotoReady(page, `/?time=13:00&freeze&seed=1&state=chests&ui=1&lang=${lang}`);
      await page.getByRole('tab', { name: T[lang].sich }).click();
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(now + 1000);
      await page.getByRole('button', { name: T[lang].all }).click();
      const chest = page.getByRole('dialog', { name: T[lang].chest });
      await expect(chest).toHaveAttribute('data-reveal', 'shake');
      await page.clock.runFor(RAID_REVEAL.shakeStepMs * 3);
      await shot(page, `chest-shake-${lang}`);
      await page.clock.runFor(RAID_REVEAL.shakeMs + RAID_REVEAL.itemStepMs * 2);
      await expect(chest).toHaveAttribute('data-reveal', 'items');
      await shot(page, `chest-mid-${lang}`);
      await chest.getByRole('heading').click();
      await expect(chest).toHaveAttribute('data-reveal', 'done');
      await expect(chest.locator('[data-item="relic"][data-shown]')).toBeVisible();
      expect(await problems(page, '[role="dialog"]')).toEqual([]);
      await shot(page, `chest-done-${lang}`);
      // The relic's card at the bottom of the scrolled body.
      await chest.locator('[data-item="relic"]').scrollIntoViewIfNeeded();
      await shot(page, `chest-relic-${lang}`);
      // «Більший текст» ×1.25 (SPEC §6.8): still inside the screen, «Забрати» in reach, nothing cut.
      await page.evaluate(() => {
        const root = document.documentElement;
        for (const v of ['--font-s', '--font-m'])
          root.style.setProperty(v, `${String(parseFloat(getComputedStyle(root).getPropertyValue(v)) * 1.25)}px`);
      });
      expect(await problems(page, '[role="dialog"]')).toEqual([]);
      await expect(chest.getByRole('button', { name: T[lang].collect })).toBeInViewport();
      await shot(page, `chest-big-${lang}`);

      // The paused clock holds rAF too: let it run again before the next page's first frame.
      await page.clock.resume();
      await gotoReady(page, `/?time=13:00&freeze&seed=1&state=chests&ui=1&lang=${lang}&still`);
      await page.getByRole('tab', { name: T[lang].sich }).click();
      await page.getByRole('button', { name: T[lang].all }).click();
      const still = page.getByRole('dialog', { name: T[lang].chest });
      await expect(still).toHaveAttribute('data-reveal', 'done');
      await expect(still.locator('[data-phase="shake"]')).toHaveCount(0);
      await shot(page, `chest-still-${lang}`);
    });

    test(`the return window with raids; «Скарбниця» (${lang})`, async ({ page }) => {
      await page.clock.install({ time: T0 });
      await gotoReady(page, `/?seed=1&state=raids&ui=1&time=13:00&lang=${lang}`);
      const back = await comeBack(page, lang);
      await expect(back.locator('[data-return="raids"]')).toBeVisible();
      expect(await problems(page, '[role="dialog"]')).toEqual([]);
      await shot(page, `return-${lang}`);
      await back.getByRole('button', { name: T[lang].collect }).click();

      await page.getByRole('tab', { name: T[lang].more }).click();
      await page.getByRole('button', { name: T[lang].sheet }).click();
      const treasury = page.getByRole('region', { name: T[lang].treasury });
      await treasury.scrollIntoViewIfNeeded();
      await expect(treasury.getByRole('listitem')).toHaveCount(2);
      expect(
        await problems(page, `section[aria-labelledby="${(await treasury.getAttribute('aria-labelledby')) ?? ''}"]`),
      ).toEqual([]);
      await shot(page, `treasury-${lang}`);
    });
  }
});
