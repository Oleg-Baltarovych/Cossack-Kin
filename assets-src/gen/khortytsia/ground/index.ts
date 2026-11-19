// Ground tiles for the Khortytsia farm (plan ART-05; recipes docs/art/recipes/materials-1.md "Grass", "Earth and
// path"). One 64×32 opaque tile per variant, tiled by render/layers/Ground.ts in the depth rows of
// src/content/villages/khortytsia.layout.ts:
// - `meadow` far grass near the horizon: few small tufts, one step lighter (aerial perspective), no flecks; the
//   bottom 2 rows dither back to the near-grass shades (50 %, 25 %), so the seam to the next row is not ruler-hard;
// - `grass`, `grass-b`, `grass-c` near grass: ground + 6–8 tufts per 32×32 half + gold flecks; three seeds, picked
//   per tile by Ground.ts so the tuft pattern does not repeat on a visible 64×32 grid (art-director ART-05 review);
// - `path`   packed earth with two wavering ruts and grass biting in from both edges;
// - `earth`  packed earth without ruts, one step deeper (the Sich maidan, the strip under the bottom sheet);
// - `val`    the Sich rampart's inner slope: grassy crest, packed earth with slump smears, a dark toe (ART-11).
// - `road`   the suburb's road (M2-08): the `path` tile pixel for pixel (same ruts, so the seams with the farm's path
//            stay clean) with hoofprints, straw wisps and dung between the ruts — horses and carts come to the fair;
// - `trodden`, `trodden-b`, `trodden-c` the suburb's front row (M2-08): near grass worn bald in patches by feet and
//            hooves, straw blown off the carts — a different worn shape per variant (dents / a long stroke / a ragged
//            patch, anywhere in the tile: no polka-dot rhythm); the wear keeps 6 px off the tile's sides.
// - `moat`   the `val` slope with the moat along its toe (walls II, M2-09): lit far edge, dark water, the near lip;
// - `rampart` walls III+: the moat plus a plank fighting walk under the palisade and a revetment of short stake heads
//            under a turf lip (periods divide 64: tiles meet seamlessly);
// - `ditch`  the moat outside the walls (walls II+) in the row behind the palisade, turfed with the `meadow` tile.
// Recipe parts: `light: false`, `occlusion: false` (the recipes already place every shade), no outline (tiles meet
// edge to edge).
import { compose } from '../../lib/passes.ts';
import { seedOf, valueNoise } from '../../lib/noise.ts';
import { seededRng } from '../../lib/rng.ts';
import { Plot } from '../../lib/plot.ts';
import { grassField, pathField, pebbles } from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const GROUND_TILE = { w: 64, h: 32 } as const;
const { w: W, h: H } = GROUND_TILE;
const HALF = W / 2;

const KEY = 4096; // Plot's row stride
/** Bayer 2×2 rank 0..3 of (x, y). */
const bayer2 = (x: number, y: number): number => [0, 2, 3, 1][(y % 2) * 2 + (x % 2)] ?? 0;

/**
 * Shifts px by `steps` ramp steps (+1 far meadow: lighter, hazier; −1 near earth: deeper). `fade` rows at the bottom
 * shift only on a thinning Bayer share (2 rows: 50 % then 25 %), a dithered seam to the next row.
 */
function shift(plot: Plot, steps: number, fade = 0): void {
  for (const [key, px] of [...plot.px.entries()].sort((a, b) => a[0] - b[0])) {
    const x = key % KEY;
    const y = Math.floor(key / KEY);
    const fromBottom = H - 1 - y;
    if (fromBottom < fade && bayer2(x, y) >= (fromBottom + 1) * (4 / (fade + 1)) - 1) continue;
    plot.px.set(key, { ...px, shade: Math.max(0, px.shade + steps) });
  }
}

/**
 * Вал (ART-11, art-director review): the rampart's inner slope under the palisade, not a road — a 3-row grassy crest
 * (grass 4/3, ragged), earth stepping darker down the slope (4 → 3 → 2 → 1, 2-row checker seams) with horizontal slump
 * smears, a 2-row dark toe (earth 0/1) broken every 6–10 px by grass tufts from the maidan. Shared with the rampart's
 * end piece (`val-end`, M2-01), which must continue this tile pixel for pixel.
 */
