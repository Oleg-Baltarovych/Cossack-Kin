// Купа колод — a stack of logs on the maidan (plan ART-11, art-director review: something in the foreground): three
// rows of logs seen end-on toward the left (round ends: wood 5 face, wood 3 ring, a 1-px core), their long sides
// running back to the right (wood 3/2 bark, a lit top row). 24×14, pivot at the base; contact shadow.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 24;
const H = 14;
export const LOGPILE_GROUND = 12;
/** Log ends (centre x, centre y): 4 at the bottom, 3 above, 2 on top. */
const ENDS: readonly (readonly [number, number])[] = [
  [3, 10],
  [7, 10],
  [11, 10],
  [15, 10],
  [5, 7],
  [9, 7],
  [13, 7],
  [7, 4],
  [11, 4],
];

const logpile: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'logpile',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (LOGPILE_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const plot = new Plot();
    // Long sides behind the ends, running right.
    for (const [cx, cy] of ENDS) {
      for (let x = cx; x < Math.min(W - 1, cx + 7); x++) {
        plot.set(x, cy - 1, 'wood', 4);
        plot.set(x, cy, 'wood', 3);
        plot.set(x, cy + 1, 'wood', 2);
      }
    }
    // Ends on top: a 3×3 disc with a ring.
    for (const [cx, cy] of ENDS) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
          const corner = Math.abs(x - cx) === 1 && Math.abs(y - cy) === 1;
          if (corner) continue;
          plot.set(x, y, 'wood', x === cx && y === cy ? 3 : x < cx || y < cy ? 5 : 4);
        }
      }
    }
    compose(buffer, [plot.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) contactShadow(layers.shadow, { x0: 1, x1: 22, groundY: LOGPILE_GROUND, height: 3 });
  },
};

export default logpile;
