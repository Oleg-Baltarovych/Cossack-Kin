// Playwright e2e (plan M0-07, SPEC §12.2). The web server serves a `--mode test` build (debug params,
// `window.__CK__`) from its own outDir, so it never overwrites the production `dist/` checked by
// `pnpm check:dist`. Viewports are the three M0 reference phones with real device pixel ratios.
import { defineConfig, type Project } from '@playwright/test';

const PORT = 4317;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const TEST_OUT_DIR = 'dist-test';

/** WebGL in headless Chromium: software ANGLE (SwiftShader). Never `--disable-gpu` (kills WebGL). */
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const phone = (width: number, height: number, dpr: number): Project => ({
  name: `${String(width)}x${String(height)}@${String(dpr)}`,
  use: {
    browserName: 'chromium',
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    launchOptions: { args: WEBGL_ARGS },
  },
});

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Baselines are compared on Linux (CI) only; see screens.spec.ts.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled', scale: 'device' } },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [phone(390, 844, 3), phone(360, 800, 3), phone(412, 915, 3.5)],
  webServer: {
    command: `vite build --mode test --outDir ${TEST_OUT_DIR} --emptyOutDir && vite preview --outDir ${TEST_OUT_DIR} --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
