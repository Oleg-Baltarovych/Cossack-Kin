// ART-10 spike measurements (@perf, not part of CI): fps and draw calls of each light-shaft variant on live animation
// at 19:30 (and a 13:00 baseline without shafts), with the CPU throttled ×4 through CDP. Opt-in: `PERF=1 pnpm e2e
// --grep @perf`. Writes reports/perf/<date>/rays.md. Headless Chromium renders with SwiftShader (software GL), so
// absolute numbers are pessimistic; compare the variants with each other and confirm on the phone (A56).
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { AGENT_BUDGET } from '../../../src/content/agents.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { FROZEN_NOW } from '../../../src/ui/debug/gameDebug.ts';
import { MAX_DRAW_CALLS, PARTICLE_BUDGET, SPEC_MAX_DRAW_CALLS } from '../helpers/budgets.ts';
import { assertNativeFrames, gotoReady, nativeFrames } from '../helpers/world.ts';

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

// M2-02: the same while a finger pans the camera back and forth over the farm (light shafts repaint as the far planes
// move: rate-limited to the tier's repaintHz while moving, exact once settled). Writes reports/perf/<date>/camera.md.
const CFILE = join(DIR, 'camera.md');

test.describe('M2-02 camera pan @perf', () => {
  test.skip(process.env['PERF'] !== '1', 'opt-in: PERF=1');
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');
  test.describe.configure({ mode: 'serial' });

  const header = (): void => {
    if (existsSync(CFILE)) return;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(
      CFILE,
      `# M2-02 camera pan — ${day}

390×844 @3, headless Chromium (SwiftShader), CPU ×4 throttle, live animation, 19:30 (shafts on), a touch drag of
6 CSS px per frame back and forth over the farm (cam 0–600). Means of the stats windows published while panning.

| Tier | fps | CPU ms/frame | draw calls |
|---|---|---|---|
`,
    );
  };

  for (const tier of ['low', 'med', 'high'] as const) {
    test(`pan 19:30 ${tier}`, async ({ page }) => {
      test.setTimeout(240_000); // ~240 frames at ~10 fps under SwiftShader + CPU ×4
      header();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await gotoReady(page, `/?time=19:30&seed=1&zone=farm&quality=${tier}`);
      const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number): Promise<void> => {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: 300 }] });
      };
      // One frame per move: wait for the next rAF, then read the stats it may have published.
      const nextFrame = (): Promise<{ fps: number; frameMs: number; drawCalls: number }> =>
        page.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() => {
                const s = window.__CK__?.stats;
                resolve({ fps: s?.fps ?? 0, frameMs: s?.frameMs ?? 0, drawCalls: s?.drawCalls ?? 0 });
              });
            }),
        );
      const samples: { fps: number; frameMs: number; drawCalls: number }[] = [];
      let last = await nextFrame();
      // 4 strokes of 60 moves (360 CSS px): right-to-left, then back; a sample whenever the stats window turns over.
      for (let stroke = 0; stroke < 4; stroke++) {
        const from = stroke % 2 === 0 ? 380 : 20;
        const dir = stroke % 2 === 0 ? -6 : 6;
        await touch('touchStart', from);
        for (let i = 1; i <= 60; i++) {
          await touch('touchMove', from + dir * i);
          const now = await nextFrame();
          if (now.fps !== last.fps || now.frameMs !== last.frameMs) samples.push(now);
          last = now;
        }
        await touch('touchEnd');
      }
      const used = samples.slice(1); // the first window includes the still frames before the first stroke
      expect(used.length).toBeGreaterThan(0);
      const fps = used.reduce((a, s) => a + s.fps, 0) / used.length;
      const frameMs = used.reduce((a, s) => a + s.frameMs, 0) / used.length;
      const drawCalls = Math.max(...used.map((s) => s.drawCalls));
      appendFileSync(CFILE, `| ${tier} | ${fps.toFixed(1)} | ${frameMs.toFixed(2)} | ${String(drawCalls)} |\n`);
      expect(drawCalls).toBeLessThanOrEqual(SPEC_MAX_DRAW_CALLS);
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
        expect(drawCalls).toBeLessThanOrEqual(SPEC_MAX_DRAW_CALLS);
        expect(particles).toBeLessThanOrEqual(PARTICLE_BUDGET);
      });
    }
  }
});

