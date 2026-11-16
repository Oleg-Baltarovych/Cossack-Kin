// Sky painter (ART-04, ART-BIBLE §8): paints the sky band into an RGBA buffer at logical resolution, in
// "chain space" like the sprite generators — each pixel gets a continuous position along a dark → light
// list of palette colors (gradient + horizon glow + sun/moon halos), and Bayer 4×4 picks one of the two
// neighbouring colors. Two keys cross-fade by a second, offset Bayer threshold. Every output pixel is a
// palette color. Pure (no Pixi, no DOM): App/Sky.ts own the texture.
import { rampColor } from '../palette.ts';
import { MOON, SKY_LOOKS, STARS, type ColorRef, type HaloLook, type SkyKeyId, type SkyLook } from './config.ts';
import type { DayCycle } from './dayCycle.ts';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold in (0, 1) for pixel (x, y). */
export function bayer(x: number, y: number): number {
  return ((BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
}

const rgb = ([ramp, index]: ColorRef): number => rampColor(ramp, index);

interface Prepared {
  readonly look: SkyLook;
  readonly chain: readonly number[];
}

const PREPARED = new Map<SkyKeyId, Prepared>();
function prepared(id: SkyKeyId): Prepared {
  let p = PREPARED.get(id);
  if (!p) {
    const look = SKY_LOOKS[id];
    p = { look, chain: look.chain.map(rgb) };
    PREPARED.set(id, p);
  }
  return p;
}

/** Pixel position of a sky point in a w×h band (h − 1 = the horizon row). */
export function skyPixel(point: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  return { x: Math.round(point.x * (w - 1)), y: Math.round((h - 1) * (1 - point.y)) };
}

function halo(look: HaloLook, cx: number, cy: number, x: number, y: number): number {
  if (look.strength <= 0) return 0;
  const dx = (x - cx) / look.spread;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  const r2 = look.radius * look.radius;
  if (d2 >= r2) return 0;
  const f = 1 - Math.sqrt(d2) / look.radius;
  return look.strength * f * f;
}

/** Continuous chain position of pixel (x, y) for one key. */
function chainPos(p: Prepared, x: number, y: number, h: number, sun: Pt, moon: Pt | null): number {
  const { look } = p;
  const v = h > 1 ? y / (h - 1) : 1;
  let pos = look.top + (look.horizon - look.top) * Math.pow(v, look.curve);
  const fromHorizon = (1 - v) / look.glowHeight;
  if (fromHorizon < 1) pos += look.glow * (1 - fromHorizon) * (1 - fromHorizon);
  // Soft air streaks, stretched 4:1 along the horizon: band edges wander instead of running ruler-straight.
  if (look.streaks > 0) pos += look.streaks * streakNoise(x, y);
  // Gradient + glow stop at baseMax (the horizon stays a step below whitewash); halos may go above it.
  if (pos > look.baseMax) pos = look.baseMax;
  pos += halo(look.sunHalo, sun.x, sun.y, x, y);
  if (moon) pos += halo(look.moonHalo, moon.x, moon.y, x, y);
  // The lightest chain color is reserved for the sun/moon disc, so the disc never melts into its own halo.
  const max = Math.max(0, p.chain.length - 2);
  return pos < 0 ? 0 : pos > max ? max : pos;
}

/** Integer hash → 0..1 (deterministic, no RNG state). */
function hash2(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smoothly interpolated value noise in −1..1. */
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}

/** Two-octave fbm, cells 4× wider than tall (−1..1). */
export function streakNoise(x: number, y: number): number {
  return (valueNoise(x / 144, y / 36) * 2 + valueNoise(x / 64 + 17.3, y / 16 + 5.1)) / 3;
}

interface Pt {
  readonly x: number;
  readonly y: number;
}

/**
 * Color for a chain position. The fraction is quantized to quarters, so dithering uses only the regular 25 / 50 /
 * 75 % Bayer patterns — no rows of isolated 1/16 dots where a band begins.
 */
function pick(p: Prepared, pos: number, threshold: number): number {
  const i = Math.floor(pos);
  const f = Math.round((pos - i) * 4) / 4;
  return (f > threshold ? p.chain[i + 1] : p.chain[i]) ?? p.chain[i] ?? 0;
}

function put(out: Uint8Array, w: number, x: number, y: number, color: number): void {
  const i = (y * w + x) * 4;
  out[i] = (color >> 16) & 0xff;
  out[i + 1] = (color >> 8) & 0xff;
  out[i + 2] = color & 0xff;
  out[i + 3] = 255;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Whether the moon is drawn for this blend (and lights its halo). */
function moonShown(cycle: DayCycle): boolean {
  const a = SKY_LOOKS[cycle.keyA].moon;
  const b = SKY_LOOKS[cycle.keyB].moon;
  return lerp(a, b, cycle.t) > 0.5 && cycle.moon.y > -0.02;
}

/**
 * Paints gradient, halos, sun and moon (everything but the stars) into `out` (w·h·4 bytes) and writes the
 * chain share (0..1, dominant key) per pixel into `light`, which the star pass uses to fade stars out of light sky.
 */
export function paintSkyBase(out: Uint8Array, light: Float32Array, w: number, h: number, cycle: DayCycle): void {
  const a = prepared(cycle.keyA);
  const b = prepared(cycle.keyB);
  const { t } = cycle;
  const sun = skyPixel(cycle.sun, w, h);
  const moon = moonShown(cycle) ? skyPixel(cycle.moon, w, h) : null;
  const dominant = t < 0.5 ? a : b;
  const domMax = dominant.chain.length - 1 || 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const threshold = bayer(x, y);
      const posA = chainPos(a, x, y, h, sun, moon);
      let color = pick(a, posA, threshold);
      let posDom = posA;
      if (t > 0) {
        const posB = chainPos(b, x, y, h, sun, moon);
        // Second threshold shifted by (2, 1): the cross-fade pattern does not line up with the gradient dither.
        if (t > bayer(x + 2, y + 1)) color = pick(b, posB, threshold);
        if (dominant === b) posDom = posB;
      }
      put(out, w, x, y, color);
      light[y * w + x] = posDom / domMax;
    }
  }

  const look = dominant.look;
  const sunRadius = lerp(a.look.sun.radius, b.look.sun.radius, t);
  const core = rgb(look.sun.core);
  const rim = rgb(look.sun.rim);
  // Filled disc; the rim shows only on the lower edge (the side away from the light).
  disc(
    out,
    w,
    h,
    sun.x,
    sun.y,
    sunRadius,
    () => core,
    (_dx, dy) => (dy > 0 ? rim : core),
  );
  if (moon) paintMoon(out, w, h, moon.x, moon.y);
}

/** Filled pixel circle with a 1-px rim; `core(dx, dy)` / `rim(dx, dy)` color the inside and the edge. */
function disc(
  out: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  core: (dx: number, dy: number) => number,
  rim: (dx: number, dy: number) => number,
): void {
  const r = Math.max(1, radius);
  const outer = (r + 0.5) * (r + 0.5);
  const inner = (r - 0.5) * (r - 0.5);
  const R = Math.ceil(r + 1);
  for (let dy = -R; dy <= R; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= h) continue;
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= w) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 > outer) continue;
      put(out, w, x, y, d2 > inner ? rim(dx, dy) : core(dx, dy));
    }
  }
}

