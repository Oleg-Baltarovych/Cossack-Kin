// Pure e2e helpers (plan M0-07): the pixel-grid check must reject blur, wrong offsets and wrong scale
// (the PNG codec has its own tests: tests/unit/tools/png.test.ts).
import { describe, expect, it } from 'vitest';
import { checkPixelGrid } from '../../e2e/helpers/pixelGrid.ts';
import type { RgbaImage } from '../../../tools/lib/png.ts';

/** Upscales a logical image (one color index per px) ×scale, shifted left by `frac` device px. */
function upscale(logical: number[][], scale: number, frac: number, deviceW: number): RgbaImage {
  const height = logical.length * scale;
  const data = new Uint8Array(deviceW * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < deviceW; x++) {
      const row = logical[Math.floor(y / scale)] ?? [];
      const v = row[Math.floor((x + frac) / scale)] ?? 0;
      data.set([v * 40, v * 20, 255 - v * 30, 255], (y * deviceW + x) * 4);
    }
  }
  return { width: deviceW, height, data };
}

const LOGICAL = [
  [0, 1, 0, 2, 3],
  [1, 1, 2, 2, 3],
  [4, 0, 0, 1, 2],
];

describe('checkPixelGrid', () => {
  it('passes solid blocks at offset 0 and finds edges on both axes', () => {
    const report = checkPixelGrid(upscale(LOGICAL, 3, 0, 14), { scale: 3, fracDevicePx: 0 });
    expect(report.violations).toEqual([]);
    expect(report.columnEdges).toBeGreaterThan(0);
    expect(report.rowEdges).toBeGreaterThan(0);
  });

  it('accounts for the camera sub-pixel offset', () => {
    const image = upscale(LOGICAL, 4, 2, 17);
    expect(checkPixelGrid(image, { scale: 4, fracDevicePx: 2 }).violations).toEqual([]);
    expect(checkPixelGrid(image, { scale: 4, fracDevicePx: 0 }).violationCount).toBeGreaterThan(0);
  });

  it('rejects a wrong scale', () => {
    expect(checkPixelGrid(upscale(LOGICAL, 2, 0, 10), { scale: 3, fracDevicePx: 0 }).violationCount).toBeGreaterThan(0);
  });

  it('rejects a blurred (blended) device px inside a block', () => {
    const image = upscale(LOGICAL, 3, 0, 15);
    image.data[(4 * 15 + 4) * 4] = 7;
    const report = checkPixelGrid(image, { scale: 3, fracDevicePx: 0 });
    expect(report.violations).toContain('col@4,4');
  });

  it('ignores px outside the checked region', () => {
    const image = upscale(LOGICAL, 3, 0, 15);
    image.data[(8 * 15 + 1) * 4] = 7; // last row
    expect(checkPixelGrid(image, { scale: 3, fracDevicePx: 0 }).violationCount).toBeGreaterThan(0);
    expect(checkPixelGrid(image, { scale: 3, fracDevicePx: 0, y1: 8 }).violations).toEqual([]);
  });
});
