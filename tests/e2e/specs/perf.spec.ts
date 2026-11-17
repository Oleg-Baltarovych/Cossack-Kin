// ART-10 spike measurements (@perf, not part of CI): fps and draw calls of each light-shaft variant on live animation
// at 19:30 (and a 13:00 baseline without shafts), with the CPU throttled ×4 through CDP. Opt-in: `PERF=1 pnpm e2e
// --grep @perf`. Writes reports/perf/<date>/rays.md. Headless Chromium renders with SwiftShader (software GL), so
// absolute numbers are pessimistic; compare the variants with each other and confirm on the phone (A56).
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { gotoReady } from '../helpers/world.ts';

const RUNS = [
  ['baseline 13:00 (no shafts)', '13:00', 'med'],
  ['high: occlusion, full res @8 Hz', '19:30', 'high'],
  ['med: occlusion, ½ res @4 Hz', '19:30', 'med'],
  ['low: beam fan', '19:30', 'low'],
] as const;

const day = new Date().toISOString().slice(0, 10);
const DIR = join('reports', 'perf', day);
const FILE = join(DIR, 'rays.md');

test.describe('ART-10 shaft variants @perf', () => {
  test.skip(process.env['PERF'] !== '1', 'opt-in: PERF=1');
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');
  test.describe.configure({ mode: 'serial' });

  // (No beforeAll: it also runs for the skipped phone projects and would truncate the table.)
  const header = (): void => {
    if (existsSync(FILE)) return;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(
      FILE,
      `# ART-10 light shafts — ${day}

390×844 @3, headless Chromium (SwiftShader), CPU ×4 throttle, live animation.

| Variant | fps (mean of 3 s) | draw calls |
|---|---|---|
`,
    );
  };

  for (const [label, time, quality] of RUNS) {
    test(label, async ({ page }) => {
      header();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await gotoReady(page, `/?time=${time}&seed=1&zone=farm&quality=${quality}`);
      const samples: { fps: number; drawCalls: number }[] = [];
      for (let i = 0; i < 4; i++) {
        // The overlay stats publish once per second.
        await page.waitForFunction((n) => (window.__CK__?.stats.frames ?? 0) > n, (i + 1) * 20, { timeout: 30_000 });
        await page.waitForTimeout(1000);
        samples.push(
          await page.evaluate(() => ({
            fps: window.__CK__?.stats.fps ?? 0,
            drawCalls: window.__CK__?.stats.drawCalls ?? 0,
          })),
        );
      }
      const used = samples.slice(1); // first second includes start-up
      const fps = used.reduce((s, x) => s + x.fps, 0) / used.length;
      const calls = Math.max(...used.map((x) => x.drawCalls));
      appendFileSync(FILE, `| ${label} | ${fps.toFixed(1)} | ${String(calls)} |\n`);
      expect(fps).toBeGreaterThan(0);
    });
  }
});
