// Флагшток on the maidan (plan M2-09, maidan III–IV): a tall pole with a gilt knob in a ring of stones where the host
// gathers; the wind-blown `banner` hangs from its top (FLAGPOLE_HOIST). 10×64, pivot at the foot.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 10;
const H = 64;
const GROUND = 62;
const POLE_X = 4;
const TOP = 3;
/** Frame px where the `banner` cloth's top-left hangs: right of the pole, a row under its top. */
export const FLAGPOLE_HOIST = { x: POLE_X + 2, y: TOP + 1 } as const;
export const FLAGPOLE_PIVOT = { x: POLE_X + 1, y: GROUND + 1 } as const;

const flagpole: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'flagpole',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: FLAGPOLE_PIVOT.x / W, y: FLAGPOLE_PIVOT.y / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const pole = new Plot();
    for (let y = TOP; y <= GROUND; y++) {
      pole.set(POLE_X, y, 'wood', y < GROUND - 2 ? 4 : 3);
      pole.set(POLE_X + 1, y, 'wood', 2);
    }
    // Gilt knob, lit top-left.
    pole.set(POLE_X, TOP - 3, 'gold', 5);
    pole.set(POLE_X - 1, TOP - 2, 'gold', 5);
    pole.set(POLE_X, TOP - 2, 'gold', 4);
    pole.set(POLE_X + 1, TOP - 2, 'gold', 3);
    pole.set(POLE_X, TOP - 1, 'gold', 3);
    // A ring of field stones round the foot.
    const stones = new Plot();
    for (const [x, y, shade] of [
      [1, GROUND, 4],
      [2, GROUND, 3],
      [2, GROUND - 1, 4],
      [7, GROUND, 2],
      [8, GROUND, 2],
      [7, GROUND - 1, 3],
      [3, GROUND, 3],
      [6, GROUND, 2],
    ] as const) {
      stones.set(x, y, 'stone', shade);
    }
    compose(buffer, [pole.part(1, 1), stones.part(2, 2)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [1, 2] },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: POLE_X, x1: W - 1, groundY: GROUND });
  },
};

export default flagpole;
