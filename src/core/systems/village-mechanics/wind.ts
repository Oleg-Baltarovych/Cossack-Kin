// The wind — land 1's mechanic (SPEC §3.7, §3.8; plan M1-07, Q2). Time is cut into `slotSec` slots; each slot's
// wind is a pure function of (seed, slot index) via `hashUnit`, picked by the content weights. Neighbouring equal
// slots merge, so a wind lasts a whole number of slots. Nothing is stored: online ticks and offline integrate the same
// schedule (no RNG cursor), and `windBreakpoints` / `stormStarts` give the change points `advance` cuts its segments at.
// Times are milliseconds (epoch), like `now` everywhere in the core.
import { KHORTYTSIA, type Village, type WindLevel, type WindLook } from '../../../content/villages/khortytsia.ts';
import { hashUnit } from '../../rng.ts';

const slotMs = (village: Village): number => village.wind.slotSec * 1000;

/** The wind look of slot `index`: the content level whose cumulative weight covers the slot's hash. */
function slotLook(seed: number, index: number, village: Village): WindLook {
  const levels = village.wind.levels;
  const total = levels.reduce((s, l) => s + l.weight, 0);
  let x = hashUnit(seed, index) * total;
  for (const l of levels) {
    if (x < l.weight) return l;
    x -= l.weight;
  }
  // Float rounding can leave x a hair above the last band: it belongs to the last level.
  const last = levels[levels.length - 1];
  if (!last) throw new Error('wind: the land has no wind levels');
  return last;
}

/** The wind look (level and windmill multiplier) at time `t`. */
export function windLookAt(seed: number, t: number, village: Village = KHORTYTSIA): WindLook {
  return slotLook(seed, Math.floor(t / slotMs(village)), village);
}

/** The wind level at time `t`. */
export function windAt(seed: number, t: number, village: Village = KHORTYTSIA): WindLevel {
  return windLookAt(seed, t, village).id;
}

/** Slot boundaries b in (from, to] where the wind at b differs from the wind just before b. */
function boundaries(
  seed: number,
  from: number,
  to: number,
  village: Village,
  keep: (before: WindLevel, after: WindLevel) => boolean,
): number[] {
  const ms = slotMs(village);
  const out: number[] = [];
  let index = Math.floor(from / ms) + 1;
  let before = slotLook(seed, index - 1, village).id;
  for (let b = index * ms; b <= to; b += ms, index += 1) {
    const after = slotLook(seed, index, village).id;
    if (keep(before, after)) out.push(b);
    before = after;
  }
  return out;
}

/** Every time in (from, to] the wind changes, in order. */
export function windBreakpoints(seed: number, from: number, to: number, village: Village = KHORTYTSIA): number[] {
  return boundaries(seed, from, to, village, (a, b) => a !== b);
}

/** Every time in (from, to] a storm begins (a storm slot after a non-storm slot), in order. */
export function stormStarts(seed: number, from: number, to: number, village: Village = KHORTYTSIA): number[] {
  return boundaries(seed, from, to, village, (a, b) => b === 'storm' && a !== 'storm');
}

/**
 * Storms toward the Bloom goal (SPEC §3.7: «пережити 3 бурі з вітряком ≥ 25, офлайн-бурі теж рахуються»): the storms
 * that begin in (from, to] while the windmill is at `windmillLevel` ≥ the goal level. `advance` calls it per segment
 * (levels only change between segments, by actions), so online ticks and offline count the same storms.
 */
export function stormsSurvivedDuring(
  seed: number,
  from: number,
  to: number,
  windmillLevel: number,
  village: Village = KHORTYTSIA,
): number {
  if (windmillLevel < village.bloomGoal.windmillLevel) return 0;
  return stormStarts(seed, from, to, village).length;
}
