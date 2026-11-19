// Screenshot spec (plan M0-04/06/07, ART-04). Writes artifacts to reports/screens/<date>/ on every platform;
// baselines (`toHaveScreenshot`) are compared on Linux only — SwiftShader output differs per OS.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { CLOUDS } from '../../../src/render/atmosphere/config.ts';
import { split } from '../../../src/render/camera.ts';
import { validateState } from '../../../src/core/state.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { decodePng } from '../../../tools/lib/png.ts';
import { gotoReady, readStats, readWebGl, waitReady } from '../helpers/world.ts';
// Type-only: the window.__CK_GAME__ declaration.
import type {} from '../../../src/ui/debug/gameDebug.ts';

/**
 * Frame budget (SPEC §12.4 caps the game at 30): the scene measured 5 before ART-09; the water adds 2 passes (ART-09:
 * mirror into waterRT, row strips back onto worldRT); light shafts with their dust add 2 while a low sun shines
 * (ART-10, additive). Per-tier budgets are set in ART-18. Raise only with the reason here.
 */
const MAX_DRAW_CALLS = 9;
const SCENE = '/?seed=1&freeze&time=13:00';
const CAM = 10.5;
const COMPARE_BASELINES = process.platform === 'linux';
/**
 * ART-04 changed every frame (time-of-day sky + LUT grading), so the M0 Linux baselines are stale. Until the
 * ART-04 set is committed (marker: its 1300 baseline), baselines are compared only in an
 * `--update-snapshots=all` run (CI workflow_dispatch with update_snapshots), which writes the new set.
 */
const BASELINES_PENDING = !existsSync(
  'tests/e2e/__screenshots__/specs/screens.spec.ts/khortytsia-farm-1300-clear-390x844-3-linux.png',
);
/** The 6 time-of-day keys (plan §0) — ART-04 matrix, farm zone, clear weather. */
const SKY_KEY_TIMES = ['0530', '0700', '1300', '1930', '2100', '2300'] as const;
/** Low-light keys where the "never black" rule applies. */
const DARK_KEYS: ReadonlySet<string> = new Set(['0530', '2100', '2300']);
const PALETTE = JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')) as {
  ramps: Record<string, string[]>;
};
/** Every master-palette color as 0xRRGGBB: the `debug/swatch` atlas frame (M0-08) shows all of them. */
const PALETTE_COLORS: readonly number[] = Object.values(PALETTE.ramps).flatMap((ramp) =>
  ramp.map((hex) => Number.parseInt(hex.slice(1), 16)),
);

const today = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const SCREENS_DIR = join('reports', 'screens', today());

/**
 * Waits until the camera stands still: the same `__CK__.stats.cam` over at least 3 rendered frames (a tab glide takes
 * `CAMERA.glideMs`; a shot during it differs from run to run). `leaving`: the camera's x before the glide (not settled there).
 */
async function cameraSettled(page: Page, leaving?: number): Promise<void> {
  let last: { cam: number; frames: number } | null = null;
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => {
          const s = window.__CK__?.stats;
          return s ? { cam: s.cam, frames: s.frames } : null;
        });
        if (!now) throw new Error('window.__CK__.stats is missing — is this a --mode test build?');
        if (!last || now.cam !== last.cam) last = now;
        return now.cam === leaving ? 0 : now.frames - last.frames;
      },
      { intervals: [50], timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(3);
}

async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<Buffer> {
  mkdirSync(SCREENS_DIR, { recursive: true });
  const file = `${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(SCREENS_DIR, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  return png;
}

async function expectBaseline(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const updating = testInfo.config.updateSnapshots === 'all';
  if (!COMPARE_BASELINES) return;
  if (BASELINES_PENDING && !updating) {
    testInfo.annotations.push({
      type: 'baseline-pending',
      description: `${name}: regenerate Linux baselines (ART-04)`,
    });
    return;
  }
  // SwiftShader on CI needs > 5 s to get two identical 3.5x-DPR shots for the stable-screenshot loop.
  await expect(page).toHaveScreenshot(`${name}.png`, { timeout: 30_000 });
}

async function expectWebGlWithinBudget(page: Page): Promise<number> {
  const gl = await readWebGl(page);
  expect(gl.kind, `no WebGL context (renderer: ${gl.renderer})`).not.toBeNull();
  const stats = await readStats(page);
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
  return stats.scale;
}

/**
 * Checks the whole device px of the viewport. With a fractional device height (915 css × 3.5 = 3202.5)
 * the screenshot has one extra row that the compositor blends from the half-covered px — not game output.
 */
function expectPixelGrid(png: Buffer, testInfo: TestInfo, scale: number, fracDevicePx: number): void {
  const { viewport, deviceScaleFactor = 1 } = testInfo.project.use;
  if (!viewport) throw new Error('project has no viewport');
  const report = checkPixelGrid(decodePng(png), {
    scale,
    fracDevicePx,
    x1: Math.floor(viewport.width * deviceScaleFactor),
    y1: Math.floor(viewport.height * deviceScaleFactor),
  });
  expect(
    report.violations,
    `${String(report.violationCount)} px break the ${String(scale)}×${String(scale)} grid`,
  ).toEqual([]);
  // Sky dither and grass tufts guarantee edges on both axes; none would mean a blank or broken frame.
  expect(report.columnEdges).toBeGreaterThan(0);
  expect(report.rowEdges).toBeGreaterThan(0);
}

/** The swatch is on screen exactly when every palette color reaches the canvas unchanged (no blending). */
function expectSwatch(png: Buffer): void {
  const { data } = decodePng(png);
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += 4)
    seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
  const missing = PALETTE_COLORS.filter((c) => !seen.has(c)).map((c) => `#${c.toString(16).padStart(6, '0')}`);
  expect(missing, 'palette colors of the debug swatch missing from the frame').toEqual([]);
}