/** Near-full moon: body, lit upper-left limb, a few maria. */
const MARIA: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, 1],
  [2, 0],
  [-2, 1],
  [0, 2],
];
function paintMoon(out: Uint8Array, w: number, h: number, cx: number, cy: number): void {
  const lit = rgb(MOON.lit);
  const body = rgb(MOON.body);
  const maria = rgb(MOON.maria);
  const isMare = (dx: number, dy: number): boolean => MARIA.some(([mx, my]) => mx === dx && my === dy);
  disc(
    out,
    w,
    h,
    cx,
    cy,
    MOON.radius,
    (dx, dy) => (isMare(dx, dy) ? maria : dx + dy < -2 ? lit : body),
    () => body,
  );
}

// --- Stars -----------------------------------------------------------------------------------------
export interface Star {
  readonly x: number;
  readonly y: number;
  /** 0 bright, 1 mid, 2 dim. */
  readonly magnitude: number;
  /** 0..1: shown when below the current star density. */
  readonly rank: number;
  readonly phase: number;
  readonly speed: number;
}

/** Star field for a w×h band, from a seeded RNG (positions favour the upper sky). */
export function makeStars(w: number, h: number, rng: () => number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STARS.count; i++) {
    const x = Math.floor(rng() * w);
    const y = Math.floor(Math.pow(rng(), 1.6) * h * 0.85);
    const m = rng();
    stars.push({
      x,
      y,
      magnitude: m < 0.12 ? 0 : m < 0.45 ? 1 : 2,
      rank: rng(),
      phase: rng() * Math.PI * 2,
      speed: 0.6 + rng() * 1.8,
    });
  }
  return stars;
}

/** Star density for the blend (0..1). */
export function starDensity(cycle: DayCycle): number {
  return lerp(SKY_LOOKS[cycle.keyA].stars, SKY_LOOKS[cycle.keyB].stars, cycle.t);
}

/** Draws twinkling stars over a painted base. `seconds` is quantized to STARS.hz steps. */
export function paintStars(
  out: Uint8Array,
  light: Float32Array,
  w: number,
  h: number,
  stars: readonly Star[],
  density: number,
  seconds: number,
): void {
  if (density <= 0) return;
  const colors = [rgb(STARS.colors.bright), rgb(STARS.colors.mid), rgb(STARS.colors.dim)];
  const step = Math.floor(seconds * STARS.hz) / STARS.hz;
  for (const s of stars) {
    if (s.x >= w || s.y >= h) continue;
    const v = s.y / h;
    if (s.rank >= density * (1 - 0.6 * v)) continue;
    const sky = light[s.y * w + s.x] ?? 1;
    if (sky > STARS.maxSkyLight) continue;
    const wave = Math.sin(step * s.speed + s.phase);
    const level = s.magnitude + (wave > 0.75 ? -1 : wave < -0.8 ? 1 : 0);
    if (level > 2) continue; // twinkled out for this step
    const color = colors[Math.max(0, level)] ?? 0;
    put(out, w, s.x, s.y, color);
    // The brightest stars flare into a small cross at their peak.
    if (level < 0 || (s.magnitude === 0 && wave > 0.3)) {
      const arm = colors[2] ?? 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const x = s.x + dx;
        const y = s.y + dy;
        if (x >= 0 && x < w && y >= 0 && y < h) put(out, w, x, y, arm);
      }
    }
  }
}
