// Воротний стовп — a thick gate post the last stretch of wattle ends on (plan M2-01 art review: the fence fragment at
// the khutir's end must not stop in mid-field). A squared oak post 5 px wide (wood 4 lit left, wood 3 face, wood 1
// right), a pointed cap, a dark foot; contact shadow. 8×36, pivot at the base.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 8;
const H = 36;
export const GATEPOST_GROUND = 34;
const POST = { x: 1, w: 5, top: 5 };

const gatepost: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'gatepost',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (GATEPOST_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const plot = new Plot();
    for (let y = POST.top; y <= GATEPOST_GROUND; y++) {
      for (let dx = 0; dx < POST.w; dx++) {
        const shade = dx === 0 ? 4 : dx === POST.w - 1 ? 1 : 3;
        plot.set(POST.x + dx, y, 'wood', y >= GATEPOST_GROUND - 1 ? Math.max(0, shade - 2) : shade);
      }
    }
    // Pointed cap: two steps in from both sides, the lit slope on the left.
    for (let i = 1; i <= 2; i++) {
      for (let dx = i; dx < POST.w - i; dx++) plot.set(POST.x + dx, POST.top - i, 'wood', dx <= 2 ? 5 : 2);
    }
    // A band of rope where the wattle is tied on.
    for (let dx = 0; dx < POST.w; dx++) plot.set(POST.x + dx, 20, 'thatch', dx === 0 ? 4 : 2);
    compose(buffer, [plot.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer' },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) contactShadow(layers.shadow, { x0: 0, x1: W, groundY: GATEPOST_GROUND, height: 3 });
  },
};

export default gatepost;
