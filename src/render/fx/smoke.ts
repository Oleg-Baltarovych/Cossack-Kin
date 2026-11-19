// Chimney smoke (plan M2-11, SPEC §6.3 «дим зноситься», §6.5 «дим із димарів»): puff positions as pure functions of
// atmosphere time and the wind strength (seeded hashes, no Math.random), whole px, so `?freeze=<s>` frames repeat.
// Puffs are the `smoke/idle/0N` frames (N = age), pivot at their bottom centre; render/layers/Fx.ts draws them in the
// graded world, so the night grade darkens the smoke like the roofs under it.
import { SMOKE, WIND_STRENGTH } from '../atmosphere/config.ts';

/** A chimney's mouth in world px: the column's left edge, the top edge of the mouth row; `seed` desyncs chimneys. */
export interface Vent {
  readonly x: number;
  readonly y: number;
  readonly seed: number;
}

export interface Puff {
  /** Pivot of the puff frame (bottom centre), whole px. */
  readonly x: number;
  readonly y: number;
  /** Age frame: 0 young and dense … 2 old and thin. */
  readonly frame: 0 | 1 | 2;
}

/** Integer hash → 0..1. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Symmetric whole-px rounding (both sides of 0 alike). */
const px = (v: number): number => Math.sign(v) * Math.round(Math.abs(v));

/** A puff of age `t` (0..1 of its life) over `vent` in wind `strength`; `wobble` −1..1 sideways. */
function puffAt(vent: Vent, t: number, strength: number, wobble: number): Puff {
  const s = clamp01(strength);
  const rise = SMOKE.rise * (1 - SMOKE.flatten * s);
  // Ease out: fast off the mouth, slowing as it spreads.
  const h = rise * t * (2 - t);
  // Calm air (the game's calmest wind) leaves the plume upright; the lean grows from there to a gale.
  const gust = clamp01((s - WIND_STRENGTH.calm) / (1 - WIND_STRENGTH.calm));
  const lean = SMOKE.lean.calm + (SMOKE.lean.gale - SMOKE.lean.calm) * gust;
  // The plume bends more the higher it gets (the wind is stronger above the roof).
  const dx = lean * h * (0.5 + 0.5 * t) + SMOKE.wobble * wobble * t;
  const frame = t < SMOKE.ages[0] ? 0 : t < SMOKE.ages[1] ? 1 : 2;
  return { x: vent.x + px(dx), y: vent.y - Math.round(h), frame };
}

/** The `count` live puffs of one chimney at time `seconds`: evenly staggered ages, so the plume never gaps. */
export function smokePuffs(seconds: number, vent: Vent, strength: number, count: number): Puff[] {
  const out: Puff[] = [];
  const phase = hash(vent.seed, 7);
  for (let i = 0; i < count; i++) {
    const cycle = seconds / SMOKE.life + i / count + phase;
    const gen = Math.floor(cycle);
    // Each rebirth wanders its own way.
    const wobble = hash(i * 31 + gen, vent.seed) * 2 - 1;
    out.push(puffAt(vent, cycle - gen, strength, wobble));
  }
  return out;
}

/** «Менше руху»: a still plume — one puff of each age, leaning with the wind, the same at any time. */
export function stillPlume(vent: Vent, strength: number): Puff[] {
  return Array.from({ length: SMOKE.stillPuffs }, (_, i) => puffAt(vent, (i + 0.5) / SMOKE.stillPuffs, strength, 0));
}
