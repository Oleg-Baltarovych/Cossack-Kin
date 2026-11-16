import { describe, expect, it } from 'vitest';
import { computeViewport, worldTargetSize } from '../../../src/render/viewport.ts';

// SPEC §5.1 + plan Q2: scale = max(1, floor(deviceW / 320)); if deviceW / scale > 400 → scale + 1.
describe('computeViewport', () => {
  it.each([
    // deviceW, scale, logicalW
    [319, 1, 319],
    [320, 1, 320],
    [400, 1, 400],
    [720, 2, 360],
    [1080, 3, 360],
    [1170, 3, 390],
    [1279, 4, 319],
    [1280, 4, 320],
    [1440, 4, 360],
  ])('deviceW %i → ×%i, logical width %i', (deviceW, scale, logicalW) => {
    const viewport = computeViewport(deviceW, 800, 1);
    expect(viewport.scale).toBe(scale);
    expect(viewport.logicalW).toBe(logicalW);
    expect(viewport.deviceW).toBe(deviceW);
  });

  it('never exceeds 400 logical px, even when that drops below 320 (clamp wins)', () => {
    expect(computeViewport(401, 800, 1)).toMatchObject({ scale: 2, logicalW: 200 });
    for (let deviceW = 1; deviceW <= 4000; deviceW++) {
      const { scale, logicalW } = computeViewport(deviceW, 800, 1);
      expect(logicalW).toBeLessThanOrEqual(400);
      expect(logicalW * scale).toBeLessThanOrEqual(deviceW);
    }
  });

  it('converts CSS px to device px with the device pixel ratio', () => {
    expect(computeViewport(390, 844, 3)).toEqual({
      scale: 3,
      logicalW: 390,
      logicalH: 844,
      deviceW: 1170,
      deviceH: 2532,
    });
    expect(computeViewport(360, 800, 3)).toEqual({
      scale: 3,
      logicalW: 360,
      logicalH: 800,
      deviceW: 1080,
      deviceH: 2400,
    });
  });

  it('keeps every value an integer for fractional DPR (412×915 @3.5)', () => {
    const viewport = computeViewport(412, 915, 3.5);
    // 915 × 3.5 = 3202.5: floor, so the canvas never overhangs the viewport by a fractional row (an overhang makes
    // the compositor rescale the canvas and drop a device row — found by the ART-05 pixel-grid check).
    expect(viewport).toEqual({ scale: 4, logicalW: 360, logicalH: 800, deviceW: 1442, deviceH: 3202 });
    for (const value of Object.values(viewport)) expect(Number.isInteger(value)).toBe(true);
  });

  it('derives a dynamic height from the same scale', () => {
    expect(computeViewport(1080, 1920, 1).logicalH).toBe(640);
    expect(computeViewport(1080, 2400, 1).logicalH).toBe(800);
  });

  it('falls back to a 1×1 device surface and DPR 1 for degenerate input', () => {
    expect(computeViewport(0, 0, 0)).toEqual({ scale: 1, logicalW: 1, logicalH: 1, deviceW: 1, deviceH: 1 });
    expect(computeViewport(390, 844, Number.NaN)).toMatchObject({ deviceW: 390, scale: 1, logicalW: 390 });
  });
});

describe('worldTargetSize', () => {
  it('worldRT covers the whole canvas for every scale and camera remainder', () => {
    for (let deviceW = 300; deviceW <= 2000; deviceW++) {
      const deviceH = 2 * deviceW + 1;
      for (const scale of new Set([computeViewport(deviceW, deviceH, 1).scale, 1, 2, 3, 4, 5])) {
        const { width, height } = worldTargetSize({ deviceW, deviceH, scale });
        for (let frac = 0; frac < scale; frac++) {
          // The upscale sprite starts at −frac device px and must still reach the right edge.
          expect(
            width * scale - frac,
            `deviceW ${String(deviceW)} ×${String(scale)} frac ${String(frac)}`,
          ).toBeGreaterThanOrEqual(deviceW);
        }
        expect(height * scale).toBeGreaterThanOrEqual(deviceH);
      }
    }
  });

  it('1001 px at ×3 needs 335 logical columns (ceil + 1)', () => {
    expect(worldTargetSize({ deviceW: 1001, deviceH: 800, scale: 3 }).width).toBe(335);
  });
});
