// Strict CSP (plan M0-12, security.md): the e2e build (`vite build --mode test`) carries the same meta policy
// as production (tools/lib/csp.ts). The scene must render under it with zero violations and zero console
// errors — Pixi's unsafe-eval probe and blob: image workers would both show up here.
import { expect, test } from '@playwright/test';
import { PROD_CSP } from '../../../tools/lib/csp.ts';
import { gotoReady, readStats, readWebGl } from '../helpers/world.ts';

interface Violation {
  readonly directive: string;
  readonly blockedURI: string;
}

declare global {
  interface Window {
    __cspViolations?: Violation[];
  }
}

test.describe('CSP', () => {
  // One viewport is enough: the policy does not depend on the screen.
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('scene renders under the strict production CSP without violations', async ({ page }) => {
    const consoleProblems: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' || /content security policy/i.test(text))
        consoleProblems.push(`${msg.type()}: ${text}`);
    });
    page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations?.push({ directive: e.effectiveDirective, blockedURI: e.blockedURI });
      });
    });

    await gotoReady(page, '/?seed=1&freeze&time=13:00');

    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', PROD_CSP);
    expect((await readWebGl(page)).kind).not.toBeNull();
    expect((await readStats(page)).drawCalls).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleProblems).toEqual([]);

    // Positive control: the policy is enforced and the listener sees violations. `page.evaluate` itself is
    // exempt from CSP (DevTools protocol), so the probes are an inline <script> and a string timer, both run
    // by the page. Expected console errors from here on are not collected.
    page.removeAllListeners('console');
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'document.body.dataset.inlineRan = "1"';
      document.head.append(script);
      // A string handler is compiled like eval and needs 'unsafe-eval'.
      (setTimeout as (handler: string) => number)('document.body.dataset.evalRan = "1"');
    });
    await expect
      .poll(() => page.evaluate(() => window.__cspViolations?.map((v) => v.directive).sort()))
      .toEqual(['script-src', 'script-src-elem']);
    await expect(page.locator('body')).not.toHaveAttribute('data-inline-ran');
    await expect(page.locator('body')).not.toHaveAttribute('data-eval-ran');
  });
});
