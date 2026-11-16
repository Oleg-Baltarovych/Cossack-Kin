// Ground tiles for the Khortytsia farm (plan ART-05; recipes docs/art/recipes/materials-1.md "Grass", "Earth and
// path"). One 64×32 opaque tile per variant, tiled by render/layers/Ground.ts in the depth rows of
// src/content/villages/khortytsia.layout.ts:
// - `meadow` far grass near the horizon: few small tufts, one step lighter (aerial perspective), no flecks;
// - `grass`  near grass: ground + 6–8 tufts per 32×32 half + gold flecks;
// - `path`   packed earth with two wavering ruts and grass biting in from both edges;
// - `earth`  packed earth without ruts, one step deeper (the strip under the bottom sheet).
// Recipe parts: `light: false`, `occlusion: false` (the recipes already place every shade), no outline (tiles meet
// edge to edge).
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { grassField, pathField, pebbles } from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const GROUND_TILE = { w: 64, h: 32 } as const;
const { w: W, h: H } = GROUND_TILE;
const HALF = W / 2;

/** Shifts every px by `steps` ramp steps (+1 far meadow: lighter, hazier; −1 near earth: deeper). */
function shift(plot: Plot, steps: number): void {
  for (const [key, px] of [...plot.px.entries()].sort((a, b) => a[0] - b[0])) {
    plot.px.set(key, { ...px, shade: Math.max(0, px.shade + steps) });
  }
}

const ground: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'ground',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: ['meadow', 'grass', 'path', 'earth'],
  anchor: { x: 0, y: 0 },
  generate(_rng, { variant, buffer, rampSize }) {
    const plot = new Plot();
    const seed = `ground.${variant ?? 'grass'}`;
    switch (variant) {
      case 'meadow':
        grassField(plot, { x: 0, y: 0, w: HALF, h: H }, `${seed}:a`, { tufts: 3, flecks: 0 });
        grassField(plot, { x: HALF, y: 0, w: HALF, h: H }, `${seed}:b`, { tufts: 2, flecks: 0 });
        shift(plot, 1);
        break;
      case 'path':
        pathField(plot, { seed, x: 0, y: 0, w: W, h: H, ruts: [11, 21], grass: { top: 3, bottom: 3 } });
        pebbles(plot, { x: 2, y: 5, w: W - 4, h: H - 10 }, seed, 4, (x, y) => plot.get(x, y)?.ramp === 'earth');
        break;
      case 'earth':
        pathField(plot, { seed, x: 0, y: 0, w: W, h: H, ruts: [], grass: { top: 0, bottom: 0 } });
        pebbles(plot, { x: 2, y: 2, w: W - 4, h: H - 4 }, seed, 6);
        shift(plot, -1);
        break;
      default:
        grassField(plot, { x: 0, y: 0, w: HALF, h: H }, `${seed}:a`, { tufts: 7, flecks: 2 });
        grassField(plot, { x: HALF, y: 0, w: HALF, h: H }, `${seed}:b`, { tufts: 6, flecks: 1 });
    }
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default ground;
