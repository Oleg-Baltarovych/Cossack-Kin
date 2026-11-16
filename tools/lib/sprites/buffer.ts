// Ramp-index pixel buffer (plan §0): generators write (ramp, shade) per px; `quantize` turns it into RGBA by
// picking ramp colors (+ Bayer 4×4 on fractional shades), so every opaque px is a palette color by construction.
// Later ART tasks extend the per-px record (material, normal, partId, depth) for lighting passes.
import type { RgbaImage } from '../png.ts';
import type { Palette } from './palette.ts';

export type RampName = keyof (typeof import('../../../assets-src/palettes/master.json'))['ramps'];

export interface IndexBuffer {
  readonly width: number;
  readonly height: number;
  /**
   * Sets px (x, y) to `ramp` at `shade` (0 = darkest; fractions dither toward the next color; clamped to the
   * ramp). `alpha` 0..1 (default 1); anything but 0 or 1 is legal only in the `fx` atlas.
   */
  set(x: number, y: number, ramp: RampName, shade: number, alpha?: number): void;
  /** Makes px (x, y) transparent. */
  clear(x: number, y: number): void;
  /** Ramp id per px (index into `palette.rampNames`), −1 = transparent. */
  readonly ramp: Int16Array;
  readonly shade: Float32Array;
  readonly alpha: Float32Array;
}

export function createIndexBuffer(width: number, height: number, palette: Palette): IndexBuffer {
  const ramp = new Int16Array(width * height).fill(-1);
  const shade = new Float32Array(width * height);
  const alpha = new Float32Array(width * height);
  const index = (x: number, y: number): number => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
      throw new RangeError(`px (${String(x)}, ${String(y)}) is outside ${String(width)}×${String(height)}`);
    }
    return y * width + x;
  };
  return {
    width,
    height,
    ramp,
    shade,
    alpha,
    set(x, y, name, value, a = 1) {
      const id = palette.rampNames.indexOf(name);
      if (id < 0) throw new Error(`unknown ramp "${name}"`);
      if (!Number.isFinite(value) || !(a >= 0 && a <= 1))
        throw new RangeError(`bad shade/alpha at (${String(x)}, ${String(y)})`);
      const i = index(x, y);
      ramp[i] = id;
      shade[i] = value;
      alpha[i] = a;
    },
    clear(x, y) {
      ramp[index(x, y)] = -1;
    },
  };
}

/** Bayer 4×4 thresholds (0..15). */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Ramp-index buffer → RGBA. Transparent px are written as 0,0,0,0 so output bytes are canonical. */
export function quantize(buffer: IndexBuffer, palette: Palette): RgbaImage {
  const { width, height } = buffer;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const id = buffer.ramp[i] ?? -1;
      const a = Math.round((buffer.alpha[i] ?? 0) * 255);
      if (id < 0 || a === 0) continue;
      const colors = palette.ramps.get(palette.rampNames[id] ?? '') ?? [];
      const top = colors.length - 1;
      const s = Math.min(top, Math.max(0, buffer.shade[i] ?? 0));
      const base = Math.floor(s);
      const threshold = ((BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
      const rgb = colors[Math.min(top, base + (s - base > threshold ? 1 : 0))] ?? 0;
      data.set([(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, a], i * 4);
    }
  }
  return { width, height, data };
}
