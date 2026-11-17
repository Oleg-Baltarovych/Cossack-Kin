// Far landscape painter (ART-08, SPEC §6.2 layers 2–3, ART-BIBLE §8): the far planes of a land — steppe with kurgans,
// granite bluffs, grove lines — are painted on the CPU in the sky's own colour chain of the current key, `depth` steps
// darker than the horizon row. Aerial perspective is therefore built in: day hills are hazy blue, golden-hour ones
// mauve, night ones navy, always on the palette and in harmony with the sky behind them.
// Shading (art-director ART-08 review): a 1-step lit rim on sun-facing crests and slopes; bluffs with a lighter left
// scarp, a darker right face, irregular horizontal ledges and at most two cracks per span, crest trees in a few round
// clusters; groves as solid crown lumps with a `foliage` rim on their top-left; a misty foot that rises in fog.
// Haze (time of day, fog) pulls every plane toward the horizon colour. Also the haze band over the ground.
// Pure: no Pixi, no DOM.
import type { FarPlane } from '../../content/villages/khortytsia.layout.ts';
import type { Weather } from '../settings.ts';
import { rampColor } from '../palette.ts';
import { FOLIAGE_LEVELS } from './config.ts';
import type { DayCycle } from './dayCycle.ts';
import { keyLevel } from './emissive.ts';
import { bayer, horizonPos, pick, prepared } from './skyPaint.ts';

// --- profiles --------------------------------------------------------------------------------------

