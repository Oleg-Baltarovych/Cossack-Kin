// Minimal PNG decoder for Playwright screenshots (8-bit RGB/RGBA, non-interlaced) on node:zlib — avoids a
// PNG dependency for e2e. Anything else throws, so an unexpected format fails loudly instead of lying.
import { inflateSync } from 'node:zlib';

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes per px. */
  readonly data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_TYPE_CHANNELS: Readonly<Record<number, number>> = { 2: 3, 6: 4 };

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
  const filter = raw[y * (stride + 1)];
  const src = y * (stride + 1) + 1;
  const dst = y * stride;
  for (let x = 0; x < stride; x++) {
    const value = raw[src + x] ?? 0;
    const a = x >= bpp ? (out[dst + x - bpp] ?? 0) : 0;
    const b = y > 0 ? (out[dst - stride + x] ?? 0) : 0;
    const c = x >= bpp && y > 0 ? (out[dst - stride + x - bpp] ?? 0) : 0;
    let predicted: number;
    switch (filter) {
      case 0:
        predicted = 0;
        break;
      case 1:
        predicted = a;
        break;
      case 2:
        predicted = b;
        break;
      case 3:
        predicted = (a + b) >> 1;
        break;
      case 4:
        predicted = paeth(a, b, c);
        break;
      default:
        throw new Error(`bad PNG filter ${String(filter)} at row ${String(y)}`);
    }
    out[dst + x] = (value + predicted) & 0xff;
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
