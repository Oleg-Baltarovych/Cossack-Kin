// Zone-edge ground recipes of the continuous world (plan M2-01, art-director seam review): flat decals drawn over the
// ground tiles where the suburb meets the Sich and where the Dnipro ends. Top-left anchored; transparent outside the
// shape so the tiles under them show through.
// - `val-end`      the rampart's left end: the val tile (same pixels) cut by a 1-px-per-row diagonal ramp, a lit earth
//                lip on the ramp, a grass-tuft fringe, grass beyond it;
// - `maidan-edge`   the maidan's left edge: grass over a ragged edge (2–6 px steps every 6–10 rows, like `maidan-end`),
//                earth crumbs into the grass, tufts over the dirt, a rounded bottom-left corner;
// - `road-mouth` the road's end at the Sich: it widens into a ragged dirt mouth and its ruts bend up-right;
// - `road-track`    the road's ruts running on across the maidan to the gate (faint dashes, like `trail`);
// - `bank`       where the river ends: a sand lip along the 2:1 waterline, a darker clay face behind it, granite
//                boulders on the waterline, a reed clump at the foot.
// Recipe parts: `light: false`, `occlusion: false`, no outline (ground).
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { compose } from './passes.ts';
import { Plot } from './plot.ts';
import { grassField, grassTuft, pebbles } from './recipes.ts';
import { reeds } from './recipes-plants.ts';
import { seedOf, valueNoise } from './noise.ts';
import { seededRng } from './rng.ts';
import type { SpriteGenerator } from './types.ts';
import { paintVal } from '../khortytsia/ground/index.ts';

/** Piece → frame size (logical px) and the recipe that draws it. */
export const EDGE_SIZES = {
  'val-end': { w: 64, h: 32 },
  'maidan-edge': { w: 24, h: 256 },
  'road-mouth': { w: 88, h: 64 },
  'road-track': { w: 192, h: 96 },
  bank: { w: 72, h: 40 },
} as const;
export type EdgePiece = keyof typeof EDGE_SIZES;

/** The river's rows and the decal's left edge: `bank` puts each row's end where render/zones.ts ends the water. */
const RIVER = KHORTYTSIA_WORLD.river ?? { x0: 0, x1: 0, rows: 0, taper: 0 };
/** Columns of land left of the nearest row's end inside the `bank` frame. */
export const BANK_MARGIN = 10;
const rowEnd = (r: number): number => {
  const near = RIVER.rows > 1 ? r / (RIVER.rows - 1) : 1;
  return RIVER.taper + BANK_MARGIN - Math.round(RIVER.taper * near);
};

const grassOver = (plot: Plot, w: number, h: number, seed: string, keep: (x: number, y: number) => boolean): void => {
  const grass = new Plot();
  for (let y = 0; y < h; y += 32) {
    for (let x = 0; x < w; x += 32)
      grassField(grass, { x, y, w: 32, h: Math.min(32, h - y) }, `${seed}:${String(x)}:${String(y)}`, {
        tufts: 6,
        flecks: 1,
      });
  }
  for (const [key, px] of grass.px) {
    const x = key % 4096;
    const y = Math.floor(key / 4096);
    if (x < w && y < h && keep(x, y)) plot.set(x, y, px.ramp, px.shade);
  }
};

function valEnd(plot: Plot): void {
  const { w, h } = EDGE_SIZES['val-end'];
  paintVal(plot);
  // The ramp: the crest starts 46 px in (just left of the corner tower's base), the toe at 18 px — one px per row, the
  // earth's end lit (top-left light).
  const edge = (y: number): number => 46 - Math.round((y * 28) / (h - 1));
  for (let y = 0; y < h; y++) {
    const e = edge(y);
    for (let x = 0; x < e; x++) plot.delete(x, y);
    plot.set(e, y, 'earth', 5);
    plot.set(e + 1, y, 'earth', 4);
  }
  grassOver(plot, w, h, 'val-end', (x, y) => x < edge(y));
  // Tuft fringe along the ramp: grass blades leaning onto the lip every 3–5 rows; a dithered toe into the grass.
  const rng = seededRng('val-end:fringe');
  for (let y = 1; y < h; y += 3 + Math.floor(rng() * 3)) {
    const e = edge(y);
    plot.set(e, y, 'grass', 3);
    plot.set(e - 1, y - 1, 'grass', 4);
    if (rng() < 0.5) plot.set(e + 1, y, 'grass', 2);
  }
  for (let x = 14; x < 20; x++) if (x % 2 === 0) plot.set(x, h - 1, 'earth', 1);
}

