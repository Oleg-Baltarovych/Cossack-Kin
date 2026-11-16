import { test } from '@playwright/test';

// Seed for Playwright test agents: opens the web build in a deterministic state.
// Replace the URL params once the debug params exist (docs/CONTEXT.md).
test.describe('Seed', () => {
  test('seed', async ({ page }) => {
    await page.goto('/?seed=1&freeze');
  });
});
