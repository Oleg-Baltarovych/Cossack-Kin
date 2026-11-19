// Лавка — a bench by the yard (plan M2-10): a thick plank on two legs, a wicker basket on the seat and a wooden
// bucket with iron hoops on the ground beside it. Ramps: wood, ink, thatch. 26×12, pivot at the base centre; shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 26;
const H = 12;
const GROUND = 10;

/** The basket's handle arc, px offsets from the seat row. */
const HANDLE: readonly (readonly [number, number])[] = [
  [7, -4],
  [8, -5],
  [9, -6],
  [10, -6],
  [11, -5],
  [12, -4],
];

const bench: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'bench',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 13 / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    const seat = GROUND - 4;
    for (let x = 2; x <= 18; x++) {
      p.set(x, seat, 'wood', x <= 5 ? 5 : 4);
      p.set(x, seat + 1, 'wood', 2);
    }
    for (const x of [4, 16]) {
      for (let y = seat + 2; y <= GROUND; y++) {
        p.set(x, y, 'wood', 3);
        p.set(x + 1, y, 'wood', 1);
      }
    }
    // A wicker basket on the seat: woven rows and a handle.
    for (let y = seat - 3; y <= seat - 1; y++) {
      for (let x = 7; x <= 12; x++) p.set(x, y, 'thatch', (x + y) % 2 === 0 ? 4 : 2);
    }
    for (const [x, dy] of HANDLE) p.set(x, seat + dy, 'thatch', 3);
    // The bucket on the ground right of the bench: staves, two hoops, the dark water inside.
    for (let y = GROUND - 5; y <= GROUND; y++) {
      for (let x = 20; x <= 24; x++) {
        const hoop = y === GROUND - 4 || y === GROUND - 1;
        p.set(x, y, hoop ? 'ink' : 'wood', hoop ? 2 : x === 20 ? 4 : x === 24 ? 2 : 3);
      }
    }
    for (let x = 21; x <= 23; x++) p.set(x, GROUND - 5, 'ink', 1);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 10, x1: 25, groundY: GROUND, reach: 5, depth: 3 });
  },
};

export default bench;
