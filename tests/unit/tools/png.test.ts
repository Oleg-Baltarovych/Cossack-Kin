// PNG codec (tools/lib/png.ts): used by `pnpm sprites` to write atlases and by e2e to read screenshots.
import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, MAX_PNG_SIDE, type RgbaImage } from '../../../tools/lib/png.ts';

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

/** Assembles a PNG from raw chunks with correct CRCs (unless `badCrc`). */
function build(list: readonly { type: string; body: Buffer; badCrc?: boolean }[]): Buffer {
  const parts = list.map(({ type, body, badCrc }) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((crc32(Buffer.concat([head.subarray(4), body])) ^ (badCrc ? 1 : 0)) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
  });
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...parts]);
}

function ihdr(width: number, height: number): Buffer {
  const body = Buffer.alloc(13);
  body.writeUInt32BE(width, 0);
  body.writeUInt32BE(height, 4);
  body.set([8, 6, 0, 0, 0], 8);
  return body;
}

describe('decodePng hardening (untrusted input)', () => {
  const ok = chunks(encodePng(sample(4, 3)));
  const IHDR = ok[0]?.body ?? Buffer.alloc(0);
  const IDAT = ok[1]?.body ?? Buffer.alloc(0);
  const IEND = Buffer.alloc(0);

  it.each([
    [
      'IHDR not first',
      () =>
        build([
          { type: 'IDAT', body: IDAT },
          { type: 'IHDR', body: IHDR },
          { type: 'IEND', body: IEND },
        ]),
      'IHDR',
    ],
    [
      'IHDR of the wrong length',
      () =>
        build([
          { type: 'IHDR', body: Buffer.alloc(12) },
          { type: 'IEND', body: IEND },
        ]),
      'IHDR',
    ],
    [
      'missing IEND',
      () =>
        build([
          { type: 'IHDR', body: IHDR },
          { type: 'IDAT', body: IDAT },
        ]),
      'IEND',
    ],
    [
      'no IDAT',
      () =>
        build([
          { type: 'IHDR', body: IHDR },
          { type: 'IEND', body: IEND },
        ]),
      'IDAT',
    ],
    [
      'bad CRC',
      () =>
        build([
          { type: 'IHDR', body: IHDR, badCrc: true },
          { type: 'IDAT', body: IDAT },
          { type: 'IEND', body: IEND },
        ]),
      'CRC',
    ],
    [
      'zero width',
      () =>
        build([
          { type: 'IHDR', body: ihdr(0, 3) },
          { type: 'IDAT', body: IDAT },
          { type: 'IEND', body: IEND },
        ]),
      'size',
    ],
    [
      'huge dimensions',
      () =>
        build([
          { type: 'IHDR', body: ihdr(MAX_PNG_SIDE + 1, 100_000) },
          { type: 'IDAT', body: IDAT },
          { type: 'IEND', body: IEND },
        ]),
      'size',
    ],
    ['truncated chunk', () => encodePng(sample(4, 3)).subarray(0, 40), 'truncated'],
    ['truncated signature', () => Buffer.from([0x89, 0x50]), 'not a PNG'],
  ])('rejects %s with a clean error', (_name, make, message) => {
    expect(() => decodePng(make())).toThrow(message);
  });

  it('stops a zip bomb at the expected size instead of inflating it', () => {
    // 1×1 px declares 5 bytes of image data; the IDAT inflates to 64 MB.
    const bomb = deflateSync(Buffer.alloc(64 * 1024 * 1024));
    const png = build([
      { type: 'IHDR', body: ihdr(1, 1) },
      { type: 'IDAT', body: bomb },
      { type: 'IEND', body: IEND },
    ]);
    const started = performance.now();
    expect(() => decodePng(png)).toThrow('PNG data');
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
