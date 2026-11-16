// Contact sheet for review (plan ART-02): every frame of a generator at ×6 with a px grid (minor line every px,
// major every 8 px) and a clean ×3 preview (≈ phone scale) beside it, labelled with the frame name and its color
// / ramp count (ART-BIBLE §4: ≤ ~16 colors from 3–4 ramps). Pure: tools/contact-sheet.ts does the I/O.
import type { Palette } from '../../../assets-src/gen/lib/palette.ts';
import type { RgbaImage } from '../png.ts';
import type { FrameImage } from './atlas.ts';

export interface ColorStats {
  /** Distinct opaque colors. */
  readonly colors: number;
  /** Ramps those colors come from, sorted. */
  readonly ramps: readonly string[];
}

export function colorStats(image: RgbaImage, palette: Palette): ColorStats {
  const colors = new Set<number>();
  for (let i = 0; i < image.width * image.height; i++) {
    if ((image.data[i * 4 + 3] ?? 0) === 0) continue;
    colors.add(((image.data[i * 4] ?? 0) << 16) | ((image.data[i * 4 + 1] ?? 0) << 8) | (image.data[i * 4 + 2] ?? 0));
  }
  const ramps = new Set<string>();
  for (const c of colors) {
    const entry = palette.colors.get(c);
    if (entry) ramps.add(entry.ramp);
  }
  return { colors: colors.size, ramps: [...ramps].sort() };
}

export interface SheetOptions {
  /** Zoom of the gridded view (default 6). */
  readonly scale?: number;
  /** Zoom of the clean preview (default 3; 0 = none). */
  readonly preview?: number;
  /** Maximum sheet width in px before cells wrap (default 1600). */
  readonly maxWidth?: number;
}

/** 3×5 bitmap font: 5 rows of 3 bits (MSB = left). */
const FONT: Readonly<Record<string, readonly number[]>> = {
  a: [2, 5, 7, 5, 5],
  b: [6, 5, 6, 5, 6],
  c: [3, 4, 4, 4, 3],
  d: [6, 5, 5, 5, 6],
  e: [7, 4, 6, 4, 7],
  f: [7, 4, 6, 4, 4],
  g: [3, 4, 5, 5, 3],
  h: [5, 5, 7, 5, 5],
  i: [7, 2, 2, 2, 7],
  j: [1, 1, 1, 5, 2],
  k: [5, 5, 6, 5, 5],
  l: [4, 4, 4, 4, 7],
  m: [5, 7, 7, 5, 5],
  n: [6, 5, 5, 5, 5],
  o: [2, 5, 5, 5, 2],
  p: [6, 5, 6, 4, 4],
  q: [2, 5, 5, 6, 3],
  r: [6, 5, 6, 5, 5],
  s: [3, 4, 2, 1, 6],
  t: [7, 2, 2, 2, 2],
  u: [5, 5, 5, 5, 7],
  v: [5, 5, 5, 5, 2],
  w: [5, 5, 7, 7, 5],
  x: [5, 5, 2, 5, 5],
  y: [5, 5, 2, 2, 2],
  z: [7, 1, 2, 4, 7],
  '0': [7, 5, 5, 5, 7],
  '1': [2, 6, 2, 2, 7],
  '2': [6, 1, 2, 4, 7],
  '3': [6, 1, 2, 1, 6],
  '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 6, 1, 6],
  '6': [3, 4, 7, 5, 7],
  '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 6],
  '.': [0, 0, 0, 0, 2],
  '-': [0, 0, 7, 0, 0],
  '@': [7, 5, 7, 4, 7],
  '/': [1, 1, 2, 4, 4],
  ' ': [0, 0, 0, 0, 0],
  ':': [0, 2, 0, 2, 0],
};
const GLYPH = 2; // font zoom
const LINE = 6 * GLYPH;

const BG = 0x1c1a22;
const CHECK_A = 0x34313c;
const CHECK_B = 0x2b2833;
const TEXT = 0xd8d4dc;
const WARN = 0xf07a5a;
const BORDER = 0x5a5666;
const GAP = 16;

