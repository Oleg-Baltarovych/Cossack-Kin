// Grading LUT generator (plan ART-04): one 16³ LUT per time-of-day key, laid out as a 256×16 strip
// (x = b·16 + r, y = g) — the pixi-filters `ColorMapFilter` format. Every tint comes from the master palette
// (`GRADE_LOOKS` in src/render/atmosphere/config.ts) and each entry is pulled toward its nearest palette color
// by `snap`. Deterministic: only + − × ÷ and Math.round (no engine-dependent Math functions), fixed order.
import {
  GRADE_LOOKS,
  LUT_SIZE,
  type ColorRef,
  type GradeLook,
  type SkyKeyId,
} from '../../src/render/atmosphere/config.ts';

export type Rgb = readonly [number, number, number];

export interface PaletteColors {
  readonly ramps: Readonly<Record<string, readonly Rgb[]>>;
  /** Every palette color (for snapping). */
  readonly all: readonly Rgb[];
}

export const LUT_WIDTH = LUT_SIZE * LUT_SIZE;
export const LUT_HEIGHT = LUT_SIZE;

export function paletteColors(master: { ramps: Record<string, readonly string[]> }): PaletteColors {
  const ramps: Record<string, Rgb[]> = {};
  for (const [name, colors] of Object.entries(master.ramps)) {
    ramps[name] = colors.map((hex) => {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`palette: bad color ${hex} in ramp ${name}`);
      return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
      ] as const;
    });
  }
  return { ramps, all: Object.values(ramps).flat() };
}

function resolve(palette: PaletteColors, [ramp, index]: ColorRef): Rgb {
  const color = palette.ramps[ramp]?.[index];
  if (!color) throw new Error(`LUT: palette has no ${ramp}[${String(index)}]`);
  return color;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Grades one color (channels 0..1). */
function grade(look: GradeLook, palette: PaletteColors, input: Rgb): [number, number, number] {
  let [r, g, b] = input;
  // Saturation and contrast around mid grey, then exposure.
  const y0 = luma(r, g, b);
  r = clamp01(((y0 + (r - y0) * look.saturation - 0.5) * look.contrast + 0.5) * look.exposure);
  g = clamp01(((y0 + (g - y0) * look.saturation - 0.5) * look.contrast + 0.5) * look.exposure);
  b = clamp01(((y0 + (b - y0) * look.saturation - 0.5) * look.contrast + 0.5) * look.exposure);

  // Tone curve: luminance remapped through the key's points (hue kept). The scotopic input weights model
  // night vision (greens and blues stay brighter than reds), which keeps equally bright green and brown apart.
  if (look.curve) {
    const yIn = look.scotopic ? 0.05 * r + 0.55 * g + 0.4 * b : luma(r, g, b);
    const yOut = curveAt(look.curve, yIn);
    const yNow = luma(r, g, b);
    if (yNow > 0) {
      const k = yOut / yNow;
      r = clamp01(r * k);
      g = clamp01(g * k);
      b = clamp01(b * k);
    } else {
      r = g = b = yOut;
    }
  }

  // Split toning: shadows / mids / lights take the tint's hue at the pixel's own luminance.
  const y = luma(r, g, b);
  const tone = (tint: ColorRef, amount: number): void => {
    const weight = amount > 1 ? 1 : amount;
    if (weight <= 0) return;
    const [tr, tg, tb] = resolve(palette, tint);
    const ty = luma(tr, tg, tb) / 255;
    const k = ty > 0 ? y / ty / 255 : 0;
    r = clamp01(r + (tr * k - r) * weight);
    g = clamp01(g + (tg * k - g) * weight);
    b = clamp01(b + (tb * k - b) * weight);
  };
  tone(look.shadowTint, (1 - y) * (1 - y) * look.shadowAmount);
  if (look.midTint) tone(look.midTint, 4 * y * (1 - y) * (look.midAmount ?? 0));
  tone(look.lightTint, y * look.lightAmount);

  // Lift: black becomes lift · amount, white stays white.
  if (look.liftAmount > 0) {
    const [lr, lg, lb] = resolve(palette, look.lift);
    const a = look.liftAmount / 255;
    r = lr * a + (1 - lr * a) * r;
    g = lg * a + (1 - lg * a) * g;
    b = lb * a + (1 - lb * a) * b;
  }

  if (look.snap > 0) {
    const [pr, pg, pb] = nearest(palette, r * 255, g * 255, b * 255);
    r += (pr / 255 - r) * look.snap;
    g += (pg / 255 - g) * look.snap;
    b += (pb / 255 - b) * look.snap;
  }
  return [r, g, b];
}

/** Piecewise-linear curve through `[in, out]` points sorted by `in` (clamped at both ends). */
function curveAt(points: readonly (readonly [number, number])[], x: number): number {
  const first = points[0];
  if (!first) return x;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] ?? first;
    const [x0, y0] = points[i - 1] ?? first;
    if (x <= x1) return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1;
  }
  return points[points.length - 1]?.[1] ?? x;
}

