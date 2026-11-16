// Shape primitives for generators (plan ART-02, ADR 004): each returns the covered px with a surface normal and
// local surface coordinates, so a material can texture along the surface and the light pass can shade the form.
// Coverage samples px centres. Only + − × ÷ and Math.sqrt (correctly rounded) feed the output — no sin/cos/pow.
import type { Normal } from './buffer.ts';

/** One covered px. `u`, `v`: surface coordinates, meaning documented per primitive. */
export interface Fragment {
  readonly x: number;
  readonly y: number;
  readonly normal: Normal;
  readonly u: number;
  readonly v: number;
  /** Primitive-specific integer (e.g. tuft id for grass), if any. */
  readonly tag?: number;
}

/** Covered px plus the bounding box (whole px) they were generated in. */
export interface Shape {
  readonly fragments: readonly Fragment[];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const FLAT: Normal = [0, 0, 127];

/** Integer normal of length ≈ 127 pointing along (x, y, z); x right, y down, z toward the viewer. */
export function unitNormal(x: number, y: number, z: number): Normal {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len === 0) return FLAT;
  const c = (v: number): number => Math.max(-127, Math.min(127, Math.round((v / len) * 127)));
  return [c(x), c(y), c(z)];
}

const shape = (fragments: Fragment[], x: number, y: number, w: number, h: number): Shape => ({
  fragments,
  x,
  y,
  w,
  h,
});

/** Axis-aligned rectangle. `u`, `v` = px from the top-left corner. */
export function rect(x: number, y: number, w: number, h: number, normal: Normal = FLAT): Shape {
  const out: Fragment[] = [];
  for (let py = y; py < y + h; py++)
    for (let px = x; px < x + w; px++) out.push({ x: px, y: py, normal, u: px - x, v: py - y });
  return shape(out, x, y, w, h);
}

/** Polygon (even-odd, px centres). `u`, `v` = px from the bounding box's top-left. */
export function poly(points: readonly (readonly [number, number])[], normal: Normal = FLAT): Shape {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const x1 = Math.ceil(Math.max(...xs));
  const y1 = Math.ceil(Math.max(...ys));
  const out: Fragment[] = [];
  for (let py = y0; py < y1; py++) {
    const cy = py + 0.5;
    const cross: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i] ?? [0, 0];
      const b = points[(i + 1) % points.length] ?? [0, 0];
      if (a[1] <= cy === b[1] <= cy) continue;
      cross.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    cross.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cross.length; k += 2) {
      const from = Math.ceil((cross[k] ?? 0) - 0.5) + 0; // + 0: no -0 coordinates
      const to = Math.ceil((cross[k + 1] ?? 0) - 0.5);
      for (let px = from; px < to; px++) out.push({ x: px, y: py, normal, u: px - x0, v: py - y0 });
    }
  }
  return shape(out, x0, y0, x1 - x0, y1 - y0);
}

/**
 * Ellipse centred on (cx, cy) with radii rx, ry. `bulge` 0 = flat disc, 1 = hemisphere normals.
 * `u`, `v` = −1..1 across the ellipse.
 */
export function ellipse(cx: number, cy: number, rx: number, ry: number, bulge = 1): Shape {
  const out: Fragment[] = [];
  const x0 = Math.floor(cx - rx);
  const y0 = Math.floor(cy - ry);
  const x1 = Math.ceil(cx + rx);
  const y1 = Math.ceil(cy + ry);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const u = (px + 0.5 - cx) / rx;
      const v = (py + 0.5 - cy) / ry;
      const d = u * u + v * v;
      if (d > 1) continue;
      const z = Math.sqrt(1 - d);
      out.push({ x: px, y: py, normal: unitNormal(u * bulge, v * bulge, z * bulge + (1 - bulge)), u, v });
    }
  }
  return shape(out, x0, y0, x1 - x0, y1 - y0);
}

/**
 * Log / cylinder of `diameter` px, `length` px along `axis` from (x, y). `u` = px along the axis,
 * `v` = −1..1 across it (−1 = top / left side).
 */
export function log(x: number, y: number, length: number, diameter: number, axis: 'x' | 'y' = 'x'): Shape {
  const out: Fragment[] = [];
  for (let a = 0; a < length; a++) {
    for (let b = 0; b < diameter; b++) {
      const v = ((b + 0.5) / diameter) * 2 - 1;
      const z = Math.sqrt(Math.max(0, 1 - v * v));
      const normal = axis === 'x' ? unitNormal(0, v, z) : unitNormal(v, 0, z);
      out.push(axis === 'x' ? { x: x + a, y: y + b, normal, u: a, v } : { x: x + b, y: y + a, normal, u: a, v });
    }
  }
  return axis === 'x' ? shape(out, x, y, length, diameter) : shape(out, x, y, diameter, length);
}

export type RoofStyle = 'hip' | 'thatch' | 'gable' | 'tent';

export interface RoofSpec {
  readonly style: RoofStyle;
  /** Left edge of the eave line. */
  readonly x: number;
  /** Eave width. */
  readonly w: number;
  /** Ridge row (top). */
  readonly top: number;
  /** Row below the eave (exclusive). */
  readonly bottom: number;
  /** Horizontal inset of the ridge ends from the eave ends (hip/thatch); ignored for gable/tent. */
  readonly inset?: number;
}

