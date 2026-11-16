import { describe, expect, it } from 'vitest';
import { cameraBounds, clampCamX, layerOffset, split } from '../../../src/render/camera.ts';

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