/** Integer hash → 0..1 (deterministic, no RNG state). */
function hash(n: number, seed: number): number {
  let h = Math.imul(n ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 1-D value noise in 0..1 with `cell`-px cells. */
function noise1(x: number, cell: number, seed: number): number {
  const fx = x / cell;
  const i = Math.floor(fx);
  const f = fx - i;
  const s = f * f * (3 - 2 * f);
  const a = hash(i, seed);
  return a + (hash(i + 1, seed) - a) * s;
}

/** Smooth 2-D value noise in 0..1 with cells `cx` × `cy` px. */
function noise2(x: number, y: number, cx: number, cy: number, seed: number): number {
  const fx = x / cx;
  const fy = y / cy;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
  const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
  const at = (i: number, j: number): number => hash(i * 7919 + j * 104729, seed);
  const a = at(ix, iy);
  const b = at(ix + 1, iy);
  const c = at(ix, iy + 1);
  const d = at(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export interface Profile {
  /** Silhouette height above the horizon per column (whole px, ≥ 0). */
  readonly height: Int16Array;
  /** Per column: height of the bare ground/rock under any tree crown (equal to `height` where there is no tree). */
  readonly rock: Int16Array;
  /** Per column: x of the crown centre the column belongs to (groves, crest trees), or −1. */
  readonly crown: Int16Array;
}

/** Crest tree clusters of a bluff span: 2–3 clusters, ≥ 20 px of bare crest between them. */
function crestClusters(x0: number, x1: number, seed: number): { cx: number; r: number }[] {
  const crowns: { cx: number; r: number }[] = [];
  const count = x1 - x0 > 90 ? 3 : 2;
  const slot = (x1 - x0) / count;
  for (let k = 0; k < count; k++) {
    const centre = Math.round(x0 + slot * (k + 0.3 + hash(k, seed) * 0.4));
    const n = 2 + Math.floor(hash(k, seed + 1) * 2); // 2–3 low domes side by side: a clump 7–11 px wide
    for (let j = 0; j < n; j++) {
      crowns.push({ cx: centre + j * 3 - n, r: 2 + Math.floor(hash(k * 7 + j, seed + 2) * 2) });
    }
  }
  return crowns;
}

/** Column heights of a plane over `w` px of its layer. */
export function planeProfile(plane: FarPlane, w: number): Profile {
  const height = new Int16Array(w);
  const rock = new Int16Array(w);
  const crown = new Int16Array(w).fill(-1);
  const crowns: { cx: number; r: number; base: number }[] = [];
  if (plane.kind === 'cliffs') {
    for (const [x0, x1] of plane.plateaus) {
      for (const c of crestClusters(x0, x1, plane.seed)) crowns.push({ ...c, base: 0 });
    }
  }
  if (plane.kind === 'grove') {
    for (const [x0, x1, crownH] of plane.groves) {
      for (let cx = x0; cx <= x1; cx += 6 + Math.floor(hash(cx, plane.seed) * 4)) {
        const r = Math.max(3, Math.round(crownH * (0.28 + hash(cx, plane.seed + 3) * 0.14)));
        crowns.push({ cx, r, base: Math.round(crownH * (0.75 + hash(cx, plane.seed + 4) * 0.25)) - r });
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let r = 0;
    if (plane.kind === 'steppe') {
      // A continuous band 8–11 px, kurgans on top of it.
      r = 8 + 3 * noise1(x, 41, plane.seed);
      for (const [cx, hw, kh] of plane.kurgans) {
        const d = (x - cx) / hw;
        if (d * d < 1) r = Math.max(r, 8 + kh * (1 - d * d));
      }
    } else if (plane.kind === 'cliffs') {
      for (const [x0, x1, top] of plane.plateaus) {
        const crest = top + 2 * noise1(x, 11, plane.seed) - 1;
        // Steep scarp on the left (sun side), a longer talus slope on the right.
        const v = x < x0 ? crest - (x0 - x) * 1.7 : x > x1 ? crest - (x - x1) * 0.8 : crest;
        r = Math.max(r, v);
      }
    }
    let h = r;
    let owner = -1;
    for (const c of crowns) {
      const dx = x - c.cx;
      if (dx * dx > c.r * c.r) continue;
      const base = plane.kind === 'cliffs' ? r : c.base;
      // Crest trees are flattened domes (no "chimneys"); grove crowns are round.
      const top = base + Math.sqrt(c.r * c.r - dx * dx) * (plane.kind === 'cliffs' ? 0.8 : 1);
      if (top > h) {
        h = top;
        owner = c.cx;
      }
    }
    height[x] = Math.max(0, Math.round(h));
    rock[x] = Math.max(0, Math.round(plane.kind === 'grove' ? 0 : r));
    crown[x] = owner;
  }
  return { height, rock, crown };
}

// --- painting --------------------------------------------------------------------------------------

function put(out: Uint8Array, w: number, x: number, y: number, color: number): void {
  const i = (y * w + x) * 4;
  out[i] = (color >> 16) & 0xff;
  out[i + 1] = (color >> 8) & 0xff;
  out[i + 2] = color & 0xff;
  out[i + 3] = 255;
}

/** Sky-chain colour at `steps` relative to the horizon position (≤ 0 = darker), cross-faded between the two keys. */
function aerial(cycle: DayCycle, steps: number, x: number, y: number, weather: Weather): number {
  const a = prepared(cycle.keyA, weather);
  const b = prepared(cycle.keyB, weather);
  const threshold = bayer(x, y);
  const clamp = (p: number, chain: readonly number[]): number => Math.min(Math.max(0, p), chain.length - 2);
  if (cycle.t > 0 && cycle.t > bayer(x + 2, y + 1)) {
    return pick(b, clamp(horizonPos(cycle.keyB, weather) + steps, b.chain), threshold);
  }
  return pick(a, clamp(horizonPos(cycle.keyA, weather) + steps, a.chain), threshold);
}

/** One solid sky-chain colour (no dither) of the dominant key, `steps` from the horizon position. */
function aerialSolid(cycle: DayCycle, steps: number, weather: Weather): number {
  const id = cycle.t < 0.5 ? cycle.keyA : cycle.keyB;
  const p = prepared(id, weather);
  return pick(p, Math.min(Math.max(0, horizonPos(id, weather) + steps), p.chain.length - 2), 0.5);
}

export interface PaintPlaneOptions {
  /** 0..1 air haze (time of day, fog). */
  readonly haze: number;
  /** Multiplier on the plane's depth (haze and fog thin the air's contrast). */
  readonly depthScale: number;
  /** Fog: the misty foot rises to 60 % of the plane, local colour is lost, depth is capped at `maxDepth`. */
  readonly fog: boolean;
  readonly maxDepth: number;
  /** The sky the planes take their colours from (ART-17: grey under rain, flattened in fog). */
  readonly weather: Weather;
}

/**
 * Paints `plane` into `out` (w × h RGBA, bottom row = the last sky row above the horizon), over what is there
 * (planes are painted back to front). Empty px are left untouched.
 */
export function paintPlane(
  out: Uint8Array,
  w: number,
  h: number,
  plane: FarPlane,
  profile: Profile,
  cycle: DayCycle,
  { haze, depthScale, fog, maxDepth, weather }: PaintPlaneOptions,
): void {
  const depth = Math.min(plane.depth * depthScale, fog ? maxDepth : Number.POSITIVE_INFINITY);
  // One step lighter than the key's foliage level: the rim must read as light on the crowns, never as a dark trim.
  const foliage = rampColor('foliage', Math.min(3, Math.round(keyLevel(FOLIAGE_LEVELS, cycle)) + 1));
  const showFoliage = !fog && haze < 0.5;
  for (let x = 0; x < w; x++) {
    const top = Math.min(h, profile.height[x] ?? 0);
    const rock = profile.rock[x] ?? 0;
    const left = profile.height[x - 1] ?? top;
    const right = profile.height[x + 1] ?? top;
    const crownX = profile.crown[x] ?? -1;
    const foot = fog ? Math.max(4, Math.round(top * 0.6)) : 4;
    for (let r = 0; r < top; r++) {
      const y = h - 1 - r;
      let steps = -depth;
      const tree = crownX >= 0 && r >= rock;
      const fromTop = top - 1 - r;
      if (plane.kind === 'cliffs' && !tree) {
        // Scarps from the bare-rock profile: a crest tree's edge is not a cliff face.
        const scarpLeft = (profile.rock[x - 1] ?? rock) < rock - 1;
        const scarpRight = (profile.rock[x + 1] ?? rock) < rock - 1;
        if (scarpLeft && rock - 1 - r < 3) steps += 0.3;
        if (scarpRight) steps -= 0.3;
        // Granite strata: irregular horizontal patches from stretched 2-D noise (short dashes on a row grid read as
        // windows); one step deeper on the shaded right scarp, half a step elsewhere; washed out by haze.
        if (fromTop > 2 && noise2(x, r, 16, 2.5, plane.seed + 7) > 0.66)
          steps -= (scarpRight ? 1 : 0.5) * (1 - 0.6 * haze);
      }
      // Crest trees: half a step under the bluff. Grove crowns: their shaded right side a little deeper.
      if (tree && plane.kind === 'cliffs') steps -= 0.5;
      // (Only within the crown's top rows: down to the ground the shaded halves read as vertical stripes.)
      if (plane.kind === 'grove' && x > crownX + 1 && right < top && fromTop < 4) steps -= 0.3;
      // Misty foot: the lowest rows sink into the air (in fog up to 60 % of the plane).
      if (r < foot) steps += (fog ? 1.2 : 0.5 * haze) * (1 - r / foot);
      // Lit rim on sun-facing crests and slopes: +1 step, after haze (it never washes out); it stays below the
      // horizon colour so it never melts into the sky behind.
      const sunFacing = fromTop === 0 && left <= top;
      if (sunFacing) steps += 1;
      let color = aerial(cycle, Math.min(sunFacing ? -0.25 : 0, steps), x, y, weather);
      // Groves: solid lumps; a 1–2 px lit rim on each crown's top-left, 0.8 step above the body (light, not a dark
      // hedge trim), 30 % of it in the local foliage colour when the air is clear; 25 % of the row under it likewise.
      if (plane.kind === 'grove' && x <= crownX && (fromTop <= 1 ? left <= top : fromTop === 2 && bayer(x, y) < 0.25)) {
        color = aerial(cycle, Math.min(-0.25, steps + 0.8), x, y, weather);
        if (showFoliage && bayer(x + 3, y + 1) < 0.3) color = foliage;
      }
      put(out, w, x, y, color);
    }
  }
}

/** Opacity steps of the haze band: a few stepped layers of mist. */
export const HAZE_ALPHA_STEPS = 4;

/**
 * Haze over the ground under the horizon: one solid horizon colour (no chain dither: it showed as dotted rows) in
 * HAZE_ALPHA_STEPS equal bands of falling opacity, `cover` at the top band, 2-row dithered seams between bands. `lead` rows above the horizon
 * (fog only) let the bank overlap the bases of the far planes. Premultiplied RGBA; row 0 = the top of the band.
 */
export function paintHazeBand(
  out: Uint8Array,
  w: number,
  rows: number,
  cycle: DayCycle,
  cover: number,
  lead = 0,
  weather: Weather = 'clear',
): void {
  out.fill(0);
  const color = aerialSolid(cycle, -0.2, weather);
  const alphaOf = (step: number): number => cover * (1 - step / HAZE_ALPHA_STEPS);
  for (let r = 0; r < lead + rows; r++) {
    // The lead rows above the horizon fade in from the top (ordered dither), so the bank has no hard upper edge
    // across what stands on the horizon (the Sich towers, ART-17).
    if (r < lead) {
      const f = (r + 1) / (lead + 1);
      for (let x = 0; x < w; x++) {
        if (bayer(x, r) >= f) continue;
        const alpha = alphaOf(0);
        const i = (r * w + x) * 4;
        out[i] = Math.round(((color >> 16) & 0xff) * alpha);
        out[i + 1] = Math.round(((color >> 8) & 0xff) * alpha);
        out[i + 2] = Math.round((color & 0xff) * alpha);
        out[i + 3] = Math.round(alpha * 255);
      }
      continue;
    }
    // Below the horizon the opacity falls linearly to nothing over `rows`, quantized to HAZE_ALPHA_STEPS levels with
    // an ordered dither between the two neighbouring levels on every row — no straight step line anywhere across
    // the sprites (art-director ART-17: the 2-row borrow at band boundaries still read as stacked rectangles).
    const level = (1 - (r - lead) / rows) * HAZE_ALPHA_STEPS;
    const lo = Math.floor(level);
    const frac = level - lo;
    for (let x = 0; x < w; x++) {
      const step = bayer(x, r) < frac ? lo + 1 : lo;
      const alpha = (cover * Math.min(HAZE_ALPHA_STEPS, step)) / HAZE_ALPHA_STEPS;
      if (alpha <= 0) continue;
      const i = (r * w + x) * 4;
      out[i] = Math.round(((color >> 16) & 0xff) * alpha);
      out[i + 1] = Math.round(((color >> 8) & 0xff) * alpha);
      out[i + 2] = Math.round((color & 0xff) * alpha);
      out[i + 3] = Math.round(alpha * 255);
    }
  }
}