function maidanEnd(plot: Plot): void {
  const { w, h } = EDGE_SIZES['maidan-edge'];
  const rng = seededRng('maidan-edge');
  // Ragged edge: 8 ± 2–6 px, held for 6–10 rows; the last 32 rows round off into the maidan-end's grass.
  const steps: number[] = [];
  let e = 8;
  for (let y = 0; y < h; y++) {
    if (y % 8 === 0) e = 6 + Math.floor(rng() * 7);
    steps.push(e);
  }
  const corner = { y: 224 + 9, r: 16 };
  const edge = (y: number): number => {
    const base = steps[y] ?? 8;
    const dy = y - (corner.y - corner.r);
    if (dy <= 0) return base;
    if (dy >= corner.r) return w;
    return Math.min(w, Math.round(base + corner.r - Math.sqrt(corner.r * corner.r - dy * dy)));
  };
  grassOver(plot, w, h, 'maidan-edge', (x, y) => x < edge(y));
  for (let y = 0; y < h; y++) {
    const x = edge(y);
    if (x >= w) continue;
    // The dirt's rim one step darker (as on maidan-end), crumbs out into the grass, a tuft over the dirt.
    plot.set(x, y, 'earth', 2);
    if (rng() < 0.15 && x > 2) plot.set(x - 2 - Math.floor(rng() * 2), y, 'earth', 3);
    if (rng() < 0.08 && x + 2 < w) {
      plot.set(x + 1, y, 'grass', 3);
      plot.set(x + 1, y - 1, 'grass', 4);
    }
  }
}

