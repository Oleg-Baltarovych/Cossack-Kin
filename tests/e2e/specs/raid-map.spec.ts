// The raid map (plan M3-11 + review): functional — what the offer card shows is what «Забрати» grants (§0.1 П3: the
// roll and the loot are fixed at the start), on Playwright's fake clock with the tab hidden for the raid's length (as
// return.spec); the keyboard walk and Esc. @screens — review shots →
// reports/screens/<date>/m3-11-<state>-<lang>-<project>.png, by day, clock frozen, Kyiv time: the map opened on its
// suggested card, an out-of-reach (blocked) card with the text ×1.25, and the list the map falls back to without its
// art. Each shot checks the layout: the whole map on the screen, every button ≥ --tap, no line or button cut. The map on
// its suggested card (uk) is also a Linux baseline (M3-18), on a fixed clock.
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { raidTier } from '../../../src/core/systems/raids.ts';
// Type-only: brings the window.__CK_GAME__ declaration.
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { screensDir } from '../helpers/reports.ts';
import { expectBaseline } from '../helpers/baseline.ts';
import { assertNativeFrames, gotoReady, nativeFrames } from '../helpers/world.ts';

test.use({ timezoneId: 'Europe/Kyiv' });

const T0 = new Date('2026-06-01T10:00:00Z');
const LANGS = ['uk', 'en'] as const;
const T = {
  uk: {
    sich: 'Січ',
    choose: 'Загін 1: обрати похід',
    collect: 'Забрати здобич загону 1',
    map: /^Мапа походів/,
    flags: 'Походи дня',
    success: 'Успіх',
    need: /^Потрібно ще .* сили, щоб вирушити$/,
  },
  en: {
    sich: 'Sich',
    choose: 'Squad 1: choose a raid',
    collect: "Collect squad 1's loot",
    map: /^Raid map/,
    flags: 'Today’s raids',
    success: 'Success',
    need: /^.* more power to set off$/,
  },
} as const;

async function setVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function openMap(page: Page, lang: (typeof LANGS)[number]) {
  await page.getByRole('tab', { name: T[lang].sich }).click();
  await page.getByRole('button', { name: T[lang].choose }).click();
  const map = page.getByRole('dialog', { name: T[lang].map });
  await expect(map).toBeVisible();
  return map;
}

test.describe('M3-11 raid map', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('the card’s «Успіх» is exactly what «Забрати» grants after the raid comes back', async ({ page }) => {
    await page.clock.install({ time: T0 });
    await gotoReady(page, '/?seed=1&state=mid&ui=1&time=13:00');
    const map = await openMap(page, 'uk');
    // The 5-minute scouting: one Cossack is a sure success (Q19), so the success line is what comes back.
    const flag = map.getByRole('group', { name: T.uk.flags }).getByRole('button', { name: /^Розвідка, / });
    await expect(flag).toHaveAttribute('aria-label', /шанс 100/);
    await flag.click();
    const card = map.getByRole('region', { name: /^Розвідка — / });
    // No relic and no pysanky on the scouting: the claim's line is the ducats and the glory, nothing else.
    await expect(card.locator('[data-fact="relic"], [data-fact="pysanky"]')).toHaveCount(0);
    const success = (await card.locator('[data-fact="success"] dd').innerText()).replace(/\s+/g, ' ').trim();
    expect(success).toMatch(/^\+.+ дук\., \+.+ слави$/);
    await card.getByRole('button', { name: /^Вирушити: Розвідка — .*, загін 1$/ }).click();
    await expect(map).toBeHidden();

    // Away for the raid's length and a minute more, so it is surely back.
    await setVisibility(page, 'hidden');
    const left = await page.evaluate(
      () => JSON.parse(window.__CK_GAME__?.state() ?? 'null') as { time: { lastSeen: number } },
    );
    await page.clock.pauseAt(left.time.lastSeen + (raidTier('m5').durationSec + 60) * 1000);
    await setVisibility(page, 'visible');
    // Two steps on coming back: the return window (the farm's income while away) comes first and holds the rest of
    // the UI inert; once it is taken, the squad's own «Забрати» on «Січ» claims the raid — its status line says what,
    // and the chest window shows it (M3-12).
    const back = page.getByRole('dialog', { name: 'З поверненням!' });
    await expect(back).toBeVisible();
    await back.getByRole('button', { name: 'Забрати' }).click();
    await expect(back).toBeHidden();
    const block = page.getByRole('region', { name: 'Походи' });
    await block.getByRole('button', { name: T.uk.collect }).click();
    await expect(block.getByRole('status')).toHaveText(`Отримано: ${success}`);
    // M3-12: the claim opens the chest — a tap shows it all, and its loot is the card's «Успіх», piece by piece.
    const chest = page.getByRole('dialog', { name: 'Здобич походу' });
    await expect(chest).toBeVisible();
    await chest.getByRole('heading').click();
    await expect(chest).toHaveAttribute('data-reveal', 'done');
    await expect(chest.getByText('Удача: уся здобич', { exact: true })).toBeVisible();
    const items = await chest.getByRole('listitem').allInnerTexts();
    expect(items.map((x) => x.replace(/\s+/g, ' ').trim()).join(', ')).toBe(success);
    await chest.getByRole('button', { name: 'Забрати' }).click();
    await expect(chest).toBeHidden();
  });

  test('arrows walk the flags, Enter opens a card, Esc closes the map and gives the focus back', async ({ page }) => {
    await gotoReady(page, '/?seed=1&state=mid&ui=1&time=13:00&freeze');
    const map = await openMap(page, 'uk');
    await expect(map.locator('[data-map="ready"]')).toBeVisible();
    const flags = map.getByRole('group', { name: T.uk.flags }).getByRole('button');
    await expect(flags).toHaveCount(5);
    await flags.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(flags.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(map.getByRole('region', { name: /^Дозор — / })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(map).toBeHidden();
    await expect(page.getByRole('button', { name: T.uk.choose })).toBeFocused();
  });
});

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(screensDir(), `m3-11-${name}-${test.info().project.name}.png`) });
}

