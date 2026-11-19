// Night lights (plan ART-16): the campfire's flicker and sparks, light pools, fireflies. Pure functions of animation
// seconds (seeded hashes, no Math.random), so `?freeze=<s>` frames repeat; everything is quantized to whole px and
// 1/8 alpha steps — no smooth crawl over the pixel grid.
import type { Prop } from '../../content/villages/khortytsia.layout.ts';
import { FIRE, FIRE_LIGHTS, FIREFLIES, WINDOW_POOL, type ColorRef } from './config.ts';

/** Integer hash → 0..1. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Fire flicker multiplier for a light with `seed`: 1 − depth … 1 in 1/8 steps, FIRE.flicker.hz changes a second. */
export function flicker(seconds: number, seed: number, depth: number = FIRE.flicker.depth): number {
  const step = Math.floor(seconds * FIRE.flicker.hz);
  const v = 1 - depth * hash(step, seed);
  return Math.max(1 - depth, Math.round(v * 8) / 8);
}

export interface PoolImage {
  readonly w: number;
  readonly h: number;
  /** Premultiplied RGBA. */
  readonly pixels: Uint8Array<ArrayBuffer>;
}

/** Alpha per step, rim → middle: the outermost step at half its share (a full one read as a grey checker ring). */
const POOL_ALPHA = [0, 0.125, 0.5, 0.75, 1] as const;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/**
 * A light pool: an ellipse rx × ry of `color` whose alpha falls from the middle to the rim in 4 steps, Bayer 4×4
 * dithered between them (pixel-art light, not a smooth gradient). Premultiplied, for additive blending.
 */
export function paintPool(rx: number, ry: number, color: number): PoolImage {
  const w = 2 * rx + 1;
  const h = 2 * ry + 1;
  const pixels = new Uint8Array(w * h * 4);
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - rx) / rx, (y - ry) / ry);
      if (d >= 1) continue;
      const threshold = ((BAYER4[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
      const level = Math.min(4, Math.floor((1 - d) * 4 + threshold));
      if (level <= 0) continue;
      const a = POOL_ALPHA[level] ?? 0;
      const i = (y * w + x) * 4;
      pixels[i] = Math.round(r * a);
      pixels[i + 1] = Math.round(g * a);
      pixels[i + 2] = Math.round(b * a);
      pixels[i + 3] = Math.round(255 * a);
    }
  }
  return { w, h, pixels };
}

export interface Speck {
  readonly x: number;
  readonly y: number;
}

/** Sparks over the fire at `fire` (the top of the logs): those alive now, rising and drifting, whole px. */
export function sparks(seconds: number, fire: Speck): Speck[] {
  const out: Speck[] = [];
  for (let i = 0; i < FIRE.sparks; i++) {
    const life = FIRE.sparkLife * (0.7 + 0.6 * hash(i, 1));
    const cycle = seconds / life + hash(i, 2);
    const t = cycle - Math.floor(cycle);
    // Each spark is born again with a new seed every cycle, and some cycles stay dark (fewer, irregular sparks).
    const gen = Math.floor(cycle);
    if (hash(i * 97 + gen, 3) < 0.35 || t > 0.85) continue;
    const drift = (hash(i * 13 + gen, 4) - 0.5) * 8;
    out.push({
      x: Math.round(fire.x + drift * t + Math.sin(t * 9 + i) * 1.5),
      y: Math.round(fire.y - t * FIRE.sparkRise),
    });
  }
  return out;
}

export interface Firefly extends Speck {
  readonly on: boolean;
  /** The first part of the blink: drawn with a dim + around it. */
  readonly peak: boolean;
}

/** Fireflies wandering slowly inside `area` (x0 ≤ x < x1, y0 ≤ y < y1), each blinking on its own cycle. */
export function fireflies(seconds: number, area: { x0: number; x1: number; y0: number; y1: number }): Firefly[] {
  const w = area.x1 - area.x0;
  const h = area.y1 - area.y0;
  return Array.from({ length: FIREFLIES.count }, (_, i) => {
    const fx = hash(i, 5) * w + Math.sin(seconds * (0.2 + 0.2 * hash(i, 6)) + i) * 10;
    const fy = hash(i, 7) * h + Math.sin(seconds * (0.3 + 0.2 * hash(i, 8)) + i * 2) * 5;
    const x = area.x0 + Math.min(w - 1, Math.max(0, Math.round(fx)));
    const y = area.y0 + Math.min(h - 1, Math.max(0, Math.round(fy)));
    const period = 3 + 2 * hash(i, 9);
    const phase = seconds / period + hash(i, 10);
    const t = phase - Math.floor(phase);
    return { x, y, on: t < FIREFLIES.blinkOn, peak: t < FIREFLIES.blinkOn * FIREFLIES.peak };
  });
}

/** A prop's light pool: its size, colour and alpha, rows below the pivot, and whether it flickers like a fire. */
export interface PoolLook {
  readonly rx: number;
  readonly ry: number;
  readonly color: ColorRef;
  readonly alpha: number;
  readonly below: number;
  /** Pool centre right of the pivot (logical px). */
  readonly dx: number;
  readonly fire: boolean;
}

const isFire = (sprite: string): sprite is keyof typeof FIRE_LIGHTS => sprite in FIRE_LIGHTS;

/**
 * The pool a prop throws at night: a fire's (`FIRE_LIGHTS`, by sprite id), a window's in front of a prop whose atlas
 * has an `@emissive` frame `maskWidth` px wide (`poolRx` when the prop sets it), or none — also for `noPool`, a
 * tier whose shared emissive layer is dark (the treasury before its lantern).
 */
export function poolLook(prop: Pick<Prop, 'sprite' | 'poolRx' | 'noPool'>, maskWidth: number | null): PoolLook | null {
  if (isFire(prop.sprite)) {
    const light = FIRE_LIGHTS[prop.sprite];
    return { ...light, dx: light.dx ?? 0, fire: true };
  }
  if (maskWidth === null || prop.noPool === true) return null;
  const rx = prop.poolRx ?? Math.max(WINDOW_POOL.minRx, Math.round(maskWidth * WINDOW_POOL.rxShare));
  const { ry, color, alpha, below } = WINDOW_POOL;
  return { rx, ry, color, alpha, below, dx: 0, fire: false };
}
