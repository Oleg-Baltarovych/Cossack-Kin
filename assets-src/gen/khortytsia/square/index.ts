// Майдан ярмарку — the fair's trodden square (plan M2-08): a ground decal under the stalls — the road's packed earth
// in a ragged ellipse 176×44 whose rim dithers out in a darker ochre, two worn foot paths running up to the road (the
// decal's top row lies on the road's bottom edge), hoofprints, straw and a few pebbles. Drawn under the shadows; the
// pivot is the centre of the ellipse (the canvas reaches 44 rows above it for the paths).
import { seedOf, valueNoise } from '../../lib/noise.ts';
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { pebbles } from '../../lib/recipes.ts';
import { trodPatch } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 176;
const ELLIPSE_H = 44;
/** Rows from the road's bottom edge down to the ellipse's top. */
const PATHS = 44;
const H = PATHS + ELLIPSE_H;

const square: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'square',
  size: { w: W, h: H },
  frames: { idle: 1 },
  anchor: { x: 0.5, y: (PATHS + ELLIPSE_H / 2) / H },
  generate(_rng, { buffer, rampSize }) {
    const seed = 'square';
    const s = seedOf(seed);
    const plot = new Plot();
    trodPatch(plot, W, ELLIPSE_H, PATHS, [58, 122], seed, (x, y) => valueNoise(x, y, 9, 4, s));
    pebbles(
      plot,
      { x: 24, y: PATHS + 8, w: W - 48, h: ELLIPSE_H - 16 },
      seed,
      6,
      (x, y) => plot.get(x, y)?.shade === 4,
    );
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default square;
