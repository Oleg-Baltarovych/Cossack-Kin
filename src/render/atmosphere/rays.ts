// Light shafts (ART-10 spike, ART-BIBLE §8): pure painters for the CPU variants: one palette colour at a stepped
// opacity (RAY_ALPHA_STEPS levels; a 50 % dither of sparse 2-px dots read as a halftone screen), premultiplied, drawn
// additively by the light layer.
// - `shadowMap` + `paintShafts` (variant b, occlusion): a polar shadow map from the sun — per angle, the distance to
//   the first occluder (clouds, bluffs, groves) — then every px nearer the sun than the occluder on its angle is lit:
//   a fan of light with real shadow wedges behind the clouds and the bluffs; painted at ½ resolution (2-px blocks).
// - `paintBeam` (variant c, sprites): one static beam of the fan (no occlusion), its alpha animated by the layer.
// - `dustMotes`: ≤ 40 drifting 1-px motes, shown only where the light is at step ≥ 2, flickering every other frame.
// No Pixi, no DOM.

import { RAY_LOOKS } from './config.ts';
import type { DayCycle } from './dayCycle.ts';
import type { Weather } from '../settings.ts';

/**
 * Opacity of the light shafts (and their dust) for this moment, 0 = none: a low sun above the horizon under a clear
 * sky (ART-BIBLE §8.2; never in rain or fog), level blended between the two sky keys (`RAY_LOOKS`). The light layer
 * also needs the disc on screen; the @screens palette check skips the sky where this is > 0 (additive light).
 */