// M2-28 (plan AC M2 3): the whole settlement under interaction — a touch drag across every zone (farm → suburb → Sich
// and back) with the full population (the top tiers: every villager spot open, 16 Cossacks, food carts, a visitor),
// a tap and a purchase after every stroke, the DOM UI on; CPU ×4 throttle as above. A visitor needs the game clock:
// seed 171 has a кобзар visit from 137 s after FROZEN_NOW (420 s long, tests/unit/core/visitors.test.ts), so the page
// clock starts there and runs (native frames, helpers/world.ts). Writes reports/perf/<date>/m2.md.
const M2FILE = join(DIR, 'm2.md');
const M2_SEED = 171;
const M2_CLOCK = FROZEN_NOW + 137_000;
const M2_RUNS = [
  ['tiers&tier=6', '13:00', 'rain', 'low'],
  ['tiers&tier=6', '13:00', 'rain', 'med'],
  ['tiers&tier=6', '13:00', 'rain', 'high'],
  ['tiers&tier=6', '19:30', 'clear', 'med'],
  ['tiers&tier=6', '23:00', 'rain', 'med'],
  ['showcase', '13:00', 'rain', 'med'],
] as const;
/** CSS px a finger moves per frame, as the M2-02 pan (390@3: 6 logical px — the camera's 1530 px in ≈ 260 frames). */
const STEP_CSS = 6;
/** Moves per stroke (360 CSS px); then the finger lifts and comes down again on the far side. */
const STROKE_MOVES = 60;
/** Strokes per direction at most (≈ 5 cross the world). */
const MAX_STROKES = 12;
const DRAG_Y = 300;

interface M2Sample {
  readonly fps: number;
  readonly frameMs: number;
  readonly drawCalls: number;
  readonly particles: number;
  readonly cam: number;
  readonly frames: number;
  readonly villager: number;
  readonly cossack: number;
  readonly cart: number;
  readonly visitor: number;
}