test.describe('M0 screens @screens', () => {
  test('sky + ground + swatch: WebGL, budget, pixel grid, deterministic after reload', async ({ page }, testInfo) => {
    await gotoReady(page, SCENE);
    const scale = await expectWebGlWithinBudget(page);
    const first = await shoot(page, testInfo, 'm0-sky-ground');
    expectPixelGrid(first, testInfo, scale, 0);
    expectSwatch(first);

    await page.reload();
    await waitReady(page);
    const second = await page.screenshot({ scale: 'device' });
    expect(second.equals(first), 'two shots of the same URL after reload differ').toBe(true);
    await expectBaseline(page, testInfo, 'm0-sky-ground');
  });

  test(`camera ${String(CAM)}: sub-pixel shift keeps whole blocks`, async ({ page }, testInfo) => {
    await gotoReady(page, `${SCENE}&cam=${String(CAM)}`);
    const scale = await expectWebGlWithinBudget(page);
    const { fracDevicePx } = split(CAM, scale);
    // Every M0 project has scale 3 or 4, so 10.5 always leaves a non-zero device-px remainder.
    expect(fracDevicePx).toBeGreaterThan(0);
    const png = await shoot(page, testInfo, `m0-sky-ground-cam${String(CAM)}`);
    expectPixelGrid(png, testInfo, scale, fracDevicePx);
    await expectBaseline(page, testInfo, `m0-sky-ground-cam${String(CAM)}`);
  });

  test('debug overlay at 13:00', async ({ page }, testInfo) => {
    await gotoReady(page, '/?overlay&time=13:00&freeze&seed=1');
    await expectWebGlWithinBudget(page);
    const overlay = page.getByTestId('debug-overlay');
    for (const label of ['fps', 'frame', 'draw', 'parts', 'scale', 'view']) await expect(overlay).toContainText(label);
    await shoot(page, testInfo, 'm0-overlay-1300');
    // No baseline: fps / frame ms are live numbers.
  });
});

const luma = (c: number): number => 0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff);
const rgbAt = (data: Uint8Array, i: number): number =>
  ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);

/** Tallest cloud frame (assets-src/gen/sky/cloud: 44 rows, pivot on the base row 40). */
const CLOUD_RISE = 41;
/**
 * The sky is ungraded (it is the light source): its rows above the highest cloud must be pure palette colors. Clouds
 * (ART-07) are LUT-graded like the world, so the check stops above them.
 */
function expectSkyOnPalette(png: Buffer, scale: number): void {
  const { width, height, data } = decodePng(png);
  const palette = new Set(PALETTE_COLORS);
  const off = new Set<string>();
  const skyRows = (height / scale) * KHORTYTSIA_WORLD.horizonRatio;
  const firstCloudRow = Math.min(...CLOUDS.map((c) => Math.round(skyRows * c.y))) - CLOUD_RISE;
  const rows = Math.floor(Math.max(4, firstCloudRow - 1) * scale);
  for (let i = 0; i < rows * width * 4; i += 4) {
    const c = rgbAt(data, i);
    if (!palette.has(c)) off.add(`#${c.toString(16).padStart(6, '0')}`);
  }
  expect([...off].slice(0, 10), 'sky colors outside the master palette').toEqual([]);
}

/**
 * ART-BIBLE §8: night is never black — nothing on screen is darker than about `ink` 1. The right half only:
 * the dev/test swatch on the left shows every palette color, `ink` 0 included.
 */
function expectNoBlack(png: Buffer): void {
  const { width, height, data } = decodePng(png);
  const floor = luma(Number.parseInt((PALETTE.ramps['ink']?.[1] ?? '#000000').slice(1), 16)) - 2;
  let darkest = 255;
  for (let y = 0; y < height; y++)
    for (let x = Math.floor(width / 2); x < width; x++)
      darkest = Math.min(darkest, luma(rgbAt(data, (y * width + x) * 4)));
  expect(darkest, 'darkest pixel luma').toBeGreaterThanOrEqual(floor);
}