/** Layout problems of the window: the map past the screen, a button under --tap, a cut line or button. */
const problems = (page: Page) =>
  page.getByRole('dialog').evaluate((box) => {
    const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap'));
    const out: string[] = [];
    const map = box.querySelector<HTMLElement>('[data-map]');
    const r = map?.getBoundingClientRect();
    if (!r || r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`map ${String(r?.left)}…${String(r?.right)}`);
    for (const b of box.querySelectorAll<HTMLElement>('button')) {
      const br = b.getBoundingClientRect();
      if (br.height < tap - 1 || br.width < Math.min(tap, 44) - 1)
        out.push(`button ${b.getAttribute('aria-label') ?? ''}`);
      if (b.scrollWidth > b.clientWidth + 1) out.push(`cut button ${b.textContent}`);
    }
    // Status lines are not laid out text (the read-out is visually hidden on purpose).
    for (const e of box.querySelectorAll<HTMLElement>('p:not([role="status"]), dt, dd, h2, h3'))
      if (e.scrollWidth > e.clientWidth + 1) out.push(`cut: ${e.textContent}`);
    return out;
  });

/** `state=raids`: squad 1 is back, squad 2 on the road — collect squad 1, then open the map for it (squad 2 rides). */
async function openRaids(page: Page, lang: (typeof LANGS)[number]) {
  await page.getByRole('tab', { name: T[lang].sich }).click();
  await page.getByRole('button', { name: T[lang].collect }).click();
  // The claim's chest (M3-12) first.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: lang === 'uk' ? 'Забрати' : 'Collect' })
    .click();
  await page.getByRole('button', { name: T[lang].choose }).click();
  return page.getByRole('dialog', { name: T[lang].map });
}

test.describe('M3-11 raid map @screens', () => {
  for (const lang of LANGS) {
    test(`the map on its suggested card, and a card out of reach with larger text (${lang})`, async ({ page }) => {
      await gotoReady(page, `/?time=13:00&freeze&seed=1&state=raids&ui=1&lang=${lang}`);
      const map = await openRaids(page, lang);
      await expect(map.locator('[data-map="ready"]')).toBeVisible();
      await expect(map.locator('[data-fact="success"]')).toBeVisible();
      expect(await problems(page)).toEqual([]);
      await shot(page, `map-${lang}`);
      // The 8-hour raid is out of reach here: the card says how much power is missing instead of a chance.
      await map.getByRole('group', { name: T[lang].flags }).getByRole('button').nth(4).click();
      await expect(map.getByText(T[lang].need)).toBeVisible();
      // «Більший текст» ×1.25 (SPEC §6.8): the card must still fit with «Вирушити» in reach.
      await page.evaluate(() => {
        const root = document.documentElement;
        for (const v of ['--font-s', '--font-m'])
          root.style.setProperty(v, `${String(parseFloat(getComputedStyle(root).getPropertyValue(v)) * 1.25)}px`);
      });
      expect(await problems(page)).toEqual([]);
      await shot(page, `blocked-big-${lang}`);
    });

    if (lang === 'uk')
      test(`baseline: the map on its suggested card (${lang})`, async ({ page }) => {
        // The day picks the board (raidBoard(seed, day)) and the «Повернуться о …» times come from the clock: fixed;
        // native frames keep the GPU paced under it (helpers/world.ts). `still`: the rider on the road stands on its
        // first frame and «Забрати» launches no coins. Nothing left that moves, so no mask.
        await page.clock.setFixedTime(T0);
        await nativeFrames(page);
        await gotoReady(page, `/?time=13:00&freeze&seed=1&state=raids&ui=1&lang=${lang}&still`);
        await assertNativeFrames(page);
        const map = await openRaids(page, lang);
        await expect(map.locator('[data-map="ready"]')).toBeVisible();
        await expect(map.locator('[data-fact="success"]')).toBeVisible();
        await expectBaseline(page, 'm3-map');
      });

    test(`without its art: the offers as a list (${lang})`, async ({ page }) => {
      await page.route('**/atlases/map.json', (route) => route.abort());
      await gotoReady(page, `/?time=13:00&freeze&seed=1&state=raids&ui=1&lang=${lang}`);
      const map = await openRaids(page, lang);
      await expect(map.locator('[data-map="failed"]')).toBeVisible();
      await expect(map.getByRole('group', { name: T[lang].flags }).getByRole('button')).toHaveCount(5);
      expect(await problems(page)).toEqual([]);
      await shot(page, `list-${lang}`);
    });
  }
});
