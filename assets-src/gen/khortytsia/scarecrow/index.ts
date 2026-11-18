// Опудало (scarecrow), an add-on of the wheat field from tier III (plan M2-06): a pole with a crossbar dressed in an
// old white сорочка with a crimson belt, ragged sleeves with straw sticking out, a straw head under a бриль. Ramps:
// wood, plaster, crimson, thatch. 18×30, pivot at the pole's foot; contact + a thin cast shadow.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { composeOutlined } from '../../lib/recipes-farm.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 18;
const H = 30;
export const SCARECROW_GROUND = 27;
const CX = 8;

const scarecrow: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'scarecrow',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  // Whole-px pivot (see hive: a half-px anchor is a texel tie decided by the atlas packing).
  anchor: { x: CX / W, y: (SCARECROW_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // Pole.
    for (let y = 8; y <= SCARECROW_GROUND; y++) {
      p.set(CX, y, 'wood', 3);
      p.set(CX + 1, y, 'wood', 1);
    }
    // Sleeves along the crossbar (rows 10–12), ragged ends, straw out of the cuffs.
    for (let x = 2; x <= 15; x++) {
      const lit = x < CX;
      p.set(x, 10, 'plaster', lit ? 6 : 5);
      p.set(x, 11, 'plaster', lit ? 5 : 3);
      if (x > 3 && x < 14) p.set(x, 12, 'plaster', 3);
    }
    for (const [x, y, s] of [
      [1, 11, 5],
      [1, 12, 4],
      [2, 13, 5],
      [16, 11, 4],
      [16, 12, 3],
      [15, 13, 3],
    ] as const) {
      p.set(x, y, 'thatch', s);
    }
    // Shirt body rows 10–19, a crimson belt, the hem fraying.
    for (let y = 10; y <= 19; y++) {
      for (let x = CX - 3; x <= CX + 4; x++) {
        if (y === 19 && (x === CX - 2 || x === CX + 2)) continue;
        const shade = x <= CX ? 5 : 3;
        p.set(x, y, 'plaster', y === 10 && x <= CX ? 6 : shade);
      }
    }
    for (let x = CX - 3; x <= CX + 4; x++) p.set(x, 15, 'crimson', x < CX ? 4 : 2);
    p.set(CX + 1, 16, 'crimson', 4);
    p.set(CX + 1, 17, 'crimson', 2);
    // Embroidered collar.
    p.set(CX - 1, 11, 'crimson', 4);
    p.set(CX + 1, 11, 'crimson', 2);
    // Straw head rows 5–9.
    for (let y = 5; y <= 9; y++) {
      for (let x = CX - 2; x <= CX + 3; x++) {
        if ((y === 9 || y === 5) && (x === CX - 2 || x === CX + 3)) continue;
        p.set(x, y, 'thatch', x < CX ? 5 : x === CX ? 4 : 3);
      }
    }
    p.set(CX - 1, 7, 'thatch', 1);
    p.set(CX + 2, 7, 'thatch', 1);
    // Бриль: brim row 4, crown rows 1–3.
    for (let x = CX - 5; x <= CX + 6; x++) p.set(x, 4, 'thatch', x < CX ? 4 : 2);
    for (let y = 1; y <= 3; y++) for (let x = CX - 2; x <= CX + 3; x++) p.set(x, y, 'thatch', x < CX ? 5 : 3);
    for (let x = CX - 2; x <= CX + 3; x++) p.set(x, 3, 'crimson', x < CX + 1 ? 4 : 2);
    composeOutlined(buffer, [p.part(1, 1)], rampSize);
    if (layers.shadow) {
      castShadow(layers.shadow, { x0: CX - 1, x1: CX + 3, groundY: SCARECROW_GROUND, reach: 5, depth: 2 });
    }
  },
};

export default scarecrow;
