// Seeded randomness of the core (SPEC §3, §9; plan M1-02). Two tools, both pure:
// - `next(rng)`: mulberry32 whose whole state (one uint32) lives in `GameState.rng`, so a reload replays the same
//   rolls. Outcomes the player could re-roll by reloading are rolled once and stored (rules: core.md).
// - `hash32(seed, i)`: a stateless hash for time schedules (the wind window i, …): a pure function of the save's seed
//   and time, so offline integrates them piecewise and never consumes the RNG cursor.
// The constants below are the algorithms' own mixing constants (mulberry32 by Tommy Ettinger; lowbias32 by Chris
// Wellons), not balance numbers.

/** RNG state as stored in the save: a uint32. */
export interface Rng {
  readonly state: number;
}

/** A generator from a seed (any integer; taken modulo 2³²). The seed of a new game comes from the platform layer. */
export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** The next value in [0, 1) and the advanced state; `rng` is never mutated. */
export function next(rng: Rng): [number, Rng] {
  const a = (rng.state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, { state: a >>> 0 }];
}

/** lowbias32: a fast, well-mixed 32-bit integer hash. */
function mix(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A uint32 from (seed, i); stable forever (schedules in saves depend on it). */
export function hash32(seed: number, i: number): number {
  return mix(mix(seed) ^ mix(i + 0x9e3779b9));
}

/** `hash32` as a value in [0, 1). */
export function hashUnit(seed: number, i: number): number {
  return hash32(seed, i) / 4294967296;
}

/**
 * A stable choice of one of `options` for (seed, key): rendezvous (highest-random-weight) hashing — every option i
 * gets the weight hash32(hash32(seed, key), i) and the heaviest wins (ties: the lower i). Adding an option moves a seed
 * only onto the new option, never between the old ones, so content can grow without reshuffling shipped games.
 */
export function pickStable(seed: number, key: number, options: number): number {
  const base = hash32(seed, key);
  let best = 0;
  let bestWeight = -1;
  for (let i = 0; i < options; i++) {
    const w = hash32(base, i);
    if (w > bestWeight) {
      best = i;
      bestWeight = w;
    }
  }
  return best;
}
