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

// ART-18: fps / draw calls / particles per tier for the four reference scenes (opt-in, PERF=1).
const SCENES = [
  ['0700 clear', '07:00', 'clear'],
  ['1930 clear', '19:30', 'clear'],
  ['2300 clear', '23:00', 'clear'],
  ['1300 rain', '13:00', 'rain'],
] as const;
const TIERS = ['low', 'med', 'high'] as const;
const QFILE = join(DIR, 'quality.md');

test.describe('ART-18 quality tiers @perf', () => {
  test.skip(process.env['PERF'] !== '1', 'opt-in: PERF=1');
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');
  test.describe.configure({ mode: 'serial' });

  const header = (): void => {
    if (existsSync(QFILE)) return;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(
      QFILE,
      `# ART-18 quality tiers — ${day}

390×844 @3, headless Chromium (SwiftShader), CPU ×4 throttle, live animation; farm zone. Absolute fps are
pessimistic (software GL); the phone numbers (A56, Q4) come from \`pnpm dev --host\` + \`?overlay\`.

| Scene | Tier | fps (mean of 3 s) | CPU ms/frame | draw calls | particles |
|---|---|---|---|---|---|
`,
    );
  };

  for (const [label, time, weather] of SCENES) {
    for (const tier of TIERS) {
      test(`${label} ${tier}`, async ({ page }) => {
        header();
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await gotoReady(page, `/?time=${time}&seed=1&zone=farm&weather=${weather}&quality=${tier}`);
        const samples: { fps: number; frameMs: number; drawCalls: number; particles: number }[] = [];
        for (let i = 0; i < 4; i++) {
          await page.waitForFunction((n) => (window.__CK__?.stats.frames ?? 0) > n, (i + 1) * 20, {
            timeout: 30_000,
          });
          await page.waitForTimeout(1000);
          samples.push(
            await page.evaluate(() => ({
              fps: window.__CK__?.stats.fps ?? 0,
              frameMs: window.__CK__?.stats.frameMs ?? 0,
              drawCalls: window.__CK__?.stats.drawCalls ?? 0,
              particles: window.__CK__?.stats.particles ?? 0,
            })),
          );
        }
        const used = samples.slice(1);
        const fps = used.reduce((a, s) => a + s.fps, 0) / used.length;
        const frameMs = used.reduce((a, s) => a + s.frameMs, 0) / used.length;
        const drawCalls = Math.max(...used.map((s) => s.drawCalls));
        const particles = Math.max(...used.map((s) => s.particles));
        appendFileSync(
          QFILE,
          `| ${label} | ${tier} | ${fps.toFixed(1)} | ${frameMs.toFixed(1)} | ${String(drawCalls)} | ${String(particles)} |\n`,
        );
        expect(drawCalls).toBeLessThanOrEqual(30);
        expect(particles).toBeLessThanOrEqual(300);
      });
    }
  }
});