/** Rows of the moat at the rampart's toe (walls II+, art-director M2-09): lit far edge, dark water, the near lip. */
const MOAT: Readonly<Record<'edge' | 'top' | 'bottom' | 'lip', number>> = { edge: 23, top: 24, bottom: 27, lip: 27 };

/**
 * The moat along the rampart's front (walls II+): a 1-px lit top edge (the far bank catching the light), 3 rows of dark
 * still water with sparse lit ripples (period 16: tiles meet), a darker earth lip on the near side.
 */
function paintMoat(plot: Plot): void {
  for (let x = 0; x < W; x++) {
    plot.set(x, MOAT.edge, 'earth', 4);
    for (let y = MOAT.top; y < MOAT.bottom; y++) {
      const ripple = y === MOAT.top + 1 && x % 16 < 3 && (x >> 4) % 2 === 0;
      plot.set(x, y, 'water', ripple ? 3 : y === MOAT.top ? 0 : 1);
    }
    plot.set(x, MOAT.lip, 'earth', 1);
    plot.set(x, MOAT.lip + 1, 'earth', 2);
  }
}

/**
 * Rampart (walls III+, art-director M2-09): a plank walk under the palisade (rows 3–5) and a revetment of short
 * vertical stake heads every 2–3 px under a 1-px turf lip, a 1-px contact shadow under them, a darker post every 32 px
 * (periods divide 64: tiles meet), then the moat.
 */
function paintRampart(plot: Plot): void {
  const walk = { top: 3, rows: 3 };
  for (let x = 0; x < W; x++) {
    // Planks 8 px long with a dark joint; the front edge in shade.
    for (let k = 0; k < walk.rows; k++) {
      const joint = x % 8 === 7 && k < 2;
      plot.set(x, walk.top + k, 'wood', k === walk.rows - 1 ? 1 : joint ? 2 : k === 0 ? 5 : 4);
    }
    plot.set(x, walk.top + walk.rows, 'earth', 1);
  }
  const rev = { lip: 14, top: 15, bottom: 20 };
  /** Stake columns: gaps of 3, 2, 3 px (period 8). */
  const stake = (x: number): boolean => [0, 3, 5].includes(x % 8);
  for (let x = 0; x < W; x++) {
    plot.set(x, rev.lip, 'grass', x % 3 === 0 ? 4 : 3);
    for (let y = rev.top; y < rev.bottom; y++) {
      if (stake(x)) plot.set(x, y, 'wood', y === rev.top ? 5 : y < rev.top + 2 ? 4 : 3);
      else plot.set(x, y, 'wood', y === rev.top ? 2 : 1);
    }
    plot.set(x, rev.bottom, 'earth', 0);
  }
  for (let x = 30; x < W; x += 32) {
    for (let y = rev.lip - 1; y <= rev.bottom; y++) {
      plot.set(x, y, 'wood', y === rev.lip - 1 ? 2 : 1);
      plot.set(x + 1, y, 'wood', 0);
    }
  }
  paintMoat(plot);
}

/**
 * The moat outside the walls from walls II, in the row behind the palisade: the far lip, dark still water with lit
 * ripples, the rampart's outer foot turfed with the `meadow` tile itself (the seam to the river bank stays clean).
 */
function paintDitch(plot: Plot, seed: string): void {
  paintMeadow(plot, 'ground.meadow');
  const rng = seededRng(`${seed}:ripples`);
  const water = { top: 3, bottom: 9 };
  for (let y = 0; y < water.bottom + 2; y++) {
    for (let x = 0; x < W; x++) {
      if (y < water.top) continue;
      else if (y < water.bottom) plot.set(x, y, 'water', y === water.top ? 1 : y < water.top + 3 ? 2 : 1);
      else plot.set(x, y, 'earth', y === water.bottom ? 1 : 2);
    }
  }
  for (let k = 0; k < 6; k++) {
    const y = water.top + 2 + Math.floor(rng() * (water.bottom - water.top - 3));
    const x0 = Math.floor(rng() * W);
    const len = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < len; i++) plot.set((x0 + i) % W, y, 'water', 4);
  }
}