/** Mean luma of a device-px row band [y0, y1) over the right half (away from the dev swatch and the moon). */
function bandLuma(png: Buffer, y0: number, y1: number): number {
  const { width, data } = decodePng(png);
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(y0); y < Math.floor(y1); y++)
    for (let x = Math.floor(width / 2); x < width; x++, n++) sum += luma(rgbAt(data, (y * width + x) * 4));
  return sum / n;
}

/**
 * ART-BIBLE §8 / art-director ART-04: at night the ground's top band must be darker than the sky band just
 * above the horizon, so silhouettes read against the sky. The horizon sits at the scene layout's ratio of the view
 * height; bands are sampled 1–3% above and below it.
 */
/** Far planes (ART-08) stand up to 60 logical rows on the horizon; the sky sample is taken just above them. */
const FAR_PLANE_ROWS = 60;
function expectGroundDarkerThanHorizon(png: Buffer, scale: number): void {
  const { height } = decodePng(png);
  const horizon = KHORTYTSIA_WORLD.horizonRatio;
  const above = (FAR_PLANE_ROWS * scale) / height;
  const sky = bandLuma(png, height * (horizon - above - 0.02), height * (horizon - above));
  const ground = bandLuma(png, height * (horizon + 0.01), height * (horizon + 0.03));
  expect(ground, `ground top band luma vs horizon sky ${sky.toFixed(1)}`).toBeLessThan(sky);
}

test.describe('ART-04 time of day @screens', () => {
  // Owner matrix at the reference phone; the other phones are covered by the M0 grid/camera tests.
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  for (const hhmm of SKY_KEY_TIMES) {
    test(`khortytsia farm ${hhmm} clear: budget, pixel grid, palette sky`, async ({ page }, testInfo) => {
      const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
      await gotoReady(page, `/?time=${time}&freeze&seed=1&zone=farm`);
      const scale = await expectWebGlWithinBudget(page);
      const name = `khortytsia-farm-${hhmm}-clear`;
      const png = await shoot(page, testInfo, name);
      expectPixelGrid(png, testInfo, scale, 0);
      expectSkyOnPalette(png, scale);
      // ART-BIBLE §8: *night* is never black. By day, sprites legitimately use the darkest palette steps (outlines).
      if (DARK_KEYS.has(hhmm)) expectNoBlack(png);
      if (hhmm === '2300') expectGroundDarkerThanHorizon(png, scale);
      await expectBaseline(page, testInfo, name);
    });
  }
});

test.describe('ART-06 characters @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // Six consecutive walk frames (10 fps): freeze=0…0.5 s in 0.1 s steps.
  for (let step = 0; step <= 5; step++) {
    test(`khortytsia farm 1300 clear t${String(step)}: walkers on the pixel grid, within budget`, async ({
      page,
    }, testInfo) => {
      await gotoReady(page, `/?time=13:00&freeze=${(step / 10).toFixed(1)}&seed=1&zone=farm`);
      const scale = await expectWebGlWithinBudget(page);
      const png = await shoot(page, testInfo, `khortytsia-farm-1300-clear-t${String(step)}`);
      expectPixelGrid(png, testInfo, scale, 0);
    });
  }
});

test.describe('ART-07 clouds @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('khortytsia farm 1300 clear: clouds and their ground shadows drift (freeze 0 vs 10)', async ({
    page,
  }, testInfo) => {
    const shots: Buffer[] = [];
    for (const t of [0, 10]) {
      await gotoReady(page, `/?time=13:00&freeze=${String(t)}&seed=1&zone=farm`);
      const scale = await expectWebGlWithinBudget(page);
      const png = await shoot(page, testInfo, `khortytsia-farm-1300-clear-drift${String(t)}`);
      expectPixelGrid(png, testInfo, scale, 0);
      shots.push(png);
    }
    const [a, b] = shots.map((s) => decodePng(s));
    if (!a || !b) throw new Error('missing shots');
    const horizon = Math.round(a.height * KHORTYTSIA_WORLD.horizonRatio);
    const changed = (y0: number, y1: number): number => {
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
        }
      }
      return n;
    };
    // Sky (clouds moved) and ground (shadows moved) both change; nothing else is animated at 13:00 but walkers.
    expect(changed(0, horizon)).toBeGreaterThan(0);
    expect(changed(horizon + 4, a.height)).toBeGreaterThan(0);
  });
});

test.describe('ART-08 far plane and fog @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('khortytsia farm 0700 fog: far planes and the back row sink into the fog, within budget', async ({
    page,
  }, testInfo) => {
    await gotoReady(page, '/?time=07:00&freeze&seed=1&zone=farm&weather=fog');
    const scale = await expectWebGlWithinBudget(page);
    const png = await shoot(page, testInfo, 'khortytsia-farm-0700-fog');
    expectPixelGrid(png, testInfo, scale, 0);
  });
});

/** ART-10: quality tier → light-shaft variant (render/layers/Light.ts `rayVariant`). */
const RAY_TIERS = ['high', 'med', 'low'] as const;

