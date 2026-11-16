// PNG codec (tools/lib/png.ts): used by `pnpm sprites` to write atlases and by e2e to read screenshots.
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, type RgbaImage } from '../../../tools/lib/png.ts';

/** A small image with varied channels and alpha so every filter predictor has work to do. */
function sample(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set([(i * 37) & 0xff, (i * 11 + 5) & 0xff, 255 - ((i * 23) & 0xff), i % 3 === 0 ? 0 : 255], i * 4);
  }
  return { width, height, data };
}

function chunks(png: Buffer): { type: string; body: Buffer; crc: number }[] {
  const out: { type: string; body: Buffer; crc: number }[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    out.push({
      type: png.toString('latin1', at + 4, at + 8),
      body: png.subarray(at + 8, at + 8 + length),
      crc: png.readUInt32BE(at + 8 + length),
    });
    at += 12 + length;
  }
  return out;
}

describe('encodePng / decodePng', () => {
  it('round-trips all five row filters', () => {
    const image = sample(9, 7);
    const decoded = decodePng(encodePng(image, { filters: [0, 1, 2, 3, 4] }));
    expect(decoded.width).toBe(image.width);
    expect(decoded.height).toBe(image.height);
    expect(Buffer.from(decoded.data).equals(Buffer.from(image.data))).toBe(true);
  });

  it('writes only IHDR, IDAT, IEND with valid CRCs', () => {
    const list = chunks(encodePng(sample(4, 3)));
    expect(list.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    for (const c of list) expect(c.crc).toBe(crc32(Buffer.concat([Buffer.from(c.type, 'latin1'), c.body])) >>> 0);
  });

  it('is byte-deterministic', () => {
    expect(encodePng(sample(16, 16)).equals(encodePng(sample(16, 16)))).toBe(true);
  });

  it('rejects a data length that does not match the size', () => {
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8Array(12) })).toThrow('width × height × 4');
  });

  it('rejects non-PNG input', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow('not a PNG');
  });
});