export function shaftLevel(cycle: DayCycle, weather: Weather): number {
  if (weather !== 'clear' || cycle.sun.y <= -0.02) return 0;
  const a = RAY_LOOKS[cycle.keyA].level;
  const level = a + (RAY_LOOKS[cycle.keyB].level - a) * cycle.t;
  return level > 0.01 ? level : 0;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An ellipse occluder (a cloud footprint). */
export interface EllipseOccluder {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/**
 * Occluders of the shadow map: ellipses (clouds), solved in closed form, and a height field standing on the horizon
 * (bluffs, groves) — `height(x)` px above row `horizon`, never taller than `maxHeight` — marched only inside its band.
 */
export interface Occluders {
  readonly ellipses: readonly EllipseOccluder[];
  readonly horizon: number;
  readonly maxHeight: number;
  readonly height: (x: number) => number;
}

/** Smallest t ≥ `from` where the ray sun + t·(dx, dy) enters ellipse `e`, or Infinity. */
function rayEllipse(sun: Point, dx: number, dy: number, e: EllipseOccluder, from: number): number {
  const ox = (sun.x - e.cx) / e.rx;
  const oy = (sun.y - e.cy) / e.ry;
  const vx = dx / e.rx;
  const vy = dy / e.ry;
  const qa = vx * vx + vy * vy;
  const qb = 2 * (ox * vx + oy * vy);
  const qc = ox * ox + oy * oy - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return Number.POSITIVE_INFINITY;
  const root = Math.sqrt(disc);
  const t0 = (-qb - root) / (2 * qa);
  const t1 = (-qb + root) / (2 * qa);
  if (t1 < from) return Number.POSITIVE_INFINITY;
  return Math.max(t0, from);
}

/**
 * For each of `bins` angles around `sun`, the distance (logical px, ≤ `reach`) at which a ray from the sun first enters
 * an occluder; `reach` where it never does. Rays start 2 px out (the disc itself is not an occluder). Ellipses are
 * intersected analytically; the horizon height field is marched 1 px at a time only across its band — hundreds of
 * times cheaper than marching every ray through every occluder.
 */
export function shadowMap(sun: Point, occ: Occluders, reach: number, bins: number): Float32Array {
  const map = new Float32Array(bins).fill(reach);
  const top = occ.horizon - occ.maxHeight;
  for (let b = 0; b < bins; b++) {
    const a = ((b + 0.5) / bins) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let hit = reach;
    for (const e of occ.ellipses) hit = Math.min(hit, rayEllipse(sun, dx, dy, e, 2));
    // The ray's stretch inside the band [top, horizon).
    let t0 = 2;
    let t1 = hit;
    if (Math.abs(dy) < 1e-6) {
      if (sun.y < top || sun.y >= occ.horizon) t1 = -1;
    } else {
      const ta = (top - sun.y) / dy;
      const tb = (occ.horizon - sun.y) / dy;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    for (let t = Math.ceil(t0); t < t1; t++) {
      const x = Math.round(sun.x + dx * t);
      const y = Math.round(sun.y + dy * t);
      if (y < occ.horizon && occ.horizon - y <= occ.height(x)) {
        hit = t;
        break;
      }
    }
    map[b] = hit;
  }
  return map;
}

/** Bin of the angle from `sun` to (x, y). */
export function binOf(sun: Point, x: number, y: number, bins: number): number {
  const a = Math.atan2(y - sun.y, x - sun.x);
  const t = (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2);
  return Math.min(bins - 1, Math.floor(t * bins));
}

/** Light share 0..1 at logical (x, y): lit and nearer than the shadow on its angle, falling off with distance. */
export function shaftLight(sun: Point, map: Float32Array, reach: number, x: number, y: number): number {
  const d = Math.hypot(x - sun.x, y - sun.y);
  if (d >= reach) return 0;
  if (d > (map[binOf(sun, x, y, map.length)] ?? reach)) return 0;
  const k = 1 - d / reach;
  return k * Math.sqrt(k);
}

/** Opacity levels of the shafts. */
export const RAY_ALPHA_STEPS = 4;

/**
 * Writes `color` at opacity `alpha` (premultiplied). Callers pass stepped values (`cover · step / RAY_ALPHA_STEPS`),
 * so the levels are exact — no second quantization, which merged the upper steps and dropped step 1.
 */
function put(out: Uint8Array, w: number, x: number, y: number, color: number, alpha: number): void {
  if (alpha <= 0) return;
  const k = Math.min(1, alpha);
  const i = (y * w + x) * 4;
  out[i] = Math.round(((color >> 16) & 0xff) * k);
  out[i + 1] = Math.round(((color >> 8) & 0xff) * k);
  out[i + 2] = Math.round((color & 0xff) * k);
  out[i + 3] = Math.round(k * 255);
}

/** Stepped light level 0..RAY_ALPHA_STEPS at distance `d` from the sun: a 40-px core, then falling steps. */
export function shaftStep(d: number, reach: number): number {
  if (d >= reach) return 0;
  if (d < 40) return 4;
  if (d < reach * 0.45) return 3;
  if (d < reach * 0.75) return 2;
  return 1;
}

/** Bayer 2×2 50 % checker. */
const checker = (x: number, y: number): boolean => ((x + y) & 1) === 0;

export interface ShaftOptions {
  readonly reach: number;
  /** Opacity of the core step (the other steps scale down from it). */
  readonly cover: number;
  /** Logical px per buffer px (1 = full resolution, 2 = ½). */
  readonly scale: number;
  /** First ground row: below it the light reaches the meadow at step 1 only. */
  readonly horizon: number;
}

/** Feather of a light/shadow edge, in angle bins: the outer FEATHER_CHECKER bins are a 50 % checker at step 1,
 * the next ones up to FEATHER_BINS one step down (720 bins: 2 + 6 bins ≈ 4°). */
export const FEATHER_BINS = 8;
const FEATHER_CHECKER = 2;
/** Lit runs wider than this many bins (≈ 20°) are broken into faint shafts by static angular bands. */
const WIDE_RUN = 40;

/**
 * Static angular bands over wide lit runs: 1 where the band dims the light one step. Bands are 8–20 bins (4–10°)
 * wide, alternating, seeded by absolute angle — fixed for a given cloud layout, they turn only with the geometry.
 */
export function shaftBands(map: Float32Array, reach: number): Uint8Array {
  const bins = map.length;
  const open = (b: number): boolean => (map[((b % bins) + bins) % bins] ?? 0) >= reach * 0.5;
  const dim = new Uint8Array(bins);
  // Static band pattern over the full circle.
  const pattern = new Uint8Array(bins);
  for (let b = 0, k = 0; b < bins; k++) {
    const width = 8 + Math.floor(hash(k, 91) * 13);
    for (let i = 0; i < width && b < bins; i++, b++) pattern[b] = k % 2;
  }
  // Mark the bins of open runs wider than WIDE_RUN (runs may wrap around 0°).
  let start = 0;
  while (start < bins && open(start)) start++;
  if (start === bins) return pattern; // all open: banded everywhere
  for (let i = 0; i < bins;) {
    const b = (start + i) % bins;
    if (!open(b)) {
      i++;
      continue;
    }
    let len = 0;
    while (len < bins && open(start + i + len)) len++;
    if (len > WIDE_RUN)
      for (let j = 0; j < len; j++) dim[(start + i + j) % bins] = pattern[(start + i + j) % bins] ?? 0;
    i += len;
  }
  return dim;
}

/**
 * Variant b: paints the lit fan into `out` (bw × bh RGBA; buffer px (i, j) covers logical (i·scale, j·scale)), one
 * colour at stepped opacities: a 40-px core, steps 3 → 1 outward, the outer quarter at step 1 on a 50 % checker;
 * light/shadow edges feathered over FEATHER_BINS (one step down, then a checker); wide lit runs broken into faint
 * shafts by static angular bands (`shaftBands`); on the ground only step 1. Transparent in the shadow and beyond the
 * reach.
 */
/** Per buffer px: the angle bin and the distance to the sun (logical px); −1 bin = beyond the reach. */
export interface PolarGrid {
  readonly bin: Int16Array;
  readonly dist: Float32Array;
}

/**
 * Polar coordinates of every buffer px around `sun` — the costly part of a repaint (atan2 + hypot per px). Valid
 * while the sun stays on the same px, so the layer caches it (the sun moves once per game minute or less).
 */
export function polarGrid(bw: number, bh: number, sun: Point, scale: number, reach: number, bins: number): PolarGrid {
  const bin = new Int16Array(bw * bh).fill(-1);
  const dist = new Float32Array(bw * bh);
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const x = i * scale + (scale - 1) / 2;
      const y = j * scale + (scale - 1) / 2;
      const d = Math.hypot(x - sun.x, y - sun.y);
      if (d >= reach) continue;
      bin[j * bw + i] = binOf(sun, x, y, bins);
      dist[j * bw + i] = d;
    }
  }
  return { bin, dist };
}

/**
 * Per bin and feather width k (1..FEATHER_BINS): the nearest shadow among the bins within k on either side — so a
 * px's edge distance is the smallest k with d > near[k][bin] (no per-px neighbour scan).
 */
function featherMins(map: Float32Array): Float32Array[] {
  const bins = map.length;
  const out: Float32Array[] = [new Float32Array(map)];
  for (let k = 1; k <= FEATHER_BINS; k++) {
    const prev = out[k - 1] ?? map;
    const cur = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      cur[b] = Math.min(prev[b] ?? 0, map[(b + k) % bins] ?? 0, map[(b - k + bins) % bins] ?? 0);
    }
    out.push(cur);
  }
  return out;
}

