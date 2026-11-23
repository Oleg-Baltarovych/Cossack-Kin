// Лелече гніздо — a stork's nest on a cartwheel set on a tall pole by a house or the mill (plan M2-10; a stork by the
// house is luck, SPEC §2.6). Art-director M2-10: the pole ≈ 1.6× the khata eave, a cartwheel platform, a rounded heap
// of twigs ≈ 1.5× the stork's width (dithered dark/mid, a lighter left rim, sticks poking out), the white stork with
// black flight feathers on the back half of the wing, red legs, its head 2 px above the body and the red beak forward.
// Ramps: wood, plaster, ink, crimson. 24×64, pivot at the pole's foot; cast shadow of the pole.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 24;
const H = 64;
const GROUND = 62;
const POLE = 12;
/** The cartwheel platform's top row (the pole stands 36 px: ≈ 1.6× the khata's 22-px eave). */
const WHEEL = GROUND - 36;

/** The nest heap, rows from the bottom (on the wheel) up: [x0, x1]. */
const NEST: readonly (readonly [number, number])[] = [
  [3, 20],
  [2, 21],
  [2, 21],
  [4, 19],
];
/** Twigs poking out of the heap. */
const STICKS: readonly (readonly [number, number])[] = [
  [1, WHEEL - 2],
  [22, WHEEL - 3],
  [3, WHEEL - 5],
  [20, WHEEL - 5],
  [8, WHEEL - 5],
];

const storkNest: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'stork-nest',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: POLE / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    for (let y = WHEEL + 2; y <= GROUND; y++) {
      p.set(POLE - 1, y, 'wood', 4);
      p.set(POLE, y, 'wood', 2);
    }
    // Cartwheel seen from the side and a little above: the rim row, spokes and hub below it.
    for (let x = 3; x <= 20; x++) p.set(x, WHEEL, 'wood', x <= 5 ? 4 : 3);
    for (let x = 4; x <= 19; x++) p.set(x, WHEEL + 1, 'wood', x % 4 === 0 ? 3 : 1);
    // The heap of twigs: dark/mid dither, the left rim lit, the top row the lightest.
    NEST.forEach(([x0, x1], r) => {
      const y = WHEEL - 1 - r;
      for (let x = x0; x <= x1; x++) {
        const rim = x <= x0 + 1;
        p.set(x, y, 'wood', rim ? 4 : r === NEST.length - 1 ? 3 : (x + r) % 2 === 0 ? 1 : 2);
      }
    });
    for (const [x, y] of STICKS) p.set(x, y, 'wood', 3);
    // The stork, facing left: red legs out of the nest, the body, black flight feathers on the back half of the wing.
    const top = WHEEL - 1 - NEST.length;
    for (const x of [10, 13]) for (let y = top - 1; y <= top; y++) p.set(x, y, 'crimson', 3);
    const body = top - 6;
    for (let y = body; y <= body + 4; y++) {
      for (let x = 7; x <= 17; x++) {
        if ((y === body || y === body + 4) && (x === 7 || x === 17)) continue;
        // The black rump rounds over the back's end (art-director M2-29 B3: a white top over a black tail read as a
        // second beak at night); no tail px poking out.
        const feathers = x >= 13 && (y >= body + 1 || x >= 15);
        p.set(x, y, feathers ? 'ink' : 'plaster', feathers ? 1 : x <= 9 ? 6 : 5);
      }
    }
    // Neck (2 px) up to the head, the beak 3 px forward, its underside darker.
    for (let y = body - 2; y <= body - 1; y++) p.set(8, y, 'plaster', 6);
    const head = body - 4;
    for (let y = head; y <= head + 1; y++) for (let x = 7; x <= 9; x++) p.set(x, y, 'plaster', x === 7 ? 6 : 5);
    p.set(7, head, 'ink', 1);
    for (let x = 4; x <= 6; x++) p.set(x, head + 1, 'crimson', 4);
    p.set(5, head + 2, 'crimson', 2);
    p.set(6, head + 2, 'crimson', 2);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: POLE - 1, x1: POLE + 1, groundY: GROUND, reach: 8, depth: 3 });
  },
};

export default storkNest;