test.describe('M2-28 settlement drag @perf', () => {
  test.skip(process.env['PERF'] !== '1', 'opt-in: PERF=1');
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');
  test.describe.configure({ mode: 'serial' });

  const header = (): void => {
    if (existsSync(M2FILE)) return;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(
      M2FILE,
      `# M2-28 settlement drag — ${day}

390×844 @3, headless Chromium (SwiftShader), CPU ×4 throttle, live animation, DOM UI on, seed ${String(M2_SEED)}.
A touch drag of ${String(STEP_CSS)} CSS px per frame across the whole world (cam 0 → max → 0) in strokes of
${String(STROKE_MOVES)} moves; after each stroke a tap on the world and a purchase (\`buyBuilding field ×1\`).
fps and render ms are means of the stats windows published while dragging (render ms = \`__CK__.stats.frameMs\`:
world update + both renders); main ms = CDP \`TaskDuration\` (every main-thread task: React, the game loop, GC) /
frames. SwiftShader caps fps at ≈ 10 (the GPU side of the ×3 upscale), so judge the CPU columns against 16.7 ms.
Draw calls, particles and agents are maxima over the sweep (every zone and seam).

| State | Time | Weather | Tier | fps (min) | render ms | main ms/frame | draw calls | particles | v / c / cart / visitor |
|---|---|---|---|---|---|---|---|---|---|
`,
    );
  };

  for (const [state, time, weather, tier] of M2_RUNS) {
    test(`${state} ${time} ${weather} ${tier}`, async ({ page }) => {
      test.setTimeout(480_000); // ≈ 520 frames at ≈ 10 fps under SwiftShader + CPU ×4, plus start-up
      header();
      await page.clock.install({ time: M2_CLOCK });
      await nativeFrames(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Performance.enable');
      const query = `time=${time}&seed=${String(M2_SEED)}&weather=${weather}&quality=${tier}&state=${state}&ui=1`;
      await gotoReady(page, `/?${query}`);
      await assertNativeFrames(page);
      const taskSeconds = async (): Promise<number> => {
        const { metrics } = await cdp.send('Performance.getMetrics');
        return metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;
      };
      const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number): Promise<void> => {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: DRAG_Y }] });
      };
      // One frame per move: wait for the next rAF, then read what it published.
      const nextFrame = (): Promise<M2Sample> =>
        page.evaluate(
          () =>
            new Promise<M2Sample>((resolve) => {
              requestAnimationFrame(() => {
                const s = window.__CK__?.stats;
                resolve({
                  fps: s?.fps ?? 0,
                  frameMs: s?.frameMs ?? 0,
                  drawCalls: s?.drawCalls ?? 0,
                  particles: s?.particles ?? 0,
                  cam: s?.cam ?? 0,
                  frames: s?.frames ?? 0,
                  villager: s?.agents.villager ?? 0,
                  cossack: s?.agents.cossack ?? 0,
                  cart: s?.agents.cart ?? 0,
                  visitor: s?.agents.visitor ?? 0,
                });
              });
            }),
        );
      const buy = (): Promise<unknown> =>
        page.evaluate(() => window.__CK_GAME__?.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }));

      // Past start-up: the first stats windows hold the atlas decode.
      await page.waitForFunction(() => (window.__CK__?.stats.frames ?? 0) > 20, undefined, { timeout: 60_000 });
      const all: M2Sample[] = [];
      const windows: M2Sample[] = [];
      let last = await nextFrame();
      // PROFILE=1: a sampled CPU profile of the sweep → reports/perf/<date>/m2-<run>.cpuprofile (open it in
      // DevTools → Performance), to find what a frame spends its time on.
      const profile = process.env['PROFILE'] === '1';
      if (profile) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
        await cdp.send('Profiler.start');
      }
      const t0 = await taskSeconds();
      const f0 = last.frames;
      let maxCam = 0;
      let mainMs = 0;
      try {
        // Out to the Sich's far end (the finger moves left), then back to the farm.
        for (const dir of [-1, 1] as const) {
          for (let stroke = 0; stroke < MAX_STROKES; stroke++) {
            const from = dir < 0 ? 380 : 10;
            const camBefore = last.cam;
            await touch('touchStart', from);
            for (let i = 1; i <= STROKE_MOVES; i++) {
              await touch('touchMove', from + dir * STEP_CSS * i);
              const now = await nextFrame();
              all.push(now);
              if (now.fps !== last.fps || now.frameMs !== last.frameMs) windows.push(now);
              last = now;
            }
            await touch('touchEnd');
            // A tap on open ground (earns, a coin flies; a tap on a building would open its sheet over the world) and a
            // purchase through the store, as the UI sends them.
            const tapX = await page.evaluate(
              (y) => [200, 140, 260, 80, 320, 40, 360].find((x) => window.__CK__?.plotAt(x, y) === null) ?? null,
              DRAG_Y,
            );
            if (tapX !== null) {
              await touch('touchStart', tapX);
              await touch('touchEnd');
            }
            await buy();
            maxCam = Math.max(maxCam, last.cam);
            if (dir < 0 ? last.cam === camBefore : last.cam <= 0) break;
          }
        }
        mainMs = (((await taskSeconds()) - t0) * 1000) / Math.max(1, last.frames - f0);
      } finally {
        // The profile is written even when the sweep fails (it shows where it got stuck).
        if (profile) {
          const { profile: data } = await cdp.send('Profiler.stop');
          const name = `m2-${[state, time, weather, tier].join('-').replace(/[^\w-]+/g, '_')}.cpuprofile`;
          writeFileSync(join(DIR, name), JSON.stringify(data));
        }
        await cdp.detach();
      }
      expect(windows.length).toBeGreaterThan(1);
      // Reached the Sich's far end and came back (the camera's right bound: the world less the view). logicalW equals
      // ceil(deviceW / scale) only at 390@3 — the one project this spec runs on.
      const view = await page.evaluate(() => window.__CK__?.stats.logicalW ?? 0);
      expect(maxCam).toBe(KHORTYTSIA_WORLD.width - view);
      expect(last.cam).toBe(0);
      const mean = (f: (s: M2Sample) => number): number => windows.reduce((a, s) => a + f(s), 0) / windows.length;
      const max = (f: (s: M2Sample) => number): number => Math.max(...all.map(f));
      const minFps = Math.min(...windows.map((s) => s.fps));
      const row = [
        state,
        time,
        weather,
        tier,
        `${mean((s) => s.fps).toFixed(1)} (${minFps.toFixed(1)})`,
        mean((s) => s.frameMs).toFixed(2),
        mainMs.toFixed(1),
        String(max((s) => s.drawCalls)),
        String(max((s) => s.particles)),
        [max((s) => s.villager), max((s) => s.cossack), max((s) => s.cart), max((s) => s.visitor)].join(' / '),
      ];
      appendFileSync(M2FILE, `| ${row.join(' | ')} |\n`);
      // The measured scene budget (a regression tripwire), not the SPEC cap of 30.
      expect(max((s) => s.drawCalls)).toBeLessThanOrEqual(MAX_DRAW_CALLS);
      expect(max((s) => s.particles)).toBeLessThanOrEqual(PARTICLE_BUDGET);
      expect(max((s) => s.villager)).toBeLessThanOrEqual(AGENT_BUDGET.villager);
    });
  }
});
