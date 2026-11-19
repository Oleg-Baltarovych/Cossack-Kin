// Дрова — split firewood stacked by the yard (plan M2-10): three rows of log ends (pale cut faces with a darker
// heart, bark between them), a chopping block with the axe in it. Ramps: wood, earth, stone, ink. 28×14, pivot at the
// base centre; cast shadow. Not the Sich's `logpile` (whole trunks): a household stack.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 28;
const H = 14;
const GROUND = 12;

/** A 3×3 log end at (x, y) top-left: a pale cut face, darker heart, the bark ring as the outline. */
function logEnd(p: Plot, x: number, y: number, lit: boolean): void {
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const heart = dx === 1 && dy === 1;
      p.set(x + dx, y + dy, 'wood', heart ? 3 : lit && dx + dy < 2 ? 6 : 5);
    }
  }
}

const woodpile: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'woodpile',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 14 / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // Bark fill behind the ends, then the rows of ends: 5 / 4 / 3 logs, bricked.
    const rows: readonly (readonly [number, number])[] = [
      [2, 5],
      [4, 4],
      [6, 3],
    ];
    rows.forEach(([x0, n], r) => {
      const y = GROUND - 2 - r * 3;
      for (let x = x0 - 1; x <= x0 + n * 4 - 1; x++) for (let dy = 0; dy < 3; dy++) p.set(x, y + dy, 'earth', 1);
      for (let k = 0; k < n; k++) logEnd(p, x0 + k * 4, y, k === 0);
    });
    // Chopping block right of the stack, the axe stuck in its top.
    for (let y = GROUND - 4; y <= GROUND; y++) {
      for (let x = 22; x <= 26; x++) p.set(x, y, 'wood', y === GROUND - 4 ? 5 : x === 22 ? 3 : 2);
    }
    for (let y = GROUND - 9; y <= GROUND - 5; y++) p.set(25, y, 'wood', 4);
    p.set(23, GROUND - 5, 'stone', 4);
    p.set(24, GROUND - 5, 'stone', 3);
    p.set(23, GROUND - 6, 'stone', 5);
    p.set(24, GROUND - 6, 'stone', 3);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 14, x1: 27, groundY: GROUND, reach: 6, depth: 3 });
  },
};

export default woodpile;