test.describe('ART-10 light shafts @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  for (const hhmm of ['0700', '1930'] as const) {
    for (const quality of RAY_TIERS) {
      test(`khortytsia farm ${hhmm} clear, shafts ${quality}: pixel grid, within budget`, async ({
        page,
      }, testInfo) => {
        const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
        await gotoReady(page, `/?time=${time}&freeze=2&seed=1&zone=farm&quality=${quality}`);
        const scale = await expectWebGlWithinBudget(page);
        const png = await shoot(page, testInfo, `khortytsia-farm-${hhmm}-clear-rays-${quality}`);
        expectPixelGrid(png, testInfo, scale, 0);
      });
    }
  }
});

test.describe('ART-11 the Sich @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // All 6 keys (ART-19 matrix); 2100 (ART-16 AC) is the dusk-to-night step of the campfire and the light pools.
  for (const hhmm of ['0530', '0700', '1300', '1930', '2100', '2300'] as const) {
    test(`khortytsia sich ${hhmm} clear: budget, pixel grid`, async ({ page }, testInfo) => {
      const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
      await gotoReady(page, `/?time=${time}&freeze&seed=1&zone=sich`);
      const scale = await expectWebGlWithinBudget(page);
      const png = await shoot(page, testInfo, `khortytsia-sich-${hhmm}-clear`);
      expectPixelGrid(png, testInfo, scale, 0);
    });
  }
});

test.describe('ART-13 windmill @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // At the default breeze (WIND.strength 0.55 → 6.4 fps) 0.16 s steps advance the sails one frame each.
  for (let step = 0; step <= 3; step++) {
    test(`khortytsia farm 1300 clear sails t${String(step)}: whole-px sails, within budget`, async ({
      page,
    }, testInfo) => {
      await gotoReady(page, `/?time=13:00&freeze=${(step * 0.16).toFixed(2)}&seed=1&zone=farm`);
      const scale = await expectWebGlWithinBudget(page);
      const png = await shoot(page, testInfo, `khortytsia-farm-1300-clear-sails-t${String(step)}`);
      expectPixelGrid(png, testInfo, scale, 0);
    });
  }
});

test.describe('ART-14 vegetation and wind @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // The default breeze swings the plants at ~0.42 Hz: 0.6 s steps are about a quarter swing each (upright, lean
  // right, upright, lean left for a plant with phase 0). Named `sway-t*`: `clear-t*` are the ART-06 walk frames.
  for (let step = 0; step <= 3; step++) {
    test(`khortytsia farm 1300 clear sway t${String(step)}: whole-px sway, within budget`, async ({
      page,
    }, testInfo) => {
      await gotoReady(page, `/?time=13:00&freeze=${(step * 0.6).toFixed(1)}&seed=1&zone=farm`);
      const scale = await expectWebGlWithinBudget(page);
      const png = await shoot(page, testInfo, `khortytsia-farm-1300-clear-sway-t${String(step)}`);
      expectPixelGrid(png, testInfo, scale, 0);
    });
  }

  // At t = 0 the woman tending the sunflowers stands behind the left clump: it must thin out over her.
  test('khortytsia farm 1300 clear fade: a foreground clump over a person drops to half alpha', async ({
    page,
  }, testInfo) => {
    await gotoReady(page, '/?time=13:00&freeze=0&seed=1&zone=farm');
    const scale = await expectWebGlWithinBudget(page);
    const png = await shoot(page, testInfo, 'khortytsia-farm-1300-clear-fade');
    expectPixelGrid(png, testInfo, scale, 0);
  });

  test('«менше руху» (?still): the same moment with the plants upright differs only by the sway', async ({
    page,
  }, testInfo) => {
    // At t = 0 the ambient time is 0 with or without ?still (ART-18 freezes clouds, water, stars too), so the two
    // frames differ only where plants lean (phases ≠ 0 lean at t = 0) — never above the land.
    await gotoReady(page, '/?time=13:00&freeze=0&seed=1&zone=farm');
    const swaying = decodePng(await page.screenshot({ scale: 'device' }));
    await gotoReady(page, '/?time=13:00&freeze=0&seed=1&zone=farm&still');
    const png = await shoot(page, testInfo, 'khortytsia-farm-1300-clear-sway-still');
    const still = decodePng(png);
    let changed = 0;
    let topRow = Number.POSITIVE_INFINITY;
    for (let i = 0; i < still.data.length; i += 4) {
      if (still.data[i] !== swaying.data[i] || still.data[i + 1] !== swaying.data[i + 1]) {
        changed++;
        topRow = Math.min(topRow, Math.floor(i / 4 / still.width));
      }
    }
    // Leaning plants change some px; nothing above the land moves (sky, clouds and sails are the same frame).
    expect(changed).toBeGreaterThan(0);
    expect(topRow).toBeGreaterThan(still.height * 0.42);
  });
});

