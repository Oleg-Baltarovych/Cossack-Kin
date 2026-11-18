import { describe, expect, it } from 'vitest';
import { cameraBounds, clampCamX, layerOffset, levelView, skyShift, split } from '../../../src/render/camera.ts';
import { computeViewport, worldTargetSize } from '../../../src/render/viewport.ts';

// Plan §0 / M0-04: the world moves by whole logical px inside worldRT; the remainder becomes a
// whole number of device px applied to the upscale sprite.
describe('camera.split', () => {
  it('0.0 → no shift', () => {
    expect(split(0, 3)).toEqual({ worldPx: 0, fracDevicePx: 0 });
  });

  it('0.5 → half a logical px, rounded to whole device px', () => {
    expect(split(0.5, 2)).toEqual({ worldPx: 0, fracDevicePx: 1 });
    expect(split(0.5, 4)).toEqual({ worldPx: 0, fracDevicePx: 2 });
    expect(split(0.5, 3)).toEqual({ worldPx: 0, fracDevicePx: 2 });
    expect(split(10.5, 3)).toEqual({ worldPx: 10, fracDevicePx: 2 });
  });

  it('−0.25 → floors to the previous logical px, fraction stays positive', () => {
    expect(split(-0.25, 4)).toEqual({ worldPx: -1, fracDevicePx: 3 });
    expect(split(-0.25, 3)).toEqual({ worldPx: -1, fracDevicePx: 2 });
  });

  it('never returns negative zero', () => {
    const { worldPx, fracDevicePx } = split(-0.1, 3);
    expect(Object.is(worldPx, -0)).toBe(false);
    expect(Object.is(fracDevicePx, -0)).toBe(false);
  });

  it('a fraction that rounds up to a whole logical px carries into worldPx', () => {
    expect(split(0.9, 3)).toEqual({ worldPx: 1, fracDevicePx: 0 });
  });

  it('clamps to world bounds before splitting', () => {
    const bounds = cameraBounds(720, 391);
    expect(bounds).toEqual({ minX: 0, maxX: 329 });
    expect(split(-5, 3, bounds)).toEqual({ worldPx: 0, fracDevicePx: 0 });
    expect(split(1000, 3, bounds)).toEqual({ worldPx: 329, fracDevicePx: 0 });
    expect(split(328.5, 3, bounds)).toEqual({ worldPx: 328, fracDevicePx: 2 });
  });

  it('invariant: worldPx·scale + frac = round(camX·scale), 0 ≤ frac < scale', () => {
    for (const scale of [1, 2, 3, 4, 5]) {
      for (let i = -400; i <= 400; i++) {
        const camX = i * 0.037;
        const { worldPx, fracDevicePx } = split(camX, scale);
        expect(Number.isInteger(worldPx)).toBe(true);
        expect(Number.isInteger(fracDevicePx)).toBe(true);
        expect(fracDevicePx).toBeGreaterThanOrEqual(0);
        expect(fracDevicePx).toBeLessThan(scale);
        expect(worldPx * scale + fracDevicePx).toBe(Math.round(camX * scale) || 0);
      }
    }
  });
});

describe('cameraBounds / clampCamX', () => {
  it('a world narrower than the view pins the camera to 0', () => {
    expect(cameraBounds(300, 391)).toEqual({ minX: 0, maxX: 0 });
  });

  it('non-finite input falls back to the left edge', () => {
    const bounds = cameraBounds(720, 391);
    expect(clampCamX(Number.NaN, bounds)).toBe(0);
    expect(clampCamX(Number.POSITIVE_INFINITY, bounds)).toBe(0);
  });
});

describe('layerOffset', () => {
  it('moves layers by whole logical px scaled by parallax', () => {
    expect(layerOffset(10, 1)).toBe(-10);
    expect(layerOffset(10, 0.5)).toBe(-5);
    expect(layerOffset(11, 0.5)).toBe(-6);
    expect(layerOffset(10, 1.2)).toBe(-12);
    expect(Object.is(layerOffset(10, 0), 0)).toBe(true);
  });
});

// Plan M2-03: both zoom levels show a window of the same worldRT (laid out at the normal level). The closer level
// scales it by s+1 and may move vertically (camera y) inside the normal frame.
describe('levelView', () => {
  const PHONES = [
    [1170, 2532],
    [1080, 2400],
    [1442, 3202],
  ] as const;

  it('normal level: the whole frame, no vertical room', () => {
    const vp = computeViewport(1170, 2532, 1);
    expect(levelView(vp, 0, 1920)).toEqual({ scale: 3, viewW: 390, maxY: 0, bounds: { minX: 0, maxX: 1530 } });
  });

  it('closer level on 390×844 @3: ×4, 293 visible columns, 211 rows of vertical room', () => {
    const vp = computeViewport(1170, 2532, 1);
    // visible: ceil(1170 / 4) = 293 columns, ceil(2532 / 4) = 633 rows of the 844-row frame.
    expect(levelView(vp, 1, 1920)).toEqual({ scale: 4, viewW: 293, maxY: 211, bounds: { minX: 0, maxX: 1627 } });
  });

  it.each(PHONES)('%i×%i: worldRT covers the closer window at every camera x/y in bounds', (deviceW, deviceH) => {
    const vp = computeViewport(deviceW, deviceH, 1);
    const rt = worldTargetSize(vp);
    const { scale, maxY } = levelView(vp, 1, 1920);
    for (let frac = 0; frac < scale; frac++) expect(rt.width * scale - frac).toBeGreaterThanOrEqual(deviceW);
    // The lowest window still reaches the bottom of the screen inside worldRT.
    expect((rt.height - maxY) * scale).toBeGreaterThanOrEqual(deviceH);
    expect(maxY).toBeGreaterThan(0);
  });
});

// Review (art-director, M2-03): at the closer level the sky band moves down by just enough whole rows to keep the
// sun/moon disc in the window (translation only), never more than camera y, never below the horizon.
describe('skyShift', () => {
  const HORIZON = 355;
  const MARGIN = 12;

  it('nothing at the normal level or with the disc already in the window', () => {
    expect(skyShift({ camY: 0, discRow: 32, horizon: HORIZON, margin: MARGIN })).toBe(0);
    expect(skyShift({ camY: 106, discRow: 305, horizon: HORIZON, margin: MARGIN })).toBe(0);
    expect(skyShift({ camY: 106, discRow: null, horizon: HORIZON, margin: MARGIN })).toBe(0);
  });

  it('a high noon sun is brought down into the window with a margin', () => {
    const k = skyShift({ camY: 106, discRow: 32, horizon: HORIZON, margin: MARGIN });
    expect(k).toBe(106 + MARGIN - 32);
    expect(Number.isInteger(k)).toBe(true);
  });

  it('never more than camera y, never pushes the disc under the horizon', () => {
    expect(skyShift({ camY: 20, discRow: 0, horizon: HORIZON, margin: MARGIN })).toBe(20);
    expect(skyShift({ camY: 211, discRow: 200, horizon: 230, margin: MARGIN })).toBe(230 - MARGIN - 200);
    expect(skyShift({ camY: 211, discRow: 300, horizon: 230, margin: MARGIN })).toBe(0);
  });
});