/** The far meadow tile (`meadow`): sparse tufts one step lighter, dithered into the near grass at the bottom. */
function paintMeadow(plot: Plot, seed: string): void {
  grassField(plot, { x: 0, y: 0, w: HALF, h: H }, `${seed}:a`, { tufts: 3, flecks: 0 });
  grassField(plot, { x: HALF, y: 0, w: HALF, h: H }, `${seed}:b`, { tufts: 2, flecks: 0 });
  shift(plot, 1, 2);
}

export function paintVal(plot: Plot): void {
  const seed = 'ground.val';
  const rng = seededRng(`${seed}:slope`);
  const bands: readonly (readonly [number, number])[] = [
    [3, 4],
    [10, 3],
    [18, 2],
    [25, 1],
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let shade = 4;
      for (const [top, sh] of bands) {
        if (y >= top) shade = sh;
        // 2-row checker seam into the next band.
        if ((y === top || y === top + 1) && (x + y) % 2 === 0) shade = Math.min(4, sh + 1);
      }
      plot.set(x, y, 'earth', shade);
    }
  }
  // Slump smears: short horizontal dashes one step darker.
  for (let k = 0; k < 14; k++) {
    const y = 5 + Math.floor(rng() * 20);
    const x0 = Math.floor(rng() * W);
    const len = 3 + Math.floor(rng() * 6);
    for (let i = 0; i < len; i++) {
      const x = (x0 + i) % W;
      const px = plot.get(x, y);
      if (px) plot.set(x, y, 'earth', Math.max(0, px.shade - 1));
    }
  }
  for (let x = 0; x < W; x++) {
    const crest = 3 + (rng() < 0.3 ? 1 : 0);
    for (let y = 0; y < crest; y++) plot.set(x, y, 'grass', y === 0 ? 4 : y === crest - 1 ? 2 : 3);
    plot.set(x, H - 2, 'earth', 1);
    plot.set(x, H - 1, 'earth', 0);
  }
  // Toe broken by grass tufts every 6–10 px.
  for (let x = Math.floor(rng() * 6); x < W - 1; x += 6 + Math.floor(rng() * 5)) {
    plot.set(x, H - 1, 'grass', 2);
    plot.set(x, H - 2, 'grass', 3);
    plot.set(x + 1, H - 1, 'grass', 3);
    if (rng() < 0.5) plot.set(x, H - 3, 'grass', 3);
  }
  pebbles(plot, { x: 2, y: 8, w: W - 4, h: H - 14 }, seed, 2);
}

/** The farm path (ART-05): packed earth, two ruts, grass biting in; `road` paints it first (same seed). */
function paintPath(plot: Plot): void {
  const seed = 'ground.path';
  pathField(plot, { seed, x: 0, y: 0, w: W, h: H, ruts: [11, 21], grass: { top: 3, bottom: 3 } });
  pebbles(plot, { x: 2, y: 5, w: W - 4, h: H - 10 }, seed, 4, (x, y) => plot.get(x, y)?.ramp === 'earth');
}

/**
 * Traffic on the suburb road (M2-08): hoofprints (a 3-px earth 2 «U» opening up the road), straw wisps fallen from
 * the carts (thatch 4 with a thatch 2 end, 2–3 px, lying along the road) and a dung dot (earth 1 with a lit earth 3
 * top) — only on earth px between the grass edges, never on a rut lip.
 */
function roadLife(plot: Plot, seed: string): void {
  const rng = seededRng(`${seed}:life`);
  const onEarth = (x: number, y: number): boolean => {
    const px = plot.get(x, y);
    return px?.ramp === 'earth' && px.shade >= 3 && px.shade <= 4;
  };
  for (let k = 0, placed = 0; k < 40 && placed < 4; k++) {
    const x = 2 + Math.floor(rng() * (W - 6));
    const y = 6 + Math.floor(rng() * (H - 13));
    if (!onEarth(x, y) || !onEarth(x + 2, y) || !onEarth(x + 1, y + 1)) continue;
    plot.set(x, y, 'earth', 2);
    plot.set(x + 2, y, 'earth', 2);
    plot.set(x + 1, y + 1, 'earth', 2);
    placed++;
  }
  for (let k = 0, placed = 0; k < 40 && placed < 3; k++) {
    const x = 2 + Math.floor(rng() * (W - 6));
    const y = 5 + Math.floor(rng() * (H - 10));
    const len = 2 + Math.floor(rng() * 2);
    let ok = true;
    for (let i = 0; i < len; i++) ok = ok && onEarth(x + i, y);
    if (!ok) continue;
    for (let i = 0; i < len; i++) plot.set(x + i, y, 'thatch', i === len - 1 ? 2 : 4);
    placed++;
  }
  for (let k = 0; k < 40; k++) {
    const x = 4 + Math.floor(rng() * (W - 8));
    const y = 7 + Math.floor(rng() * (H - 14));
    if (!onEarth(x, y) || !onEarth(x + 1, y) || !onEarth(x, y - 1)) continue;
    plot.set(x, y - 1, 'earth', 3);
    plot.set(x, y, 'earth', 1);
    plot.set(x + 1, y, 'earth', 1);
    break;
  }
}

