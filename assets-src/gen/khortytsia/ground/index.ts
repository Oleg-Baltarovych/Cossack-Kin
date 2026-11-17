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
// Recipe parts: `light: false`, `occlusion: false` (the recipes already place every shade), no outline (tiles meet
// edge to edge).
import { compose } from '../../lib/passes.ts';
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
  ],
  anchor: { x: 0, y: 0 },
  generate(_rng, { variant, buffer, rampSize }) {
    const plot = new Plot();
    const seed = `ground.${variant ?? 'grass'}`;
    switch (variant) {
      case 'meadow':
        grassField(plot, { x: 0, y: 0, w: HALF, h: H }, `${seed}:a`, { tufts: 3, flecks: 0 });
        grassField(plot, { x: HALF, y: 0, w: HALF, h: H }, `${seed}:b`, { tufts: 2, flecks: 0 });
        shift(plot, 1, 2);
        break;
      case 'path':
        pathField(plot, { seed, x: 0, y: 0, w: W, h: H, ruts: [11, 21], grass: { top: 3, bottom: 3 } });
        pebbles(plot, { x: 2, y: 5, w: W - 4, h: H - 10 }, seed, 4, (x, y) => plot.get(x, y)?.ramp === 'earth');
        break;
      case 'earth':
      case 'earth-b':
      case 'earth-c':
        pathField(plot, { seed, x: 0, y: 0, w: W, h: H, ruts: [], grass: { top: 0, bottom: 0 } });
        pebbles(plot, { x: 2, y: 2, w: W - 4, h: H - 4 }, seed, 6);
        shift(plot, -1);
        break;
      case 'val': {
        // Вал (ART-11, art-director review): the rampart's inner slope under the palisade, not a road — a 3-row grassy
        // crest (grass 4/3, ragged), earth stepping darker down the slope (4 → 3 → 2 → 1, 2-row checker seams) with
        // horizontal slump smears, a 2-row dark toe (earth 0/1) broken every 6–10 px by grass tufts from the maidan.
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
        break;
      }
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
