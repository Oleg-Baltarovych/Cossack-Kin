// Тин (wattle fence) segment with a глечик hung upside down on a stake (plan ART-05, ART-BIBLE §5–6, recipes
// docs/art/recipes/materials-1.md). Pivot at the base; contact shadow on the `shadow` layer.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { glechyk, POT_HEIGHT, wattle } from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 40;
const H = 32;
/** Ground row (stakes stand on it); the sprite's pivot is the bottom edge of this row. */
export const TYN_GROUND = 27;
const TOP_ROD = 14;
const POT_STAKE = 2;
const POT_RISE = 5;

const tyn: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'tyn',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (TYN_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const plot = new Plot();
    const stakes = wattle(plot, {
      seed: 'tyn',
      x: 0,
      w: W,
      ground: TYN_GROUND + 1,
      topRod: TOP_ROD,
      rods: 4,
      rise: { [POT_STAKE]: POT_RISE },
    });
    const st = stakes[POT_STAKE];
    if (st) glechyk(plot, st.x, st.top - (POT_HEIGHT - 1));
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: 0, x1: W, groundY: TYN_GROUND, height: 4 });
  },
};

export default tyn;
