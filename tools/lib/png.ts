// Minimal PNG codec on node:zlib (8-bit RGB/RGBA, non-interlaced) — no PNG dependency (small supply chain).
// Used by `pnpm sprites` (encode atlases) and the e2e pixel checks (decode Playwright screenshots).
// Anything outside that subset throws, so an unexpected format fails loudly instead of lying.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes per px. */
  readonly data: Uint8Array;
}

/** PNG row filter types (0 none, 1 sub, 2 up, 3 average, 4 paeth). */
export type PngFilter = 0 | 1 | 2 | 3 | 4;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_TYPE_CHANNELS: Readonly<Record<number, number>> = { 2: 3, 6: 4 };
const RGBA_COLOR_TYPE = 6;

export interface EncodeOptions {
  /** Filter per row, cycled (default `[0]`). Fixed filters + fixed zlib level keep the bytes deterministic. */
  readonly filters?: readonly PngFilter[];
}

/** Encodes RGBA as an 8-bit RGBA PNG with only IHDR, IDAT and IEND (no time or text chunks). */
export function encodePng(image: RgbaImage, options: EncodeOptions = {}): Buffer {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`PNG size must be positive integers, got ${String(width)}×${String(height)}`);
  }
  if (data.length !== width * height * 4) throw new RangeError('PNG data length is not width × height × 4');
  const filters = options.filters ?? [0];
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  const at = (x: number, y: number): number => (x < 0 || y < 0 ? 0 : (data[y * stride + x] ?? 0));
  for (let y = 0; y < height; y++) {
    const filter = filters[y % filters.length] ?? 0;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const predicted = predict(filter, at(x - 4, y), at(x, y - 1), at(x - 4, y - 1));
      raw[y * (stride + 1) + 1 + x] = (at(x, y) - predicted) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, RGBA_COLOR_TYPE, 0, 0, 0], 8);
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

export function decodePng(png: Buffer): RgbaImage {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [bitDepth, colorType, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      channels = COLOR_TYPE_CHANNELS[colorType ?? -1] ?? 0;
      if (bitDepth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(
          `unsupported PNG: depth ${String(bitDepth)}, color ${String(colorType)}, interlace ${String(interlace)}`,
        );
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== height * (stride + 1)) throw new Error('PNG data size mismatch');
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) unfilterRow(raw, y, stride, channels, rows);

  const data = new Uint8Array(width * height * 4);
  for (let i = 0, o = 0; i < rows.length; i += channels, o += 4) {
    data[o] = rows[i] ?? 0;
    data[o + 1] = rows[i + 1] ?? 0;
    data[o + 2] = rows[i + 2] ?? 0;
    data[o + 3] = channels === 4 ? (rows[i + 3] ?? 0) : 255;
  }
  return { width, height, data };
}

function unfilterRow(raw: Buffer, y: number, stride: number, bpp: number, out: Uint8Array): void {
  const filter = raw[y * (stride + 1)] ?? -1;
  if (filter < 0 || filter > 4) throw new Error(`bad PNG filter ${String(filter)} at row ${String(y)}`);
  const src = y * (stride + 1) + 1;
  const dst = y * stride;
  for (let x = 0; x < stride; x++) {
    const value = raw[src + x] ?? 0;
    const a = x >= bpp ? (out[dst + x - bpp] ?? 0) : 0;
    const b = y > 0 ? (out[dst - stride + x] ?? 0) : 0;
    const c = x >= bpp && y > 0 ? (out[dst - stride + x - bpp] ?? 0) : 0;
    out[dst + x] = (value + predict(filter, a, b, c)) & 0xff;
  }
}

/** Predictor of filter `filter` from left `a`, up `b`, up-left `c` (PNG spec §9). */
function predict(filter: number, a: number, b: number, c: number): number {
  switch (filter) {
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return (a + b) >> 1;
    case 4:
      return paeth(a, b, c);
    default:
      return 0;
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
