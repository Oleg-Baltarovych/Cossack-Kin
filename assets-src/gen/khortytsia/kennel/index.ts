// Буда — a dog kennel in the yard (plan M2-10): a plank box under a little thatch gable, the dark doorway, and the
// yard dog lying beside it, head up (art-director M2-10: darker thatch, eave shadow, a 6×4 two-tone dog). Ramps: wood, thatch, earth. 22×16, pivot at the base centre; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 22;
const H = 16;
const GROUND = 14;

/** The dog's rows: [x0, x1, rows above the ground]. */
const DOG: readonly (readonly [number, number, number])[] = [
  [14, 18, 0],
  [14, 19, 1],
  [14, 19, 2],
  [18, 19, 3],
];

const kennel: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'kennel',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 11 / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // The box: planks (a seam every other row), lit on the left wall; a 1-px shadow under the eave.
    for (let y = 8; y <= GROUND; y++) {
      for (let x = 2; x <= 12; x++) p.set(x, y, 'wood', y === 8 ? 1 : x <= 3 ? 4 : y % 2 === 0 ? 2 : 3);
    }
    // Doorway: a dark hole with a rounded top.
    for (let y = 10; y <= GROUND; y++) for (let x = 6; x <= 9; x++) p.set(x, y, 'wood', y === 10 ? 1 : 0);
    p.set(6, 10, 'wood', 3);
    p.set(9, 10, 'wood', 3);
    // Thatch gable (one step darker than the khata's: a small roof in shade): rows widen to the eave line.
    for (let r = 0; r <= 5; r++) {
      for (let x = 7 - r - 1; x <= 7 + r + 1; x++) p.set(x, 2 + r, 'thatch', r === 5 ? 0 : x < 7 ? 4 : 2);
    }
    p.set(7, 1, 'thatch', 4);
    // The yard dog lying beside it: a 6×4 two-tone silhouette, head up on the right, the left rim lit.
    for (const [x0, x1, dy] of DOG) {
      for (let x = x0; x <= x1; x++) {
        const shade = x === x0 ? 4 : dy === 0 || x === x1 ? 2 : 3;
        p.set(x, GROUND - dy, 'earth', shade);
      }
    }
    p.set(19, GROUND - 3, 'earth', 0);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 8, x1: 20, groundY: GROUND, reach: 6, depth: 3 });
  },
};

export default kennel;