/** Nearest palette color by luma-weighted RGB distance (first wins on ties: palette order is fixed). */
function nearest(palette: PaletteColors, r: number, g: number, b: number): Rgb {
  let best: Rgb = [0, 0, 0];
  let bestD = Infinity;
  for (const c of palette.all) {
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    const d = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** RGBA bytes of the 256×16 LUT strip for one key. */
export function buildLut(look: GradeLook, palette: PaletteColors): Uint8Array {
  const n = LUT_SIZE;
  const out = new Uint8Array(LUT_WIDTH * LUT_HEIGHT * 4);
  for (let g = 0; g < n; g++) {
    for (let b = 0; b < n; b++) {
      for (let r = 0; r < n; r++) {
        const [or, og, ob] = grade(look, palette, [r / (n - 1), g / (n - 1), b / (n - 1)]);
        const i = (g * LUT_WIDTH + b * n + r) * 4;
        out[i] = Math.round(or * 255);
        out[i + 1] = Math.round(og * 255);
        out[i + 2] = Math.round(ob * 255);
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

export function buildAllLuts(palette: PaletteColors): Record<SkyKeyId, Uint8Array> {
  return {
    dawn: buildLut(GRADE_LOOKS.dawn, palette),
    morning: buildLut(GRADE_LOOKS.morning, palette),
    day: buildLut(GRADE_LOOKS.day, palette),
    golden: buildLut(GRADE_LOOKS.golden, palette),
    dusk: buildLut(GRADE_LOOKS.dusk, palette),
    night: buildLut(GRADE_LOOKS.night, palette),
  };
}

/** Trilinear lookup of a 0..255 color, like the shader does (for tests and tools). */
export function lutLookup(lut: Uint8Array, [r, g, b]: Rgb): [number, number, number] {
  const n = LUT_SIZE;
  const f = (v: number): [number, number, number] => {
    const p = (v / 255) * (n - 1);
    const i0 = Math.min(n - 1, Math.floor(p));
    return [i0, Math.min(n - 1, i0 + 1), p - i0];
  };
  const [r0, r1, rt] = f(r);
  const [g0, g1, gt] = f(g);
  const [b0, b1, bt] = f(b);
  const at = (ri: number, gi: number, bi: number, c: number): number =>
    lut[(gi * LUT_WIDTH + bi * n + ri) * 4 + c] ?? 0;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const l = (x0: number, x1: number, t: number): number => x0 + (x1 - x0) * t;
    const c00 = l(at(r0, g0, b0, c), at(r1, g0, b0, c), rt);
    const c10 = l(at(r0, g1, b0, c), at(r1, g1, b0, c), rt);
    const c01 = l(at(r0, g0, b1, c), at(r1, g0, b1, c), rt);
    const c11 = l(at(r0, g1, b1, c), at(r1, g1, b1, c), rt);
    out[c] = Math.round(l(l(c00, c10, gt), l(c01, c11, gt), bt));
  }
  return out;
}
