// HUD icons, compact prices and the picker on hiring (plan M2-14, SPEC §6.1/§6.8): icons come from the UI atlas and
// stand next to their words; every price fits its button on one line on all three phones in uk and en; ×10 / Max hire
// the count the button names.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { decodePng, type RgbaImage } from '../../../tools/lib/png.ts';
import { gotoReady } from '../helpers/world.ts';

const today = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const DIR = join('reports', 'screens', today());

async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const file = `hud-${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(DIR, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
}

/** Every icon in the page has its sprite (the atlas JSON arrived) and the image itself decoded. */
async function iconsLoaded(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const icons = [...document.querySelectorAll<HTMLElement>('[data-icon]')];
        return (
          icons.length > 0 &&
          icons.every((e) => e.querySelector<HTMLElement>('span')?.style.backgroundImage.includes('ui.png') === true)
        );
      }),
    )
    .toBe(true);
  const src = await page.evaluate(() => {
    const css = document.querySelector<HTMLElement>('[data-icon] > span')?.style.backgroundImage ?? '';
    return new URL(/url\("(.+)"\)/.exec(css)?.[1] ?? '', document.baseURI).href;
  });
  const res = await page.request.get(src);
  expect(res.status(), src).toBe(200);
  expect(res.headers()['content-type'], src).toContain('image/png');
  await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
  }, src);
}

/**
 * Device px that differ from their block's first px, with blocks of `scale` starting at (phaseX, phaseY). The outer
 * ring of blocks is left out: at 3.5 dpr the icon box sits at a fractional device position (layout rounds to 1/64 css
 * px), so its edge row/column is blended with the panel — a known residual (plan M2-14 «Після рев'ю»). The interior,
 * where a scaling seam would show, must be whole blocks.
 */
function splitBlocks(img: RgbaImage, scale: number, phaseX: number, phaseY: number): number {
  const px = new Uint32Array(img.data.buffer, img.data.byteOffset, img.data.byteLength / 4);
  let bad = 0;
  for (let y = phaseY + scale; y + 2 * scale <= img.height; y += scale)
    for (let x = phaseX + scale; x + 2 * scale <= img.width; x += scale) {
      const first = px[y * img.width + x];
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) if (px[(y + dy) * img.width + x + dx] !== first) bad += 1;
    }
  return bad;
}

/** The device px of `img` under a CSS box given in device px (outer edges rounded out, clamped to the image). */
function crop(img: RgbaImage, x: number, y: number, w: number, h: number): RgbaImage {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.ceil(x + w));
  const y1 = Math.min(img.height, Math.ceil(y + h));
  const data = new Uint8Array((x1 - x0) * (y1 - y0) * 4);
  for (let row = y0; row < y1; row++)
    data.set(img.data.subarray((row * img.width + x0) * 4, (row * img.width + x1) * 4), (row - y0) * (x1 - x0) * 4);
  return { width: x1 - x0, height: y1 - y0, data };
}

/** Buttons in the open list whose price overflows the button or grows it past one tap-target line. */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap'));
    return [...document.querySelectorAll<HTMLButtonElement>('[role="tabpanel"] li button')]
      .filter((b) => b.scrollWidth > b.clientWidth || b.offsetHeight > tap + 1)
      .map((b) => `${b.getAttribute('aria-label') ?? ''} → ${b.textContent}`);
  });

test.describe('M2-14 HUD and prices', () => {
  test('HUD: six icons beside their words, at 16 logical px', async ({ page }) => {
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=mid&ui=1');
    await iconsLoaded(page);
    const header = page.locator('header');
    await expect(header.locator('[data-icon]')).toHaveCount(6);
    for (const word of ['Дукати', 'Слава', /Козаки/, /Харч/, /Оборона/, /Вітер/])
      await expect(header.getByText(word)).toBeVisible();
    // Each icon px is a whole number of device px (16 logical px × the integer world scale), nearest-neighbour.
    const icons = await page.evaluate(() => {
      const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px'));
      return [...document.querySelectorAll<HTMLElement>('header [data-icon]')].map((e) => {
        const r = e.getBoundingClientRect();
        return {
          logical: r.width / px,
          perIconPx: (r.width * devicePixelRatio) / 16,
          rendering: getComputedStyle(e.firstElementChild ?? e).imageRendering,
        };
      });
    });
    // Chrome lays boxes out in 1/64 css px (LayoutUnit) and snaps them to device px at paint: allow that rounding.
    const SUBPX = 0.1;
    for (const i of icons) {
      expect(Math.abs(i.logical - 16)).toBeLessThan(SUBPX);
      expect(Math.abs(i.perIconPx - Math.round(i.perIconPx))).toBeLessThan(SUBPX);
      expect(Math.round(i.perIconPx)).toBeGreaterThanOrEqual(3);
      expect(i.rendering).toBe('pixelated');
    }
    // What the player sees: every icon px is a solid block of whole device px (no blur, no split columns).
    const scale = Math.round(icons[0]?.perIconPx ?? 0);
    // One shot of the HUD, cut per icon: six element shots (each waits for a stable box and a 3.5x compositor frame)
    // took 46–90 s of the test's 90 s on CI SwiftShader at 412×915@3.5.
    const box = await header.boundingBox();
    if (!box) throw new Error('no HUD box');
    const hud = decodePng(await page.screenshot({ clip: box, scale: 'device' }));
    const dpr = await page.evaluate(() => devicePixelRatio);
    const rects = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('header [data-icon]')].map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (const [n, r] of rects.entries()) {
      const img = crop(hud, (r.x - box.x) * dpr, (r.y - box.y) * dpr, r.w * dpr, r.h * dpr);
      expect(Math.min(img.width, img.height), `icon ${String(n)} crop`).toBeGreaterThanOrEqual(16 * scale);
      // The element crop may start a device px before or after the snapped box: accept the best phase.
      const best = Math.min(
        ...Array.from({ length: scale * scale }, (_, k) => splitBlocks(img, scale, k % scale, Math.floor(k / scale))),
      );
      expect(best, `icon ${String(n)}`).toBe(0);
    }
  });

  for (const lang of ['uk', 'en'] as const) {
    test(`prices fit one line in every row (${lang}, farm and Sich, ×1 and Max)`, async ({ page }) => {
      await gotoReady(page, `/?time=13:00&freeze&seed=1&state=showcase&ui=1&lang=${lang}`);
      await page.evaluate(() => document.fonts.ready);
      const tabs = page.getByRole('tab');
      const modes = page.locator('[role="group"] button');
      for (const tab of [0, 1]) {
        await tabs.nth(tab).click();
        for (const mode of [0, 3]) {
          await modes.nth(mode).click();
          expect(await overflowing(page)).toEqual([]);
        }
      }
    });
  }

  test('×10 and Max on hiring hire the count the button names', async ({ page }) => {
    // `mid` (6 of 20 the food feeds, M2-30): room for ×10 and then Max; showcase's host is at its food limit.
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=mid&ui=1');
    await page.getByRole('tab', { name: 'Січ' }).click();
    const hire = page.getByRole('button', { name: /^Найняти/ });
    const cossacks = page.locator('header li').first();
    const count = async (): Promise<number> => Number(/(\d+)\//.exec((await cossacks.textContent()) ?? '')?.[1]);
    for (const mode of ['×10', 'Макс']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const label = (await hire.getAttribute('aria-label')) ?? '';
      await expect(hire).toBeEnabled();
      const n = Number(/Найняти (\d+)/.exec(label)?.[1]);
      expect(n).toBeGreaterThan(0);
      const before = await count();
      await hire.click();
      await expect.poll(count).toBe(before + n);
    }
  });
});

test.describe('M2-14 HUD and rows @screens', () => {
  test('HUD + farm and Sich rows (13:00)', async ({ page }, testInfo) => {
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=showcase&ui=1');
    await page.evaluate(() => document.fonts.ready);
    await iconsLoaded(page);
    await shoot(page, testInfo, 'farm-1300');
    await page.getByRole('tab', { name: 'Січ' }).click();
    await page.getByRole('button', { name: '×10', exact: true }).click();
    await shoot(page, testInfo, 'sich-x10-1300');
  });

  test('HUD at night (23:00)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== '390x844@3', 'one phone is enough');
    await gotoReady(page, '/?time=23:00&freeze&seed=1&state=showcase&ui=1');
    await page.evaluate(() => document.fonts.ready);
    await iconsLoaded(page);
    await page.getByRole('tab', { name: 'Січ' }).click();
    await shoot(page, testInfo, 'sich-2300');
  });
});