test.describe('ART-15 villagers @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // The farm's t0..t5 are the ART-06 walk frames (now with the five types); the Sich gets its own six steps.
  for (let step = 0; step <= 5; step++) {
    test(`khortytsia sich 1300 clear t${String(step)}: Cossacks on the pixel grid, within budget`, async ({
      page,
    }, testInfo) => {
      await gotoReady(page, `/?time=13:00&freeze=${(step / 10).toFixed(1)}&seed=1&zone=sich`);
      const scale = await expectWebGlWithinBudget(page);
      const png = await shoot(page, testInfo, `khortytsia-sich-1300-clear-t${String(step)}`);
      expectPixelGrid(png, testInfo, scale, 0);
    });
  }
});

test.describe('ART-17 rain and fog @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  for (const [zone, hhmm, weather] of [
    ['farm', '1300', 'rain'],
    ['farm', '2300', 'rain'],
    ['sich', '0700', 'fog'],
  ] as const) {
    test(`khortytsia ${zone} ${hhmm} ${weather}: budget, particles ≤ 300, pixel grid`, async ({ page }, testInfo) => {
      const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
      await gotoReady(page, `/?time=${time}&freeze=1.3&seed=1&zone=${zone}&weather=${weather}`);
      const scale = await expectWebGlWithinBudget(page);
      const stats = await readStats(page);
      expect(stats.particles).toBeLessThanOrEqual(300);
      const png = await shoot(page, testInfo, `khortytsia-${zone}-${hhmm}-${weather}`);
      expectPixelGrid(png, testInfo, scale, 0);
    });
  }
});

test.describe('M2-01 continuous world: zone seams @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // The view centred on each zone edge (cam = edge − half of the 390-px view), plus the suburb stub at its anchor.
  const VIEW_HALF = 195;
  const seams = KHORTYTSIA_WORLD.zones.slice(1).map((z, i) => ({
    name: `${KHORTYTSIA_WORLD.zones[i]?.id ?? ''}-${z.id}`,
    cam: z.x0 - VIEW_HALF,
  }));
  for (const { name, cam } of [...seams, { name: 'suburb', cam: null }]) {
    for (const [hhmm, weather] of [
      ['1300', 'clear'],
      ['2300', 'clear'],
      ['1300', 'rain'],
    ] as const) {
      test(`khortytsia seam ${name} ${hhmm} ${weather}: budget, particles ≤ 300, pixel grid`, async ({
        page,
      }, testInfo) => {
        const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
        const at = cam === null ? 'zone=suburb' : `cam=${String(cam)}`;
        await gotoReady(page, `/?time=${time}&freeze=1.3&seed=1&${at}&weather=${weather}`);
        const scale = await expectWebGlWithinBudget(page);
        const stats = await readStats(page);
        expect(stats.particles).toBeLessThanOrEqual(300);
        const png = await shoot(page, testInfo, `khortytsia-seam-${name}-${hhmm}-${weather}`);
        expectPixelGrid(png, testInfo, scale, 0);
      });
    }
  }
});

test.describe('M2-03 closer zoom level @screens', () => {
  // `?zoom=1` = the closer level about the screen centre: scale + 1, a window of the normal frame (camera y > 0); the
  // sky band moves down just enough to keep the sun/moon in the window. Every phone: day + night at the farm and the
  // world's right edge (cam past the end, clamped); 390 only: the morning sun and the Sich's evening light shafts.
  const CASES = [
    { name: 'farm-0700', zone: 'farm', hhmm: '0700', cam: null, phones: '390' },
    { name: 'farm-1300', zone: 'farm', hhmm: '1300', cam: null, phones: 'all' },
    { name: 'farm-2300', zone: 'farm', hhmm: '2300', cam: null, phones: 'all' },
    { name: 'sich-1930', zone: 'sich', hhmm: '1930', cam: null, phones: '390' },
    { name: 'edge-1300', zone: 'sich', hhmm: '1300', cam: KHORTYTSIA_WORLD.width, phones: 'all' },
  ] as const;
  for (const { name, zone, hhmm, cam, phones } of CASES) {
    test(`khortytsia ${name} clear, closer level: scale + 1, budget, pixel grid`, async ({ page }, testInfo) => {
      test.skip(phones === '390' && testInfo.project.use.viewport?.width !== 390, 'runs on the 390×844 project only');
      const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
      const at = cam === null ? `zone=${zone}` : `cam=${String(cam)}`;
      await gotoReady(page, `/?time=${time}&freeze&seed=1&${at}`);
      const normal = await readStats(page);
      await gotoReady(page, `/?time=${time}&freeze&seed=1&${at}&zoom=1`);
      const scale = await expectWebGlWithinBudget(page);
      const stats = await readStats(page);
      expect(stats.zoom).toBe(1);
      expect(scale).toBe(normal.scale + 1);
      expect(stats.camY).toBeGreaterThan(0);
      expect(stats.drawCalls).toBe(normal.drawCalls); // the same worldRT, only a closer window of it
      const file = `khortytsia-${name}-clear-zoom1`;
      const png = await shoot(page, testInfo, file);
      expectPixelGrid(png, testInfo, scale, split(stats.cam, scale).fracDevicePx);
      if (DARK_KEYS.has(hhmm)) expectNoBlack(png);
      if (cam !== null) {
        const { viewport, deviceScaleFactor = 1 } = testInfo.project.use;
        if (!viewport) throw new Error('project has no viewport');
        const deviceW = Math.floor(viewport.width * deviceScaleFactor);
        // Clamped to the closer level's right bound, and the last logical column is drawn (no blank/garbage edge):
        // it shows as many distinct colours down the frame as the column one block to its left.
        expect(stats.cam).toBe(KHORTYTSIA_WORLD.width - Math.ceil(deviceW / scale));
        const colours = (x: number): number => columnColours(png, x, Math.floor(viewport.height * deviceScaleFactor));
        expect(colours(deviceW - 1)).toBeGreaterThan(5); // a blank column would be 1
        expect(colours(deviceW - 1)).toBeGreaterThan(colours(deviceW - 1 - scale) / 2);
      }
    });
  }
});