export function contactSheet(frames: readonly FrameImage[], palette: Palette, options: SheetOptions = {}): RgbaImage {
  const scale = options.scale ?? 6;
  const preview = options.preview ?? 3;
  const maxWidth = options.maxWidth ?? 1600;
  const cells = frames.map((f) => {
    const stats = colorStats(f.image, palette);
    const viewW = f.image.width * scale;
    const previewW = preview > 0 ? f.image.width * preview + GAP / 2 : 0;
    const label = f.name;
    const info = `${String(stats.colors)}c ${String(stats.ramps.length)}r ${stats.ramps.join(' ')}`;
    const textW = Math.max(label.length, info.length) * 4 * GLYPH;
    return {
      frame: f,
      stats,
      label,
      info,
      w: Math.max(viewW + previewW, textW) + 2,
      h: 2 * LINE + 4 + f.image.height * scale + 2,
    };
  });
  // Flow layout, rows wrap at maxWidth.
  const placed: { cell: (typeof cells)[number]; x: number; y: number }[] = [];
  let x = GAP;
  let y = GAP;
  let rowH = 0;
  let width = 0;
  for (const cell of cells) {
    if (x > GAP && x + cell.w > maxWidth) {
      x = GAP;
      y += rowH + GAP;
      rowH = 0;
    }
    placed.push({ cell, x, y });
    x += cell.w + GAP;
    rowH = Math.max(rowH, cell.h);
    width = Math.max(width, x);
  }
  const height = y + rowH + GAP;
  const W = Math.max(1, width);
  const data = new Uint8Array(W * height * 4);
  const put = (px: number, py: number, rgb: number): void => {
    if (px < 0 || py < 0 || px >= W || py >= height) return;
    data.set([(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, 255], (py * W + px) * 4);
  };
  const darken = (rgb: number, k: number): number => {
    const f = (c: number): number => Math.round(c * (1 - k));
    return (f((rgb >> 16) & 0xff) << 16) | (f((rgb >> 8) & 0xff) << 8) | f(rgb & 0xff);
  };
  const text = (s: string, tx: number, ty: number, rgb: number): void => {
    Array.from({ length: s.length }, (_, k) => s.charAt(k).toLowerCase()).forEach((ch, k) => {
      const glyph = FONT[ch] ?? FONT['.'] ?? [];
      glyph.forEach((row, gy) => {
        for (let gx = 0; gx < 3; gx++) {
          if (((row >> (2 - gx)) & 1) === 0) continue;
          for (let a = 0; a < GLYPH; a++)
            for (let b = 0; b < GLYPH; b++) put(tx + k * 4 * GLYPH + gx * GLYPH + a, ty + gy * GLYPH + b, rgb);
        }
      });
    });
  };
  for (let i = 0; i < W * height; i++) data.set([(BG >> 16) & 0xff, (BG >> 8) & 0xff, BG & 0xff, 255], i * 4);

  for (const { cell, x: cx, y: cy } of placed) {
    const img = cell.frame.image;
    const over = cell.stats.colors > 16 || cell.stats.ramps.length > 4;
    text(cell.label, cx, cy, TEXT);
    text(cell.info, cx, cy + LINE, over ? WARN : TEXT);
    const ox = cx + 1;
    const oy = cy + 2 * LINE + 4 + 1;
    const pixel = (sx: number, sy: number): number | null => {
      const o = (sy * img.width + sx) * 4;
      if ((img.data[o + 3] ?? 0) === 0) return null;
      return ((img.data[o] ?? 0) << 16) | ((img.data[o + 1] ?? 0) << 8) | (img.data[o + 2] ?? 0);
    };
    // Gridded ×scale view with a 1 px border.
    for (let py = -1; py <= img.height * scale; py++) {
      for (let px = -1; px <= img.width * scale; px++) {
        if (py < 0 || px < 0 || py === img.height * scale || px === img.width * scale) {
          put(ox + px, oy + py, BORDER);
          continue;
        }
        const sx = Math.floor(px / scale);
        const sy = Math.floor(py / scale);
        const checker = (Math.floor(px / scale) + Math.floor(py / scale)) % 2 === 0 ? CHECK_A : CHECK_B;
        let rgb = pixel(sx, sy) ?? checker;
        const lineX = px % scale === 0;
        const lineY = py % scale === 0;
        if ((lineX && sx % 8 === 0) || (lineY && sy % 8 === 0)) rgb = darken(rgb, 0.3);
        else if (lineX || lineY) rgb = darken(rgb, 0.1);
        put(ox + px, oy + py, rgb);
      }
    }
    if (preview > 0) {
      const qx = ox + img.width * scale + GAP / 2;
      for (let py = 0; py < img.height * preview; py++) {
        for (let px = 0; px < img.width * preview; px++) {
          const c = pixel(Math.floor(px / preview), Math.floor(py / preview));
          const checker = (Math.floor(px / 6) + Math.floor(py / 6)) % 2 === 0 ? CHECK_A : CHECK_B;
          put(qx + px, oy + py, c ?? checker);
        }
      }
    }
  }
  return { width: W, height, data };
}
