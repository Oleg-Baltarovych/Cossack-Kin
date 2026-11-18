// Code splitting (plan M2-04): the Pixi world is a lazy chunk, so the DOM UI paints before the world is ready. Every
// script except the start scripts (index.html's entry + modulepreloads) is held back; the HUD must already be on screen
// while the world cannot load, and the world must still reach `data-ready` under the strict CSP once they are released.
import { expect, test, type Route } from '@playwright/test';
import { entryScripts, START_CHUNK_BUDGET_BYTES } from '../../../tools/lib/dist-leaks.ts';
import { waitReady } from '../helpers/world.ts';

/** In every Pixi v8 module that logs (`[PixiJS] …`, `PixiJS Error: …`); never in our own code. */
const PIXI_MARKER = 'PixiJS';

declare global {
  interface Window {
    __startupCsp?: string[];
  }
}

test.describe('M2-04 start chunk', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('the HUD is visible before the lazy world chunk loads and before data-ready', async ({ page }) => {
    // What paints the HUD: no Pixi in it, and the same budget as check:dist (sum of raw bytes of the start scripts).
    const start = new Set(entryScripts(await (await page.request.get('/')).text()));
    expect(start.size).toBeGreaterThan(0);
    let startBytes = 0;
    for (const path of start) {
      const body = await (await page.request.get(`/${path}`)).text();
      expect(body, `${path} carries Pixi`).not.toContain(PIXI_MARKER);
      startBytes += Buffer.byteLength(body);
    }
    expect(startBytes).toBeLessThanOrEqual(START_CHUNK_BUDGET_BYTES);

    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || /content security policy/i.test(msg.text()))
        problems.push(`${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    await page.addInitScript(() => {
      window.__startupCsp = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__startupCsp?.push(`${e.effectiveDirective} ${e.blockedURI}`);
      });
    });

    const held: Route[] = [];
    let release = false;
    await page.route('**/*.js', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/+/, '');
      // Checked and queued in one synchronous step: after `release` nothing more is held.
      if (release || start.has(path)) await route.continue();
      else held.push(route);
    });

    await page.goto('/?seed=1&freeze&time=13:00&ui=1');
    await expect(page.getByRole('banner')).toBeVisible();
    // The world's code is still held back: something lazy was requested, no canvas yet, not ready.
    await expect.poll(() => held.length).toBeGreaterThan(0);
    await expect(page.locator('#world canvas')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-ready');

    release = true;
    while (held.length > 0) await Promise.all(held.splice(0).map((route) => route.continue()));
    await waitReady(page);
    await expect(page.locator('#world canvas')).toHaveCount(1);
    await expect(page.getByRole('banner')).toBeVisible();
    expect(await page.evaluate(() => window.__startupCsp)).toEqual([]);
    expect(problems).toEqual([]);
  });
});
