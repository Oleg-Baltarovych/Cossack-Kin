// Білизна на мотузці — washing on a line between two forked poles (plan M2-10): a linen shirt, an embroidered
// рушник (crimson ends) and a dark skirt hang from a sagging rope. Ramps: wood, plaster, crimson, cloth.
// 36×24, pivot at the base centre; cast shadow under the poles.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 36;
const H = 24;
const GROUND = 22;
const POLES = [2, 33] as const;
const TOP = 4;

/** The rope's row at column x: it sags 2 px in the middle. */
const ropeY = (x: number): number => TOP + (Math.abs(x - 17.5) < 6 ? 2 : Math.abs(x - 17.5) < 11 ? 1 : 0);

const laundry: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'laundry',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 18 / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    for (const x of POLES) {
      for (let y = TOP; y <= GROUND; y++) p.set(x, y, 'wood', x === POLES[0] ? 4 : 3);
      // The fork the rope sits in.
      p.set(x - 1, TOP - 1, 'wood', 3);
      p.set(x + 1, TOP - 1, 'wood', 3);
    }
    for (let x = POLES[0] + 1; x < POLES[1]; x++) p.set(x, ropeY(x), 'wood', 2);
    // Shirt: sleeves out, the body below, lit on the left.
    const shirt = (x0: number): void => {
      const y0 = ropeY(x0 + 3) + 1;
      for (let x = x0; x <= x0 + 7; x++) p.set(x, y0, 'plaster', x < x0 + 3 ? 6 : 4);
      for (let x = x0; x <= x0 + 7; x++) p.set(x, y0 + 1, 'plaster', x === x0 || x === x0 + 7 ? 2 : x < x0 + 4 ? 6 : 4);
      for (let y = y0 + 2; y <= y0 + 8; y++) {
        for (let x = x0 + 2; x <= x0 + 5; x++) p.set(x, y, 'plaster', x === x0 + 2 ? 6 : y === y0 + 8 ? 2 : 4);
      }
      p.set(x0 + 3, y0 + 1, 'crimson', 3);
      p.set(x0 + 4, y0 + 2, 'crimson', 3);
    };
    shirt(5);
    // Рушник: a long white towel, crimson woven bands near its hanging end.
    const tx = 16;
    for (let y = ropeY(tx) + 1; y <= ropeY(tx) + 12; y++) {
      for (let x = tx; x <= tx + 2; x++) {
        // A 2-row embroidered band near the hanging end: red with one near-black stitch.
        const band = y >= ropeY(tx) + 9 && y <= ropeY(tx) + 10;
        if (band && x === tx + 1 && y === ropeY(tx) + 9) p.set(x, y, 'cloth', 0);
        else p.set(x, y, band ? 'crimson' : 'plaster', band ? 3 : x === tx ? 6 : 4);
      }
    }
    // Skirt (спідниця): a dark woollen trapeze.
    const sx = 23;
    const sy = ropeY(sx + 3) + 1;
    for (let r = 0; r <= 7; r++) {
      const half = 2 + Math.floor(r / 3);
      for (let x = sx + 3 - half; x <= sx + 3 + half; x++) p.set(x, sy + r, 'cloth', x < sx + 3 ? 2 : 1);
    }
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) {
      for (const x of POLES) castShadow(layers.shadow, { x0: x, x1: x + 2, groundY: GROUND, reach: 4, depth: 2 });
    }
  },
};

export default laundry;
