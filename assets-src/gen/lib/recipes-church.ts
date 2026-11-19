// Pixel recipes, set 3: the Pokrova church and its belfry (plan ART-12, ART-BIBLE §5 "Дошки й ґонт", §6: wooden,
// Cossack baroque, pear domes with ґонт, gold crosses). Like sets 1–2, builders plot exact ramp steps per px role.
// The dome follows a Cossack-baroque profile (widest low, an even taper, no waist), is shaded from its normals (sun
// top-left) and quantized per ґонт scale, with a warm sun-side rim the low sun catches.
import { Plot } from './plot.ts';

/** Integer hash → 0..1. */
function hash(a: number, b: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Light from the top-left, a little in front (ART-BIBLE §3).
const L = (() => {
  const v = [-0.6, -0.55, 0.58];
  const n = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return v.map((c) => c / n);
})();

/**
 * Cossack-baroque dome profile (art-director ART-12): the widest point in the lower third, an even taper into a short
 * neck — no waist (a pinched neck over a mid-height bulb reads as the onion of another tradition). Radius as a share
 * of the half-width over the height t (0 = base … 1 = tip), piecewise linear between these points.
 */
const BAROQUE: readonly (readonly [number, number])[] = [
  [0, 0.84],
  [0.12, 0.97],
  [0.26, 1],
  [0.42, 0.95],
  [0.56, 0.8],
  [0.7, 0.55],
  [0.82, 0.32],
  [0.92, 0.16],
  [1, 0.06],
];
function baroqueRadius(t: number): number {
  for (let i = 1; i < BAROQUE.length; i++) {
    const [t1, r1] = BAROQUE[i] ?? [1, 0];
    const [t0, r0] = BAROQUE[i - 1] ?? [0, 0];
    if (t <= t1) return r0 + ((r1 - r0) * (t - t0)) / Math.max(1e-6, t1 - t0);
  }
  return 0;
}

/**
 * Dome sheathing (plan M2-09): `wood` ґонт (tier I), `tin` (stone 2–5, a stone 6 rim and glint, no weathering) or
 * `gilt` (gold 1–4, a gold 5 rim and glint). The ґонт scale bands and the sun-side rim stay in every skin.
 */
export type DomeSkin = 'wood' | 'tin' | 'gilt';

/**
 * Баня: the baroque profile `w` px wide (1–2 px wider than its drum each side), `h` tall, on row `base`, centred on
 * `cx`. ґонт scales in 2-row bands offset by half a scale, a scale's lower edge one step darker. Body shade from the
 * profile normal, wood 1 (shade) … wood 4 (lit) — a step below the walls, so the domes separate from the logs; on the
 * sun side a 1-px wood 6 rim on the top-left edge and 2–3 px of gold 4 at the upper-left shoulder: the bright edge the
 * golden hour catches. Weathering: straight 1-px vertical runs of 3 rows on the shaded right side and the lower bulge
 * (stone 3; stone 4 where lit), never the top 2 bands. Returns the tip row.
 */
export function pearDome(
  plot: Plot,
  cx: number,
  base: number,
  w: number,
  h: number,
  seed: number,
  skin: DomeSkin = 'wood',
): number {
  const half = w / 2;
  const inside = (x: number, y: number): boolean => {
    if (y < base - h || y >= base) return false;
    const r = baroqueRadius((base - (y + 0.5)) / h) * half;
    return Math.abs(x + 0.5 - cx) < r;
  };
  let tip = base;
  const bands = Math.ceil(h / 2);
  for (let py = base - h; py < base; py++) {
    const t = (base - (py + 0.5)) / h;
    const radius = baroqueRadius(t) * half;
    if (radius < 0.5) continue;
    tip = Math.min(tip, py);
    const slope = ((baroqueRadius(Math.max(0, t - 0.02)) - baroqueRadius(Math.min(1, t + 0.02))) / 0.04) * (half / h);
    for (let px = Math.floor(cx - radius); px < Math.ceil(cx + radius); px++) {
      const s = (px + 0.5 - cx) / radius;
      if (s < -1 || s > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - s * s));
      const len = Math.hypot(s, slope, nz) || 1;
      const lit = Math.max(0, (s * (L[0] ?? 0) + slope * (L[1] ?? 0) + nz * (L[2] ?? 0)) / len);
      const band = Math.floor((base - py) / 2);
      const lowerEdge = (base - py) % 2 === 1;
      let shade = Math.max(1, Math.min(4, Math.round(1 + lit * 3.2) - (lowerEdge ? 1 : 0)));
      // Sun-side rim and gold glints.
      const rim = s < 0 && !inside(px - 1, py - 1);
      if (rim && t < 0.9) shade = 6;
      const shoulder = s < -0.35 && s > -0.75 && t > 0.3 && t < 0.42 && rim;
      // Weathering: straight 1-px vertical runs, 3 rows tall, on every 4th px column (no horizontal neighbours, so
      // they never curl into glyphs), shaded side / lower bulge only, never the top 2 bands.
      const runRow = Math.floor((base - py) / 3);
      const weathered =
        band < bands - 2 && (s > 0.15 || t < 0.35) && px % 4 === 1 && hash(px * 31 + runRow, seed) < 0.18 && !rim;
      if (skin === 'tin') plot.set(px, py, 'stone', shoulder || shade === 6 ? 6 : shade + 1);
      // Gilt (art-director M2-09): the body never below gold 2 (gold 1 went navy under the night grade), the sun-side
      // rim a cool 1-px stone 5 line — the sheen by day, the moon's rim at night.
      else if (skin === 'gilt') {
        if (shade === 6 && !shoulder) plot.set(px, py, 'stone', 5);
        else plot.set(px, py, 'gold', shoulder ? 5 : Math.max(2, shade));
      } else if (shoulder) plot.set(px, py, 'gold', 4);
      else if (weathered) plot.set(px, py, 'stone', lit > 0.55 ? 4 : 3);
      else plot.set(px, py, 'wood', shade);
    }
  }
  return tip;
}

