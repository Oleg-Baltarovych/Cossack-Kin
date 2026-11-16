// Pure e2e helpers (plan M0-07): the pixel-grid check must reject blur, wrong offsets and wrong scale,
// and the PNG decoder must undo every filter type Chromium emits.
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { checkPixelGrid } from '../../e2e/helpers/pixelGrid.ts';
import { decodePng, type RgbaImage } from '../../e2e/helpers/png.ts';

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

/** Encodes RGBA with a given filter type per row (0..4), the inverse of what decodePng undoes. */
function encodePng(image: RgbaImage, filters: number[]): Buffer {
  const { width, height, data } = image;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  const at = (x: number, y: number): number => (x < 0 || y < 0 ? 0 : (data[y * stride + x] ?? 0));
  for (let y = 0; y < height; y++) {
    const filter = filters[y % filters.length] ?? 0;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const a = at(x - 4, y);
      const b = at(x, y - 1);
      const c = at(x - 4, y - 1);
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const predicted = [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
      raw[y * (stride + 1) + 1 + x] = (at(x, y) - predicted) & 0xff;
    }
  }
  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body, Buffer.alloc(4)]); // CRC is not verified by the decoder
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('decodePng', () => {
  it('round-trips all five row filters', () => {
    const image = upscale(LOGICAL, 2, 1, 9);
    const decoded = decodePng(encodePng(image, [0, 1, 2, 3, 4]));
    expect(decoded.width).toBe(image.width);
    expect(decoded.height).toBe(image.height);
    expect(Buffer.from(decoded.data).equals(Buffer.from(image.data))).toBe(true);
  });

  it('rejects non-PNG input', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow('not a PNG');
  });
});
