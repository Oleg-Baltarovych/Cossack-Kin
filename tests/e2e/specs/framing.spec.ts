// Default framing (M2-29 «Хвости M2-15» (1), owner 2026-11-20): the horizon sits at `FRAMING.horizon` (35 %) of the
// world window — the part of the screen between the HUD and the bottom sheet's half state (the default). Shots of the
// three zones in the game UI (every building built) on all phones, plus 07:00 fog and 19:30 on the reference phone;
// each one measures the horizon from the DOM rects and the frame.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { FRAMING } from '../../../src/render/atmosphere/config.ts';
import { horizonY } from '../../../src/render/layers/Layer.ts';
import { computeViewport, worldTargetSize } from '../../../src/render/viewport.ts';
import { screensDir } from '../helpers/reports.ts';
import { gotoReady } from '../helpers/world.ts';

/** How far (share of the window) the measured horizon may sit from `FRAMING.horizon`: HUD heights differ per phone. */
const HORIZON_TOLERANCE = 0.02;

/** Horizon as a share of the world window (HUD bottom → half sheet top), measured from the DOM and the frame. */
async function horizonShare(page: Page): Promise<number> {
  const box = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')?.getBoundingClientRect();
    return {
      top: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
      bottom: document.querySelector('section[data-state]')?.getBoundingClientRect().top ?? innerHeight,
      canvasTop: canvas?.top ?? 0,
      w: canvas?.width ?? innerWidth,
      h: canvas?.height ?? innerHeight,
      dpr: devicePixelRatio,
    };
  });
  const vp = computeViewport(box.w, box.h, box.dpr);
  const horizonCss = box.canvasTop + (horizonY(worldTargetSize(vp).height) * vp.scale) / box.dpr;
  return (horizonCss - box.top) / (box.bottom - box.top);
}

/** Shoots the half-sheet game screen and checks where the horizon fell. */
async function shootFramed(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const dir = screensDir();
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('section[data-state]')).toHaveAttribute('data-state', 'half');
  const file = `framing-${name}-${testInfo.project.name}.png`;
  const png = await page.screenshot({ path: join(dir, file), scale: 'device' });
  await testInfo.attach(file, { body: png, contentType: 'image/png' });
  const share = await horizonShare(page);
  testInfo.annotations.push({ type: 'horizon', description: `${(share * 100).toFixed(1)} % of the world window` });
  expect(Math.abs(share - FRAMING.horizon), `horizon at ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(
    HORIZON_TOLERANCE,
  );
}

test.describe('M2-29 default framing @screens @framing', () => {
  for (const zone of ['farm', 'suburb', 'sich'] as const) {
    for (const hhmm of ['1300', '2300'] as const) {
      test(`${zone} ${hhmm}: horizon at 35 % of the world window`, async ({ page }, testInfo) => {
        const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
        await gotoReady(page, `/?time=${time}&freeze&seed=1&state=showcase&ui=1&zone=${zone}`);
        await shootFramed(page, testInfo, `after-${zone}-${hhmm}`);
      });
    }
  }

  for (const [hhmm, weather] of [
    ['0700', 'fog'],
    ['1930', 'clear'],
  ] as const) {
    test(`farm ${hhmm} ${weather}: horizon at 35 % (reference phone)`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== '390x844@3', 'one phone is enough');
      const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
      await gotoReady(page, `/?time=${time}&freeze&seed=1&state=showcase&ui=1&zone=farm&weather=${weather}`);
      await shootFramed(page, testInfo, `after-farm-${hhmm}-${weather}`);
    });
  }
});
