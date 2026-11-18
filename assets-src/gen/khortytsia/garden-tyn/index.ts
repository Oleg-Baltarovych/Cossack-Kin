// Тин городу — a low garden wattle (plan M2-06, ART-BIBLE §6 «II — тин і квіти»): two weave courses on stakes (the
// shared `wattle` recipe), a глечик on one stake. Behind the beds from the garden's tier II. Ramps: wood, earth.
// 48×24, pivot at the base; contact shadow.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { glechyk, POT_HEIGHT, wattle, WATTLE_COURSE } from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 48;
const H = 24;
export const GARDEN_TYN_GROUND = 21;
const WEAVE_TOP = GARDEN_TYN_GROUND - 2 * WATTLE_COURSE - 1;
const POT_STAKE = 3;
const POT_RISE = 4;

const gardenTyn: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'garden-tyn',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (GARDEN_TYN_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const plot = new Plot();
    const stakes = wattle(plot, {
      seed: 'garden-tyn',
      x: 0,
      w: W,
      ground: GARDEN_TYN_GROUND + 1,
      top: WEAVE_TOP,
      courses: 2,
      rise: { [POT_STAKE]: POT_RISE },
    });
    const st = stakes[POT_STAKE];
    if (st) glechyk(plot, st.x, st.top - (POT_HEIGHT - 1));
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
    if (layers.shadow) contactShadow(layers.shadow, { x0: 0, x1: W, groundY: GARDEN_TYN_GROUND, height: 3 });
  },
};

export default gardenTyn;