export function paintShafts(
  out: Uint8Array,
  bw: number,
  bh: number,
  sun: Point,
  map: Float32Array,
  color: number,
  { reach, cover, scale, horizon }: ShaftOptions,
  grid: PolarGrid = polarGrid(bw, bh, sun, scale, reach, map.length),
): void {
  out.fill(0);
  const bands = shaftBands(map, reach);
  const near = featherMins(map);
  for (let j = 0; j < bh; j++) {
    const y = j * scale + (scale - 1) / 2;
    for (let i = 0; i < bw; i++) {
      const p = j * bw + i;
      const bin = grid.bin[p] ?? -1;
      if (bin < 0) continue;
      const d = grid.dist[p] ?? reach;
      if (d > (map[bin] ?? reach)) continue;
      let step = shaftStep(d, reach);
      if (step === 0) continue;
      let edge = FEATHER_BINS + 1;
      for (let k = 1; k <= FEATHER_BINS; k++) {
        if (d > (near[k]?.[bin] ?? reach)) {
          edge = k;
          break;
        }
      }
      if (edge <= FEATHER_CHECKER) step = checker(i, j) ? 1 : 0;
      else if (edge <= FEATHER_BINS) step -= 1;
      if (bands[bin]) step -= 1;
      if (y >= horizon) step = Math.min(step, 1);
      if (step <= 0) continue;
      if (step === 1 && d >= reach * 0.75 && !checker(i, j)) continue;
      put(out, bw, i, j, color, (cover * step) / RAY_ALPHA_STEPS);
    }
  }
}