/**
 * Roof seen from the long side of the building (the diorama view).
 * - `gable`: rectangular slab, one slope tilted up toward the sky.
 * - `hip`: trapezoid, front slope + two hip triangles (left one faces the sun).
 * - `thatch`: hip with the thick rounded profile of a reed roof — normals turn smoothly over the hips, the ridge
 *   and the eave roll (the eave's last rows face down, so the stricha underside reads dark).
 * - `tent`: pyramid (tower шатро), apex at the centre top.
 * `u` = px from the left eave end, `v` = 0 at the ridge … 1 at the eave.
 */
export function roof(spec: RoofSpec): Shape {
  const { style, x, w, top, bottom } = spec;
  const h = bottom - top;
  const inset = style === 'tent' ? w / 2 : style === 'gable' ? 0 : (spec.inset ?? h * 0.8);
  const out: Fragment[] = [];
  const slope = unitNormal(0, -0.75, 1);
  for (let py = top; py < bottom; py++) {
    const v = (py + 0.5 - top) / h;
    const left = x + inset * (1 - v);
    const right = x + w - inset * (1 - v);
    for (let px = Math.ceil(left - 0.5); px < Math.ceil(right - 0.5); px++) {
      const cx = px + 0.5;
      let normal: Normal;
      if (style === 'gable') {
        normal = slope;
      } else if (style === 'tent') {
        const s = (cx - (x + w / 2)) / (w / 2);
        normal = unitNormal(s * 0.9, -0.55, 1);
      } else if (style === 'hip') {
        normal = cx < x + inset ? unitNormal(-0.8, -0.5, 1) : cx > x + w - inset ? unitNormal(0.8, -0.5, 1) : slope;
      } else {
        // Thatch: side term grows smoothly across the hip; the ridge rounds over, the eave rolls under.
        const half = (right - left) / 2;
        const s = half > 0 ? (cx - (left + right) / 2) / half : 0;
        const edge = Math.max(0, Math.abs(s) - 0.55) / 0.45;
        const side = s < 0 ? -edge : edge;
        const ny = v < 0.12 ? -1.1 : v > 0.86 ? -0.75 + ((v - 0.86) / 0.14) * 2.1 : -0.75;
        normal = unitNormal(side * 0.95, ny, 1);
      }
      out.push({ x: px, y: py, normal, u: px - x, v });
    }
  }
  return shape(out, x, top, w, h);
}

export type DomeStyle = 'onion' | 'pear';

/** Radius profile (fraction of the half-width) from base (t = 0) to tip (t = 1): Catmull-Rom through points. */
const PROFILES: Readonly<Record<DomeStyle, readonly (readonly [number, number])[]>> = {
  onion: [
    [0, 0.72],
    [0.3, 1],
    [0.62, 0.62],
    [0.84, 0.18],
    [1, 0],
  ],
  // Cossack baroque: big lower bulb, waist, small upper bulb (маківка), spire.
  pear: [
    [0, 0.78],
    [0.22, 1],
    [0.46, 0.66],
    [0.58, 0.34],
    [0.7, 0.44],
    [0.84, 0.26],
    [1, 0],
  ],
};

/** Profile radius and its derivative d(radius)/dt at t ∈ [0, 1]. */
export function domeProfile(style: DomeStyle, t: number): { readonly r: number; readonly dr: number } {
  const pts = PROFILES[style];
  const n = pts.length - 1;
  let i = 0;
  while (i < n - 1 && t > (pts[i + 1]?.[0] ?? 1)) i++;
  const p = (k: number): readonly [number, number] => pts[Math.max(0, Math.min(n, k))] ?? [0, 0];
  const [t0, r0] = p(i);
  const [t1, r1] = p(i + 1);
  const span = t1 - t0;
  const m0 = ((p(i + 1)[1] - p(i - 1)[1]) / (p(i + 1)[0] - p(i - 1)[0] || 1)) * span;
  const m1 = ((p(i + 2)[1] - p(i)[1]) / (p(i + 2)[0] - p(i)[0] || 1)) * span;
  const s = span > 0 ? Math.max(0, Math.min(1, (t - t0) / span)) : 0;
  const s2 = s * s;
  const s3 = s2 * s;
  const r = (2 * s3 - 3 * s2 + 1) * r0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * r1 + (s3 - s2) * m1;
  const ds = (6 * s2 - 6 * s) * r0 + (3 * s2 - 4 * s + 1) * m0 + (-6 * s2 + 6 * s) * r1 + (3 * s2 - 2 * s) * m1;
  return { r: Math.max(0, r), dr: span > 0 ? ds / span : 0 };
}

/**
 * Dome of revolution standing on row `base` (exclusive bottom), centred on `cx`, `w` wide and `h` tall.
 * `u` = −1..1 across the dome at that row (for shingle columns), `v` = 0 at the base … 1 at the tip.
 */
export function dome(cx: number, base: number, w: number, h: number, style: DomeStyle): Shape {
  const out: Fragment[] = [];
  const half = w / 2;
  for (let py = base - h; py < base; py++) {
    const t = (base - (py + 0.5)) / h;
    const { r, dr } = domeProfile(style, t);
    const radius = r * half;
    if (radius <= 0) continue;
    const slope = (dr * half) / h; // d(radius px)/d(height px): > 0 → the surface faces down
    for (let px = Math.floor(cx - radius); px < Math.ceil(cx + radius); px++) {
      const s = (px + 0.5 - cx) / radius;
      if (s < -1 || s > 1) continue;
      out.push({ x: px, y: py, normal: unitNormal(s, slope, Math.sqrt(1 - s * s)), u: s, v: t });
    }
  }
  return shape(out, Math.floor(cx - half), base - h, Math.ceil(w), h);
}