/** Bayer 4×4 threshold 0..1 at (x, y). */
const bayer4 = (x: number, y: number): number =>
  ((([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const)[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;

function roadMouth(plot: Plot): void {
  const { w, h } = EDGE_SIZES['road-mouth'];
  const rng = seededRng('road-mouth');
  const clodSeed = seedOf('road-mouth:clods');
  /** A 2-px-wide clod cell (rows paired at random) is earth with a share rising 25 % → 75 % over x 24–36. */
  const clod = (x: number, y: number): boolean => {
    const cx = Math.floor(x / 2);
    const cy = Math.floor((y + (cx % 2)) / (valueNoise(cx, 0, 1, 1, clodSeed) < 0.5 ? 1 : 2));
    return valueNoise(cx * 7, cy * 5, 1, 1, clodSeed + 1) < 0.25 + ((x - 24) / 12) * 0.5;
  };
  // The road band is rows 16–47 here (ground 128–160); from x 24 it widens and its ruts bend up-right.
  const flare = (x: number): number => Math.max(0, x - 24);
  let jitter = 0;
  for (let x = 0; x < w; x++) {
    if (x % 4 === 0) jitter = Math.floor(rng() * 3) - 1;
    const top = 16 - Math.round(flare(x) * 0.22) + jitter;
    const bottom = 48 + Math.round(flare(x) * 0.18) - jitter;
    for (let y = Math.max(0, top); y < Math.min(h, bottom); y++) {
      // Inside the old road (x < 24) only the edges change; over the next 12 px the mouth's earth starts as clods
      // (2×1 / 2×2, from 25 % to 75 %, ragged — no checker) so it grows out of the road tile.
      if (x < 24 && y >= 16 && y < 48) continue;
      if (x < 36 && y >= 16 && y < 48 && !clod(x, y)) continue;
      // The road's earth 4 with soft blotches, dithering over the last 40 px into the maidan's earth 3 (no seam).
      const toMaidan = (x - (w - 40)) / 40;
      const blotch = valueNoise(x, y, 7, 4, seedOf('road-mouth')) < 0.32;
      const maidan = toMaidan > 0 && bayer4(x, y) < toMaidan;
      const lit = !maidan && x < w - 24 && y < top + 2 && (x + y) % 2 === 0;
      plot.set(x, y, 'earth', lit ? 5 : blotch || maidan ? 3 : 4);
    }
    // Ruts (rows 27 and 37 of the road) bending up-right past x 36 toward the gate (the road-track picks them up).
    const lift = x > 36 ? Math.round(((x - 36) * (x - 36)) / 160) : 0;
    if (x >= 24 && (x + Math.floor(rng() * 2)) % 6 !== 0) {
      for (const r of [27, 37]) if (r - lift > Math.max(0, top)) plot.set(x, r - lift, 'earth', 2);
    }
    // Grass biting into the mouth's edges.
    if (rng() < 0.3) plot.set(x, Math.max(0, top), 'grass', 3);
    if (rng() < 0.3 && bottom - 1 < h) plot.set(x, bottom - 1, 'grass', 3);
  }
  pebbles(plot, { x: 26, y: 12, w: w - 30, h: h - 24 }, 'road-mouth', 3, (x, y) => plot.get(x, y)?.ramp === 'earth');
}

function track(plot: Plot): void {
  const { w, h } = EDGE_SIZES['road-track'];
  const rng = seededRng('road-track');
  // From the road's mouth (bottom-left) to the gate (top-right): two rut lines of 1-px dashes, 3 rows apart.
  const steps = w - 8;
  for (const offset of [0, 3]) {
    let on = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < steps; i++) {
      on -= 1;
      if (on < 0) {
        if (on < -(1 + Math.floor(rng() * 3))) on = 3 + Math.floor(rng() * 4);
        continue;
      }
      const x = 4 + i;
      const y = Math.round(h - 6 - ((h - 10) * i) / steps) + offset;
      if (y >= 0 && y < h) plot.set(x, y, 'earth', 4);
    }
  }
}

function bank(plot: Plot): void {
  const { h } = EDGE_SIZES.bank;
  const rows = RIVER.rows;
  // The clay face under the lip: 4 rows deep below every lip px (it faces the viewer, in shadow; light comes from the
  // top-left), darkest right under the lip, its lower edge dithered into the meadow.
  for (let r = 0; r < rows; r++) {
    const e = rowEnd(r);
    for (let k = 1; k <= 4; k++) {
      for (const x of [e, e + 1]) {
        if (k === 4 && (x + r) % 2 === 0) continue;
        plot.set(x, r + k, 'earth', k <= 2 ? 1 : 2);
      }
    }
  }
  // The waterline: a sand lip as wide as the row's step (a clean 2:1 diagonal), lit.
  for (let r = 0; r < rows; r++) {
    const e = rowEnd(r);
    plot.set(e, r, 'earth', 5);
    plot.set(e + 1, r, 'earth', 4);
  }
  // Grass tufts along the top of the lip.
  for (let r = 3; r < rows - 2; r += 5) grassTuft(plot, rowEnd(r) + 8, r, 3, 3, r % 2 === 0);
  // Granite boulders on the waterline (the river's `rocks` rows: the water foams at them): 5×4, a 1-px top-left
  // highlight, a darker underside, the corners rounded off.
  for (const r of RIVER.rocks ?? []) {
    const x0 = rowEnd(r);
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 5; dx++) {
        if ((dy === 0 || dy === 3) && (dx === 0 || dx === 4)) continue;
        const shade = dy === 3 ? 1 : dx === 4 ? 2 : (dy === 0 && dx < 3) || (dx === 0 && dy < 2) ? 5 : 3;
        plot.set(x0 + dx, r - 2 + dy, 'stone', shade);
      }
    }
  }
  // A reed clump (the foreground reed recipe, small) at the water's end, on the land past the last rows.
  const foot = rowEnd(rows - 1);
  reeds(plot, foot + 4, 12, h - 4, 12, 'bank');
}

const RECIPES: Readonly<Record<EdgePiece, (plot: Plot) => void>> = {
  'val-end': valEnd,
  'maidan-edge': maidanEnd,
  'road-mouth': roadMouth,
  'road-track': track,
  bank,
};

/** A generator for one edge piece (one frame; a decal anchored top-left, the road's mouth top-right). */
export function edgeGenerator(piece: EdgePiece): SpriteGenerator {
  return {
    atlas: 'khortytsia',
    id: piece,
    size: EDGE_SIZES[piece],
    frames: { idle: 1 },
    // The road's mouth hangs left of its pivot (it is placed from the Sich's side, over the maidan's edge).
    anchor: piece === 'road-mouth' ? { x: 1, y: 0 } : { x: 0, y: 0 },
    generate(_rng, { buffer, rampSize }) {
      const plot = new Plot();
      RECIPES[piece](plot);
      compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
    },
  };
}
