// Linux screenshot baselines (`toHaveScreenshot`, plan M0-07 / M3-18). SwiftShader and font output differ per OS, so
// baselines are compared on Linux (CI, ubuntu-26.04) only; Windows/macOS runs still render the page and write their
// review shots to reports/screens/, they just skip the comparison (and save the would-be baseline there as
// reports/screens/<date>/baseline-<name>-<project>.png, so a local run can be checked for run-to-run stability). Files: tests/e2e/__screenshots__/<spec>/<name>-
// <project>-linux.png (playwright.config `snapshotPathTemplate`), made by the CI `update_snapshots` dispatch.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { screensDir } from './reports.ts';
import { cameraSettled } from './world.ts';

export const COMPARE_BASELINES = process.platform === 'linux';

export interface BaselineOptions {
  /** A region that is variable by design; the call site says why. */
  readonly mask?: readonly Locator[];
  /**
   * The page clock is paused (`gotoReadyPaused`): Pixi draws no new frame while the time stands, so `cameraSettled`
   * (which counts frames) would never return; the caller keeps the camera still (`?cam`, no tap).
   */
  readonly pausedClock?: boolean;
}

/**
 * Compares the page with its Linux baseline `name`. Every caller pins what would move: the clock (`setFixedTime` or a
 * paused one), the seed, the world (`?freeze`, or a paused clock stepped from before the load) and motion (`?still`
 * where the UI animates).
 */
export async function expectBaseline(page: Page, name: string, options: BaselineOptions = {}): Promise<void> {
  const mask = options.mask ?? [];
  // A tab tap glides the camera (CAMERA.glideMs): a shot mid-glide differs from run to run (M3-18, 360 «Походи»).
  if (!options.pausedClock) await cameraSettled(page);
  await page.evaluate(() => document.fonts.ready);
  if (!COMPARE_BASELINES) {
    mkdirSync(screensDir(), { recursive: true });
    // The same capture options as the comparison (playwright.config `expect.toHaveScreenshot`).
    await page.screenshot({
      path: join(screensDir(), `baseline-${name}-${test.info().project.name}.png`),
      scale: 'device',
      animations: 'disabled',
      caret: 'hide',
      mask: [...mask],
    });
    return;
  }
  // SwiftShader on CI needs > 5 s to get two identical 3.5x-DPR shots for the stable-screenshot loop.
  await expect(page).toHaveScreenshot(`${name}.png`, { timeout: 30_000, mask: [...mask] });
}
