// Коновʼязь — the hitching rail outside the tavern (plan M2-08, ART-BIBLE §6): two end posts dug in, standing 3 px
// above the rail log across them (art-director: so it reads as a rail, not a bench), iron rings on the beam with a
// rope end, a small plank water trough under it. Ramps: wood, ink, thatch. 36×18, pivot at the base centre; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 36;
const H = 18;
const GROUND = 16;

const hitchingRail: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'hitching-rail',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 18 / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // End posts stand 3 px above the rail (a rail, not a bench), each with a rounded top.
    for (const x of [3, 30]) {
      for (let y = 2; y <= GROUND; y++) {
        p.set(x, y, 'wood', 4);
        p.set(x + 1, y, 'wood', 2);
      }
      p.set(x, 1, 'wood', 3);
    }
    for (let x = 2; x <= 33; x++) {
      p.set(x, 5, 'wood', 4);
      p.set(x, 6, 'wood', 2);
    }
    // Iron rings on the beam, a rope end hanging from one.
    for (const x of [12, 22]) {
      p.set(x - 1, 7, 'ink', 2);
      p.set(x + 1, 7, 'ink', 2);
      p.set(x, 8, 'ink', 2);
    }
    for (let y = 8; y <= 11; y++) p.set(23, y, 'thatch', y === 11 ? 2 : 4);
    // A small water trough under the rail: a plank box, the water dark inside.
    for (let x = 13; x <= 22; x++) {
      p.set(x, GROUND - 3, 'wood', 4);
      p.set(x, GROUND - 2, x === 13 || x === 22 ? 'wood' : 'ink', x === 13 || x === 22 ? 3 : 1);
      p.set(x, GROUND - 1, 'wood', 3);
      p.set(x, GROUND, 'wood', 1);
    }
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 18, x1: 32, groundY: GROUND, reach: 6, depth: 3 });
  },
};

export default hitchingRail;