/** Distinct colours in device column `x` over the first `rows` rows. */
function columnColours(png: Buffer, x: number, rows: number): number {
  const { data, width } = decodePng(png);
  const seen = new Set<number>();
  for (let y = 0; y < rows; y++) {
    const i = (y * width + x) * 4;
    seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
  }
  return seen.size;
}

test.describe('ART-18 «менше руху» @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  /** Device rows above the horizon (sky, clouds, far planes): no people there, only atmosphere. */
  const skyRows = async (page: Page, url: string): Promise<Buffer> => {
    await gotoReady(page, url);
    const png = decodePng(await page.screenshot({ scale: 'device' }));
    const rows = Math.floor(png.height * KHORTYTSIA_WORLD.horizonRatio) - 4;
    return Buffer.from(png.data.subarray(0, rows * png.width * 4));
  };

  test('?still: the atmosphere holds one frame (clouds do not drift), and no particles live', async ({ page }) => {
    const moving = [
      await skyRows(page, '/?time=13:00&freeze=1&seed=1&zone=farm'),
      await skyRows(page, '/?time=13:00&freeze=9&seed=1&zone=farm'),
    ];
    expect(moving[0]?.equals(moving[1] ?? Buffer.alloc(0)), 'clouds should drift without ?still').toBe(false);
    const still = [
      await skyRows(page, '/?time=13:00&freeze=1&seed=1&zone=farm&still'),
      await skyRows(page, '/?time=13:00&freeze=9&seed=1&zone=farm&still'),
    ];
    expect(still[0]?.equals(still[1] ?? Buffer.alloc(0)), 'the sky moved under ?still').toBe(true);
    await gotoReady(page, '/?time=23:00&freeze=2&seed=1&zone=farm&weather=rain&still');
    expect((await readStats(page)).particles).toBe(0);
  });
});