export interface BeamImage {
  /** Top-left of the beam image in logical px (relative to the screen). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly pixels: Uint8Array<ArrayBuffer>;
}

/**
 * Variant c: one beam from `sun` at `angleDeg` (screen y down), `reach` long, widening from 2 px at the sun to
 * `width` at the end (a shaft, not a lens-flare spoke), opacity steps 3 → 1 along it; clipped where `map` (bluffs,
 * groves) shadows it and at the horizon. Returns the beam's bounding box image.
 */
export function paintBeam(
  sun: Point,
  angleDeg: number,
  reach: number,
  width: number,
  color: number,
  cover: number,
  map: Float32Array,
  horizon: number,
): BeamImage {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const ex = sun.x + dx * reach;
  const ey = sun.y + dy * reach;
  const x0 = Math.floor(Math.min(sun.x, ex) - width);
  const y0 = Math.floor(Math.min(sun.y, ey) - width);
  const w = Math.ceil(Math.abs(ex - sun.x) + 2 * width) + 1;
  const h = Math.ceil(Math.abs(ey - sun.y) + 2 * width) + 1;
  const pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lx = x0 + x;
      const ly = y0 + y;
      if (ly >= horizon) continue;
      const px = lx - sun.x;
      const py = ly - sun.y;
      const along = px * dx + py * dy;
      if (along < 3 || along > reach) continue;
      const across = Math.abs(-px * dy + py * dx);
      if (across > 1 + ((width - 2) / 2) * (along / reach)) continue;
      if (Math.hypot(px, py) > (map[binOf(sun, lx, ly, map.length)] ?? reach)) continue;
      const step = along < reach / 3 ? 3 : along < (reach * 2) / 3 ? 2 : 1;
      put(pixels, w, x, y, color, (cover * step) / RAY_ALPHA_STEPS);
    }
  }
  return { x: x0, y: y0, w, h, pixels };
}

/** Integer hash → 0..1. */
function hash(a: number, b: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface Mote {
  readonly x: number;
  readonly y: number;
  /** 0..1 flicker brightness at this time (0 = hidden). */
  readonly glow: number;
}

/**
 * Dust in the light: `count` motes seeded in a disc of `reach` around the sun (lower-right half, where the shafts fall),
 * drifting slowly right and down and wrapping, flickering on a 6 Hz step. `lit(x, y)` keeps only motes in the light.
 */
export function dustMotes(
  sun: Point,
  reach: number,
  count: number,
  seconds: number,
  lit: (x: number, y: number) => number,
): Mote[] {
  const out: Mote[] = [];
  const step = Math.floor(seconds * 6);
  for (let i = 0; i < count; i++) {
    const r = reach * (0.15 + 0.75 * hash(i, 1));
    const a = -0.6 + 1.9 * hash(i, 2); // radians: from up-right to down
    const drift = (seconds * (1.5 + 2 * hash(i, 3))) % 24;
    const x = Math.round(sun.x + Math.cos(a) * r + drift);
    const y = Math.round(sun.y + Math.sin(a) * r + drift * 0.4);
    // `lit` returns the light step there (0..4); motes are full-bright 1-px specks, never dim smudges.
    const on = lit(x, y) >= 2 && hash(i * 31 + (step >> 1), 4) > 0.3;
    out.push({ x, y, glow: on ? 1 : 0 });
  }
  return out;
}
