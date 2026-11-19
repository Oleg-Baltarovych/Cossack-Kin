// Бочки — barrels for the tavern's yard and the fair (plan M2-08, ART-BIBLE §6 «ярмарок (ятки, рядна, бочки)»): two
// stave barrels standing (a tall and a short one) and a third lying on its side in front, its round head toward the
// light. Ramps: wood, ink. 26×16, pivot at the base centre; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { barrel } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 26;
const H = 16;
const GROUND = 14;

const barrels: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'barrels',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 13 / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    barrel(p, 7, GROUND - 1, 11);
    barrel(p, 15, GROUND - 2, 8);
    // The lying barrel: staves run across, two hoops, its head a lit ellipse on the left.
    for (let y = GROUND - 5; y <= GROUND; y++) {
      for (let x = 13; x <= 23; x++) {
        const r = y - (GROUND - 5);
        const hoop = x === 15 || x === 21;
        p.set(x, y, hoop ? 'ink' : 'wood', hoop ? 2 : r <= 1 ? 4 : r >= 4 ? 2 : 3);
      }
    }
    for (let y = GROUND - 4; y <= GROUND - 1; y++) p.set(12, y, 'wood', 5);
    p.set(12, GROUND - 2, 'wood', 3);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 13, x1: 24, groundY: GROUND, reach: 6, depth: 3 });
  },
};

export default barrels;