test.describe('ART-19 reference boards @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // Each board: an ART-01 reference (public domain, docs/art/references) beside the scene at the matching key, for
  // the final art review. Built in the browser (it decodes the JPEG references; no image dependency in tools/).
  const BOARDS = [
    [
      'golden',
      'kuindzhi-1878-evening-in-ukraine.jpg',
      'Kuindzhi, Evening in Ukraine (1878)',
      '/?time=19:30&freeze&seed=1&zone=farm',
    ],
    [
      'night',
      'kuindzhi-1876-ukrainian-night.jpg',
      'Kuindzhi, Ukrainian Night (1876)',
      '/?time=23:00&freeze&seed=1&zone=farm',
    ],
    [
      'cossacks',
      'repin-1880-1891-zaporozhian-cossacks.jpg',
      'Repin, Zaporozhian Cossacks (1880–91)',
      '/?time=13:00&freeze&seed=1&zone=sich',
    ],
    [
      'steppe',
      'vasylkivsky-cossack-in-the-steppe.jpg',
      'Vasylkivsky, Cossack in the Steppe',
      '/?time=13:00&freeze&seed=1&zone=farm',
    ],
  ] as const;

  for (const [name, file, title, url] of BOARDS) {
    test(`compare-${name}: reference beside the scene`, async ({ page }, testInfo) => {
      await gotoReady(page, url);
      const scene = (await page.screenshot({ scale: 'device' })).toString('base64');
      const reference = readFileSync(join('docs', 'art', 'references', file)).toString('base64');
      // A clean document (the game page's styles and canvas must not leak into the board).
      await page.goto('about:blank');
      await page.setViewportSize({ width: 1500, height: 920 });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#1b1a22;color:#e5ddd3;font:14px sans-serif;display:flex;gap:16px;padding:12px">
          <figure style="margin:0"><figcaption>${title}</figcaption>
            <img src="data:image/jpeg;base64,${reference}" style="max-height:860px;max-width:1000px;display:block"></figure>
          <figure style="margin:0"><figcaption>${url.slice(2)}</figcaption>
            <img src="data:image/png;base64,${scene}" style="height:860px;image-rendering:pixelated;display:block"></figure>
        </body></html>`,
      );
      await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
      mkdirSync(SCREENS_DIR, { recursive: true });
      const out = join(SCREENS_DIR, `compare-${name}.png`);
      const png = await page.screenshot({ path: out, scale: 'css' });
      await testInfo.attach(`compare-${name}.png`, { body: png, contentType: 'image/png' });
      expect(png.length).toBeGreaterThan(0);
    });
  }
});

test.describe('M1-17 UI list @screens', () => {
  // All three phones: the HUD and the rows must fit 360 px as well as 412 px.
  for (const preset of ['fresh', 'mid'] as const) {
    for (const hhmm of ['1300', '2300'] as const) {
      test(`ui ${preset} ${hhmm}: HUD, tabs and rows over the world`, async ({ page }, testInfo) => {
        const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
        await gotoReady(page, `/?time=${time}&freeze&seed=1&state=${preset}&ui=1`);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole('tab', { name: 'Хутір' })).toHaveAttribute('aria-selected', 'true');
        await shoot(page, testInfo, `ui-${preset}-farm-${hhmm}`);
        await page.getByRole('tab', { name: 'Січ' }).click();
        await expect(page.getByText('Найняти козака')).toBeVisible();
        await cameraSettled(page, 0);
        await shoot(page, testInfo, `ui-${preset}-sich-${hhmm}`);
      });
    }
  }

  test('ui buy: a click raises the level and the HUD follows', async ({ page }) => {
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=fresh&ui=1');
    await page.getByRole('button', { name: /Пшеничне поле/ }).click();
    await expect(page.getByText('Рів. 1', { exact: true })).toBeVisible();
    await expect(page.getByText('+0,5/с', { exact: true })).toBeVisible();
  });
});

test.describe('M2-05 every building at tier N @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // N = 0…6 per zone is AC 1 of M2 (art tasks M2-06…09 add zones/times); the framework shows the extremes now.
  for (const tier of [0, 1, 3, 6] as const) {
    for (const zone of ['farm', 'sich'] as const) {
      test(`tiers ${String(tier)} ${zone} 1300: plots by tier, budget, pixel grid`, async ({ page }, testInfo) => {
        await gotoReady(page, `/?time=13:00&freeze&seed=1&zone=${zone}&state=tiers&tier=${String(tier)}`);
        const scale = await expectWebGlWithinBudget(page);
        const png = await shoot(page, testInfo, `tiers-${String(tier)}-${zone}-1300`);
        expectPixelGrid(png, testInfo, scale, 0);
      });
    }
  }

  // M2-06: the farm's second screen (field, apiary, garden) and M2-07: the windmill and the potter's khata (with the
  // kiln, the jugs and tier VI's gilt) at every tier — day, golden hour, night and rain.
  const FARM_PLOTS_CAM = 380;
  const MILL_POTTER_CAM = 140;
  for (const [view, cam] of [
    ['farm-plots', FARM_PLOTS_CAM],
    ['mill-potter', MILL_POTTER_CAM],
  ] as const)
    for (const tier of [1, 2, 3, 4, 5, 6] as const) {
      for (const [hhmm, weather] of [
        ['1300', 'clear'],
        ['1930', 'clear'],
        ['2300', 'clear'],
        ['1300', 'rain'],
      ] as const) {
        test(`tiers ${String(tier)} ${view} ${hhmm} ${weather}: budget, particles ≤ 300, pixel grid`, async ({
          page,
        }, testInfo) => {
          const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
          await gotoReady(
            page,
            `/?time=${time}&freeze&seed=1&cam=${String(cam)}&weather=${weather}&state=tiers&tier=${String(tier)}`,
          );
          const scale = await expectWebGlWithinBudget(page);
          expect((await readStats(page)).particles).toBeLessThanOrEqual(300);
          const png = await shoot(page, testInfo, `tiers-${String(tier)}-${view}-${hhmm}-${weather}`);
          expectPixelGrid(png, testInfo, scale, 0);
          if (DARK_KEYS.has(hhmm)) expectNoBlack(png);
        });
      }
    }
});

test.describe('M2-08 the suburb @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // The zone at its anchor (state=showcase: smithy, tavern and fair at tier III) at the 6 time keys, in rain and fog;
  // the forge's light pool lies in front of the smithy at night.
  for (const [hhmm, weather] of [
    ...SKY_KEY_TIMES.map((t) => [t, 'clear'] as const),
    ['1300', 'rain'],
    ['0700', 'fog'],
  ] as const) {
    test(`khortytsia suburb ${hhmm} ${weather}: budget, particles ≤ 300, pixel grid`, async ({ page }, testInfo) => {
      const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
      await gotoReady(page, `/?time=${time}&freeze=1.3&seed=1&zone=suburb&weather=${weather}`);
      const scale = await expectWebGlWithinBudget(page);
      expect((await readStats(page)).particles).toBeLessThanOrEqual(300);
      const png = await shoot(page, testInfo, `khortytsia-suburb-${hhmm}-${weather}`);
      expectPixelGrid(png, testInfo, scale, 0);
      if (DARK_KEYS.has(hhmm)) expectNoBlack(png);
    });
  }

  // Smithy, tavern and fair at every tier, day and night.
  for (const tier of [1, 2, 3, 4, 5, 6] as const) {
    for (const hhmm of ['1300', '2300'] as const) {
      test(`tiers ${String(tier)} suburb ${hhmm}: budget, particles ≤ 300, pixel grid`, async ({ page }, testInfo) => {
        const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
        await gotoReady(page, `/?time=${time}&freeze=1.3&seed=1&zone=suburb&state=tiers&tier=${String(tier)}`);
        const scale = await expectWebGlWithinBudget(page);
        expect((await readStats(page)).particles).toBeLessThanOrEqual(300);
        const png = await shoot(page, testInfo, `tiers-${String(tier)}-suburb-${hhmm}`);
        expectPixelGrid(png, testInfo, scale, 0);
        if (DARK_KEYS.has(hhmm)) expectNoBlack(png);
      });
    }
  }
});

test.describe('M2-09 the Sich by tier @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  // Every Sich building at tier N (0 = the empty steppe camp … IV), by day, at night and in fog; `west` = the zone's
  // anchor (gate, church, treasury, flagpole), `east` = its far end (kurins III–IV, the koshovyi's house, the 2nd fire).
  for (const tier of [0, 1, 2, 3, 4] as const) {
    for (const [view, at] of [
      ['west', 'zone=sich'],
      ['east', 'cam=1530'],
    ] as const) {
      for (const [hhmm, weather] of [
        ['1300', 'clear'],
        ['2300', 'clear'],
        ['0700', 'fog'],
      ] as const) {
        test(`tiers ${String(tier)} sich ${view} ${hhmm} ${weather}: budget, particles ≤ 300, pixel grid`, async ({
          page,
        }, testInfo) => {
          const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
          await gotoReady(
            page,
            `/?time=${time}&freeze=1.3&seed=1&${at}&weather=${weather}&state=tiers&tier=${String(tier)}`,
          );
          const scale = await expectWebGlWithinBudget(page);
          expect((await readStats(page)).particles).toBeLessThanOrEqual(300);
          const png = await shoot(page, testInfo, `tiers-${String(tier)}-sich-${view}-${hhmm}-${weather}`);
          expectPixelGrid(png, testInfo, scale, 0);
          if (DARK_KEYS.has(hhmm)) expectNoBlack(png);
        });
      }
    }
  }
});

test.describe('M1-19 the scene follows the game @screens', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  for (const state of ['fresh', 'mid', 'showcase'] as const) {
    for (const zone of ['farm', 'sich'] as const) {
      for (const hhmm of ['1300', '2300'] as const) {
        test(`scene ${state} ${zone} ${hhmm}: plots by tier, budget, pixel grid`, async ({ page }, testInfo) => {
          const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
          await gotoReady(page, `/?time=${time}&freeze&seed=1&zone=${zone}&state=${state}`);
          const scale = await expectWebGlWithinBudget(page);
          const png = await shoot(page, testInfo, `scene-${state}-${zone}-${hhmm}`);
          expectPixelGrid(png, testInfo, scale, 0);
        });
      }
    }
  }

  test('buying the potter puts a khata on its empty plot, without a reload', async ({ page }) => {
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=rich&ui=1');
    // A marker that a reload would wipe.
    await page.evaluate(() => {
      document.documentElement.dataset.marker = 'same-page';
    });
    const canvas = page.locator('#world canvas');
    const before = await canvas.screenshot();
    await page.getByRole('button', { name: /Хата гончаря/ }).click();
    await expect(page.getByText('Рів. 1', { exact: true })).toBeVisible();
    // The plot appears on the next frame; poll until the canvas changed. A canvas screenshot under SwiftShader on the
    // CI runner takes seconds, so 5 s left room for only one or two polls (CI failure on 914c8da).
    await expect.poll(async () => (await canvas.screenshot()).equals(before), { timeout: 20_000 }).toBe(false);
    expect(await page.evaluate(() => document.documentElement.dataset.marker)).toBe('same-page');
    const stats = await readStats(page);
    expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS);
  });

  test('a tap on the world earns ducats: a coin pops in the scene and the number floats up', async ({ page }) => {
    // The coin and the number live 0.7 s: under parallel SwiftShader load a frame can take longer. Pause the page's
    // clock around the tap, then run exactly 100 ms — one coin frame, the number not yet gone.
    await page.clock.install();
    await gotoReady(page, '/?time=13:00&freeze&seed=1&state=rich&ui=1');
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    await page.mouse.click(200, 320);
    await page.clock.runFor(100);
    // A tap gives max(1 × scale, 30 % of the income): nothing is built yet, so 1 ducat.
    await expect(page.getByText('+1', { exact: true })).toBeVisible();
    await expect.poll(async () => (await readStats(page)).particles).toBeGreaterThan(0);
    const json = await page.evaluate(() => window.__CK_GAME__?.state() ?? 'null');
    const game = validateState(JSON.parse(json));
    expect(game.ok && game.state.stats.taps).toBe(1);
  });
});
