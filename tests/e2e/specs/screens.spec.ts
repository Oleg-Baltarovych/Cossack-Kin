// Screenshot spec (plan M0-04/06/07, ART-04). Writes artifacts to reports/screens/<date>/ on every platform;
// baselines (`toHaveScreenshot`) are compared on Linux only — SwiftShader output differs per OS.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { KHORTYTSIA_FARM } from '../../../src/content/villages/khortytsia.layout.ts';
import { CLOUDS } from '../../../src/render/atmosphere/config.ts';
import { split } from '../../../src/render/camera.ts';
import { checkPixelGrid } from '../helpers/pixelGrid.ts';
import { decodePng } from '../../../tools/lib/png.ts';
import { gotoReady, readStats, readWebGl, waitReady } from '../helpers/world.ts';

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

/** Tallest cloud frame (assets-src/gen/khortytsia/cloud: 44 rows, pivot on the base row 40). */
const CLOUD_RISE = 41;
/**
 * The sky is ungraded (it is the light source): its rows above the highest cloud must be pure palette colors. Clouds
 * (ART-07) are LUT-graded like the world, so the check stops above them.
 */
function expectSkyOnPalette(png: Buffer, scale: number): void {
  const { width, height, data } = decodePng(png);
  const palette = new Set(PALETTE_COLORS);
  const off = new Set<string>();
  const skyRows = (height / scale) * KHORTYTSIA_FARM.horizonRatio;
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
  const horizon = KHORTYTSIA_FARM.horizonRatio;
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
    const horizon = Math.round(a.height * KHORTYTSIA_FARM.horizonRatio);
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

  // 2100 (ART-16 AC): the dusk-to-night step of the campfire and the light pools.
  for (const hhmm of ['0700', '1300', '1930', '2100', '2300'] as const) {
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
    await gotoReady(page, '/?time=13:00&freeze=0.6&seed=1&zone=farm');
    const swaying = decodePng(await page.screenshot({ scale: 'device' }));
    await gotoReady(page, '/?time=13:00&freeze=0.6&seed=1&zone=farm&still');
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