/**
 * Ліхтар + маківка: a `rows`-row lantern drum 4 wide on row `base` and a small baroque cupola (`skin`) on it. Returns
 * the tip.
 */
export function lanternTop(
  plot: Plot,
  cx: number,
  base: number,
  seed: number,
  rows = 4,
  skin: DomeSkin = 'wood',
): number {
  for (let y = base - rows; y < base; y++) {
    for (let x = cx - 2; x < cx + 2; x++) plot.set(x, y, 'wood', x < cx - 1 ? 5 : x < cx ? 3 : 2);
  }
  return pearDome(plot, cx, base - rows, 7, 7, seed, skin);
}

/**
 * Barrel: an octagonal plank drum `w` × `h` from row `top`: vertical boards with 1-px seams, the left faces lit
 * (wood 4/5), the front wood 3, the right faces in shade (wood 2/1). A slit window (lit at night) in the middle.
 */
export function drum(
  plot: Plot,
  glow: Plot | null,
  spec: { cx: number; top: number; w: number; h: number; window?: boolean; twin?: boolean },
): void {
  const x0 = Math.round(spec.cx - spec.w / 2);
  for (let y = spec.top; y < spec.top + spec.h; y++) {
    for (let x = x0; x < x0 + spec.w; x++) {
      const u = (x - x0) / Math.max(1, spec.w - 1);
      const seam = (x - x0) % 3 === 2;
      const face = u < 0.25 ? (u < 0.1 ? 5 : 4) : u > 0.75 ? (u > 0.9 ? 1 : 2) : 3;
      plot.set(x, y, 'wood', seam ? Math.max(0, face - 1) : face);
    }
  }
  if (spec.window && spec.h >= 7) {
    const wy = spec.top + Math.floor(spec.h / 2) - 2;
    // One 2×4 slit in the middle, or (twin) a 1×3 slit on each front face, the right one 2 rows lower — a lit
    // lantern tower at night, not a "face".
    const slits = spec.twin
      ? [
          { x: Math.round(spec.cx - spec.w / 4), y: wy, w: 1, h: 3 },
          { x: Math.round(spec.cx + spec.w / 4), y: wy + 2, w: 1, h: 3 },
        ]
      : [{ x: Math.round(spec.cx) - 1, y: wy, w: 2, h: 4 }];
    for (const r of slits) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          plot.set(x, y, 'ink', 1);
          glow?.set(x, y, 'gold', 4);
        }
      }
    }
  }
}

/**
 * Піддашшя (skirt roof): a band of ґонт shingles `w` wide at the eave, sloping in by `h` px each side up to row `top`;
 * shingle rows offset per row, the left half lit (wood 4/5), the right half shaded (wood 2), a dark eave line.
 */
export function skirtRoof(plot: Plot, cx: number, top: number, h: number, w: number): void {
  for (let y = top; y < top + h; y++) {
    const r = y - top;
    const half = w / 2 - (h - 1 - r);
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      const left = x < cx;
      const shingle = (x + (r % 2) * 2) % 4 === 0;
      let shade = left ? (shingle ? 5 : 4) : shingle ? 1 : 2;
      if (r === h - 1) shade = left ? 2 : 1;
      // 1-px wood 6 rim along the sun side: the low sun catches the shingle edge.
      if (left && (r === 0 || x === Math.round(cx - half))) shade = 6;
      plot.set(x, y, 'wood', shade);
    }
  }
}

/** Gold cross: a 1-px upright `h` tall from row `top`, a crossbar 5 wide and a short lower slanted bar (Orthodox). */
export function goldCross(plot: Plot, cx: number, top: number, h: number): void {
  for (let y = top; y < top + h; y++) plot.set(cx, y, 'gold', y < top + 3 ? 5 : 4);
  for (let x = cx - 2; x <= cx + 2; x++) plot.set(x, top + 2, 'gold', x < cx ? 5 : 3);
  plot.set(cx - 1, top + Math.floor(h * 0.7), 'gold', 3);
  plot.set(cx + 1, top + Math.floor(h * 0.7) - 1, 'gold', 3);
  plot.set(cx, top - 1, 'gold', 5);
}