/**
 * Trodden grass (M2-08): the near-grass recipe, worn bald by `wear` (0 two small dents, 1 a long stroke, 2 a ragged
 * patch and a satellite: earth 3 inside, earth 2 dithering into the grass), straw wisps on the grass. Patches stay ≥ 6 px from the sides and
 * ≥ 3 px from the top/bottom so neighbouring tiles (and the plain grass across a zone edge) meet on grass.
 */
function paintTrodden(plot: Plot, seed: string, wear: number): void {
  const flip = wear === 1;
  grassField(plot, { x: 0, y: 0, w: HALF, h: H }, `${seed}:a`, { tufts: flip ? 4 : 5, flecks: 1 });
  grassField(plot, { x: HALF, y: 0, w: HALF, h: H }, `${seed}:b`, { tufts: flip ? 5 : 4, flecks: 1 });
  const rng = seededRng(`${seed}:patches`);
  const s = seedOf(seed);
  // Wear by variant, each its own shape so the tile grid never shows as a polka-dot rhythm (art-director M2-08): two
  // short hoof-worn dents, one long stroke along the road, or a ragged patch with a small satellite; positions free.
  const shape = (rx: number, ry: number): readonly [number, number] => [rx, ry];
  const shapes =
    [
      [shape(3, 1), shape(2, 1)],
      [shape(9 + Math.floor(rng() * 4), 1)],
      [shape(6 + Math.floor(rng() * 4), 2 + Math.floor(rng() * 2)), shape(2, 1)],
    ][wear] ?? [];
  for (const [k, [rx, ry]] of shapes.entries()) {
    const cx = 6 + rx + Math.floor(rng() * Math.max(1, W - 12 - 2 * rx));
    const cy = 3 + ry + Math.floor(rng() * Math.max(1, H - 6 - 2 * ry));
    /** Distance in the ragged ellipse: < 0.6 bare, 0.6–0.85 bare on half the px, 0.85–1 on a quarter (into grass). */
    const dist = (x: number, y: number): number => {
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      return u * u + v * v + 0.6 * (valueNoise(x, y, 4, 2, s + k) - 0.5);
    };
    for (let y = cy - ry - 2; y <= cy + ry + 2; y++) {
      for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
        if (x < 6 || x >= W - 6 || y < 3 || y >= H - 3) continue;
        const d = dist(x, y);
        const bare = d < 0.6 || (d < 0.85 && (x + y) % 2 === 0) || (d < 1 && x % 2 === 0 && y % 2 === 0);
        if (!bare) continue;
        // Worn turf, not a dug hole: earth 2 at the rim (in the grass's value), earth 3 inside, a hoof dent here and there.
        plot.set(x, y, 'earth', d >= 0.6 || (x * 7 + y * 3) % 23 === 0 ? 2 : 3);
      }
    }
  }
  for (let k = 0; k < 3; k++) {
    const x = 6 + Math.floor(rng() * (W - 14));
    const y = 3 + Math.floor(rng() * (H - 6));
    if (plot.get(x, y)?.ramp !== 'grass') continue;
    plot.set(x, y, 'thatch', 4);
    plot.set(x + 1, y, 'thatch', 3);
  }
}

