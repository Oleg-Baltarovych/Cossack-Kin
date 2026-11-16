// Time-of-day color grading (ART-04, ADR 001): the 6 key LUTs from `pnpm luts` (public/luts/<HHMM>.png,
// 256×16 strips) are decoded once to CPU memory; the two keys of the current `dayCycle` are blended on the CPU
// into one dynamic texture (rebuilt at most every LUT_UPDATE_MINUTES of game time) that drives a single
// pixi-filters `ColorMapFilter` on the graded world container.
import { BufferImageSource, Texture } from 'pixi.js';
import { ColorMapFilter } from 'pixi-filters';
import { LUT_SIZE, LUT_UPDATE_MINUTES, SKY_KEYS, type SkyKeyId } from './config.ts';
import type { DayCycle } from './dayCycle.ts';

export const LUT_WIDTH = LUT_SIZE * LUT_SIZE;
export const LUT_HEIGHT = LUT_SIZE;
const LUT_BYTES = LUT_WIDTH * LUT_HEIGHT * 4;
const LUT_DIR = `${import.meta.env.BASE_URL}luts/`;

export type LutSet = Readonly<Record<SkyKeyId, Uint8Array>>;

/** out = a·(1 − t) + b·t per byte (rounded); t is clamped to 0..1. Pure. */
export function blendLuts(a: Uint8Array, b: Uint8Array, t: number, out: Uint8Array): void {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  for (let i = 0; i < out.length; i++) {
    const x = a[i] ?? 0;
    out[i] = Math.round(x + ((b[i] ?? 0) - x) * k);
  }
}

/** Time bucket the blended LUT belongs to; a new bucket means a rebuild. */
export function lutBucket(minutes: number): number {
  return Math.floor(minutes / LUT_UPDATE_MINUTES);
}

async function loadLut(file: string): Promise<Uint8Array> {
  const response = await fetch(`${LUT_DIR}${file}`);
  if (!response.ok) throw new Error(`luts/${file}: HTTP ${String(response.status)} — run \`pnpm luts\``);
  // Main-thread decode (CSP: no blob: workers); no color management or premultiplication, so bytes stay exact.
  const bitmap = await createImageBitmap(await response.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    if (bitmap.width !== LUT_WIDTH || bitmap.height !== LUT_HEIGHT) {
      throw new Error(`luts/${file}: expected ${String(LUT_WIDTH)}×${String(LUT_HEIGHT)} px`);
    }
    const canvas = new OffscreenCanvas(LUT_WIDTH, LUT_HEIGHT);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('luts: no 2D context to decode LUTs');
    ctx.drawImage(bitmap, 0, 0);
    return new Uint8Array(ctx.getImageData(0, 0, LUT_WIDTH, LUT_HEIGHT).data.buffer);
  } finally {
    bitmap.close();
  }
}

/** Loads every key LUT; any missing or malformed file rejects (startWorld then marks `data-ready="error"`). */
export async function loadLuts(): Promise<LutSet> {
  const entries = await Promise.all(SKY_KEYS.map(async (key) => [key.id, await loadLut(`${key.lut}.png`)] as const));
  return Object.fromEntries(entries) as Record<SkyKeyId, Uint8Array>;
}

export interface Grading {
  readonly filter: ColorMapFilter;
  /** Rebuilds the blended LUT when the time bucket or the key pair changed. */
  update(cycle: DayCycle, minutes: number): void;
  destroy(): void;
}

export function createGrading(luts: LutSet): Grading {
  const data = new Uint8Array(LUT_BYTES);
  const source = new BufferImageSource({
    resource: data,
    width: LUT_WIDTH,
    height: LUT_HEIGHT,
    // Uint8Array would default to bgra8unorm; the LUT is plain RGBA and fully opaque.
    format: 'rgba8unorm',
    alphaMode: 'no-premultiply-alpha',
    autoGenerateMipmaps: false,
  });
  const texture = new Texture({ source });
  // Linear sampling between the 16 lattice steps (the filter sets the LUT texture's scale mode from `nearest`).
  const filter = new ColorMapFilter({ colorMap: texture, nearest: false, mix: 1 });
  filter.resolution = 1;
  filter.antialias = 'off';

  let lastKey = '';
  return {
    filter,
    update(cycle, minutes) {
      const key = `${String(lutBucket(minutes))}:${cycle.keyA}:${cycle.keyB}`;
      if (key === lastKey) return;
      lastKey = key;
      blendLuts(luts[cycle.keyA], luts[cycle.keyB], cycle.t, data);
      source.update();
    },
    destroy() {
      // ColorMapFilter.destroy() also destroys its colorMap texture.
      filter.destroy();
      source.destroy();
    },
  };
}
