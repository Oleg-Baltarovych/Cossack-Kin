// Pixel recipes, steppe (plan M2-29 A5, Q13 item 5): the dry steppe band at the bottom of the world — the sward the
// `steppe` ground tiles are made of, the ragged grass → steppe seam (`steppe-edge`), and the dry tussocks the
// feather-grass, sorrel and kurgan props stand in. Dry grass is ochre over a green under-layer (thatch 1–4 on grass 2),
// value a step above the meadow by day; it stays off the steps the golden-hour curve keeps bright (thatch ≥ 4 only as
// sparse tips), so at 19:30 the steppe darkens with the meadow instead of glowing like the roofs. Shade numbers index
// master.json: thatch 1 #6e5426 … 4 #d4ad52; grass 1 #1d3f2a, 2 #2a5931, 3 #3f7535; earth 2 #634629.
import { seedOf, valueNoise } from './noise.ts';
import type { Plot } from './plot.ts';
import { seededRng } from './rng.ts';

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

/** Area in px. */
export interface SteppeArea {
  readonly w: number;
  readonly h: number;
}

/**
 * A dry blade of steppe grass from its root at (x, baseY) `h` px up, the top leaning `lean` px (−1, 0, 1): thatch 1 at
 * the root, thatch 2 body, the tip thatch 3 when `lit` (sun-side blades only). Never thatch 4: that is the sunlit-thatch
 * value the golden-hour curve keeps bright (the «confetti», GRASS_FLECK).
 */
export function dryBlade(plot: Plot, x: number, baseY: number, h: number, lean: number, lit: boolean, wrapW = 0): void {
  for (let k = 0; k < h; k++) {
    const tip = k === h - 1;
    const dx = tip ? lean : 0;
    const px = wrapW > 0 ? (((x + dx) % wrapW) + wrapW) % wrapW : x + dx;
    plot.set(px, baseY - k, 'thatch', k === 0 ? 1 : tip && lit ? 3 : 2);
  }
}

/**
 * A tussock of dry grass, wind-combed (art-director A5): an umber root (earth 1) `w` px wide, blades 3–5 px tall
 * (tallest in the middle) leaning down-right with the wind — the tops 1–2 px right of the roots, light from the top-left:
 * the left half and the tips thatch 3, the right half thatch 2, a dark gap column now and then. Wraps over `wrapW`.
 */
export function tussock(plot: Plot, x0: number, baseY: number, w: number, rng: Rng, wrapW: number): void {
  const wrap = (x: number): number => ((x % wrapW) + wrapW) % wrapW;
  for (let i = 0; i < w; i++) {
    const x = x0 + i;
    plot.set(wrap(x), baseY, 'earth', 1);
    if (rng() < 0.18) continue;
    const mid = 1 - Math.abs(i - (w - 1) / 2) / (w / 2);
    const h = 2 + Math.round(mid * 2) + (rng() < 0.3 ? 1 : 0);
    const lean = h >= 4 ? 2 : 1;
    for (let k = 1; k <= h; k++) {
      const dx = Math.floor((k * lean) / (h + 1));
      const lit = i < w / 2 || k === h;
      plot.set(wrap(x + dx), baseY - k, 'thatch', k === 1 ? 1 : lit ? 3 : 2);
    }
  }
}

/**
 * Steppe sward over `area` (from 0, 0): a dry ground of thatch 2 with soft green under-layer streaks (grass 2, 3–6-px
 * horizontal runs, ~12 %), umber specks, and wind-combed tussocks (`tussock`) 5–9 px wide on a jittered grid — the
 * grain is strokes and clumps, never a per-pixel checker. Everything wraps horizontally, so tiles meet seamlessly.
 */
export function steppeField(plot: Plot, area: SteppeArea, seed: string): void {
  const rng = seededRng(`${seed}:steppe`);
  for (let y = 0; y < area.h; y++) for (let x = 0; x < area.w; x++) plot.set(x, y, 'thatch', 2);
  const wrap = (x: number): number => ((x % area.w) + area.w) % area.w;
  const runs = Math.round((area.w * area.h * 0.12) / 4.5);
  for (let i = 0; i < runs; i++) {
    const len = int(rng, 3, 6);
    const x0 = int(rng, 0, area.w - 1);
    const y = int(rng, 0, area.h - 1);
    for (let k = 0; k < len; k++) plot.set(wrap(x0 + k), y, 'grass', 2);
  }
  for (let i = 0; i < Math.round((area.w * area.h) / 300); i++) {
    plot.set(int(rng, 0, area.w - 1), int(rng, 0, area.h - 1), 'earth', 2);
  }
  // Tussocks: rows 7 px apart, every 9–13 px along a row, each row's phase jittered.
  for (let row = 6; row < area.h + 4; row += 7) {
    for (let x = int(rng, 0, 8); x < area.w; x += int(rng, 9, 13)) {
      const base = row + int(rng, -1, 1);
      if (base >= area.h) continue;
      tussock(plot, x, base, int(rng, 5, 9), rng, area.w);
    }
  }
}

/**
 * The grass → steppe seam per column: the first steppe row at x. It wanders smoothly by up to `range` rows (green bays
 * reaching down, dry tongues up), with 1–2-px steps every 2–4 px so it is never a ruler line, easing back to `seam` over
 * the last `ease` px at both ends so every variant meets its neighbours at the same row.
 */
export function steppeEdge(w: number, seam: number, range: number, ease: number, seed: string): number[] {
  const rng = seededRng(`${seed}:edge`);
  const s = seedOf(seed);
  const out: number[] = [];
  let jag = 0;
  let next = 0;
  for (let x = 0; x < w; x++) {
    if (x >= next) {
      jag = int(rng, -2, 2);
      next = x + int(rng, 2, 4);
    }
    const t = x / Math.max(1, w - 1);
    const env = Math.min(1, x / ease, (w - 1 - x) / ease);
    // Smooth wander: noise on a 20-px cell plus one slow swell across the tile.
    const n = (valueNoise(x, 0, 20, 1, s) - 0.5) * 1.4 + Math.sin(t * Math.PI * 2 + (s % 7)) * 0.5;
    out.push(Math.max(2, Math.min(29, seam + Math.round((n * range + jag) * env))));
  }
  return out;
}