const ground: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'ground',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: [
    'meadow',
    'grass',
    'grass-b',
    'grass-c',
    'path',
    'earth',
    'earth-b',
    'earth-c',
    'val',
    'maidan',
    'maidan-b',
    'maidan-c',
    'maidan-end',
    'road',
    'trodden',
    'trodden-b',
    'trodden-c',
    'moat',
    'rampart',
    'ditch',
  ],
  anchor: { x: 0, y: 0 },
  generate(_rng, { variant, buffer, rampSize }) {
    const plot = new Plot();
    const seed = `ground.${variant ?? 'grass'}`;
    switch (variant) {
      case 'meadow':
        paintMeadow(plot, seed);
        break;
      case 'path':
        paintPath(plot);
        break;
      case 'road':
        paintPath(plot);
        roadLife(plot, seed);
        break;
      case 'trodden':
      case 'trodden-b':
      case 'trodden-c':
        paintTrodden(plot, seed, variant === 'trodden' ? 0 : variant === 'trodden-b' ? 1 : 2);
        break;
      case 'earth':
      case 'earth-b':
      case 'earth-c':
        pathField(plot, { seed, x: 0, y: 0, w: W, h: H, ruts: [], grass: { top: 0, bottom: 0 } });
        pebbles(plot, { x: 2, y: 2, w: W - 4, h: H - 4 }, seed, 6);
        shift(plot, -1);
        break;
      case 'val':
        paintVal(plot);
        break;
      case 'moat':
        paintVal(plot);
        paintMoat(plot);
        break;
      case 'rampart':
        paintVal(plot);
        paintRampart(plot);
        break;
      case 'ditch':
        paintDitch(plot, seed);
        break;
      case 'maidan-end': {
        // Where the maidan meets the grass (art-director ART-11 note): earth 3 giving way to grass over a ragged edge
        // — tongues of grass reaching up every 6–10 px, earth crumbs below the line — never a ruler line.
        grassField(plot, { x: 0, y: 0, w: HALF, h: H }, `${seed}:a`, { tufts: 5, flecks: 1 });
        grassField(plot, { x: HALF, y: 0, w: HALF, h: H }, `${seed}:b`, { tufts: 4, flecks: 1 });
        const rng = seededRng(`${seed}:edge`);
        let edge = 8;
        let next = 0;
        for (let x = 0; x < W; x++) {
          if (x >= next) {
            edge = 6 + Math.floor(rng() * 6);
            next = x + 6 + Math.floor(rng() * 5);
          }
          for (let y = 0; y < edge; y++) plot.set(x, y, 'earth', y === edge - 1 ? 2 : 3);
          if (rng() < 0.2) plot.set(x, edge + 1 + Math.floor(rng() * 3), 'earth', 3);
        }
        break;
      }
      case 'maidan':
      case 'maidan-b':
      case 'maidan-c': {
        // The Sich maidan (art-director review): quiet packed earth — earth 3 with sparse earth 2 blotches and rare
        // earth 4 specks (the farm earth's contrast read as camouflage over this area), half the stones.
        pathField(plot, { seed, x: 0, y: 0, w: W, h: H, ruts: [], grass: { top: 0, bottom: 0 } });
        // pathField gives earth 3 blotches / 4 base / 5 light patches: shift the base down to 3, blotches to 2,
        // and keep only every third light px (earth 4 specks).
        for (const [key, px] of [...plot.px.entries()].sort((p, q) => p[0] - q[0])) {
          const x = key % 4096;
          const y = Math.floor(key / 4096);
          const shade = px.shade <= 3 ? 2 : px.shade >= 5 && (x + y) % 3 === 0 ? 4 : 3;
          plot.px.set(key, { ...px, shade });
        }
        pebbles(plot, { x: 2, y: 2, w: W - 4, h: H - 4 }, seed, 3);
        break;
      }
      default: {
        // grass, grass-b, grass-c: same recipe, own seeds; tuft counts swap halves so neighbours differ.
        const flip = variant === 'grass-b';
        grassField(plot, { x: 0, y: 0, w: HALF, h: H }, `${seed}:a`, { tufts: flip ? 6 : 7, flecks: flip ? 1 : 2 });
        grassField(plot, { x: HALF, y: 0, w: HALF, h: H }, `${seed}:b`, { tufts: flip ? 7 : 6, flecks: flip ? 2 : 1 });
      }
    }
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default ground;
