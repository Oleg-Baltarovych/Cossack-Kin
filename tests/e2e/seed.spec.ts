import { test } from '@playwright/test';
import { gotoReady } from './helpers/world.ts';

// Seed for Playwright test agents: opens the test-mode web build in a deterministic state (debug params,
// docs/CONTEXT.md) and waits for the first world frame.
test.describe('Seed', () => {
  test('seed', async ({ page }) => {
    await gotoReady(page, '/?seed=1&freeze&time=13:00');
  });
});
