// Мальви — a clump of mallows planted by a khata wall (plan ART-05, ART-BIBLE §6). A separate prop, not part of the
// khata sprite, so the house body keeps its colour budget (art-director ART-05 review) and the clump can be placed
// by the layout (AD-05 modularity; ART-14 adds wind sway). Pivot at the base; small contact shadow.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { mallow } from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 12;
const H = 14;
/** Ground row; the pivot is the bottom edge of this row. */
export const MALLOWS_GROUND = 12;

const mallows: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'mallows',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (MALLOWS_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const plot = new Plot();
    mallow(plot, 3, MALLOWS_GROUND, 10);
    mallow(plot, 6, MALLOWS_GROUND, 8);
    mallow(plot, 9, MALLOWS_GROUND, 11);
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: 2, x1: 11, groundY: MALLOWS_GROUND, height: 3 });
  },
};

export default mallows;
