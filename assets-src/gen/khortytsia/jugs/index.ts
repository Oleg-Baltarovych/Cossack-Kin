// Глечики — the potter's wares (plan M2-07), an add-on of the potter's khata from tier II: a low plank bench with
// upright jugs of three sizes (one with a crimson painted band) and a wide макітра with a глечик beside it on the
// ground. Ramps: earth, wood, crimson. 36×18, pivot at the base.
import { contactShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { POT_SMALL, POT_TALL } from '../potter/index.ts';

const W = 36;
const H = 18;
export const JUGS_GROUND = 15;

/** Upright pot (the potter's rows), earth; `band`: a crimson painted ring on the shoulder. */
function jug(p: Plot, cx: number, ground: number, rows: readonly number[], band = false): void {
  const top = ground - rows.length + 1;
  rows.forEach((width, r) => {
    const half = (width - 1) / 2;
    for (let c = cx - half; c <= cx + half; c++) {
      const edge = c === cx - half || c === cx + half || r === rows.length - 1;
      let shade = 4;
      if (edge) shade = c === cx - half && r < rows.length - 1 ? 3 : 1;
      else if (c >= cx + half - 1) shade = 2;
      else if (r <= 2 && c <= cx - 1) shade = 5;
      if (band && r === 3 && !edge) p.set(c, top + r, 'crimson', c >= cx + half - 1 ? 2 : 3);
      else p.set(c, top + r, 'earth', shade);
    }
  });
}

const jugs: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'jugs',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (JUGS_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // Bench: a plank on two legs.
    const benchY = JUGS_GROUND - 4;
    for (let x = 2; x < 24; x++) {
      p.set(x, benchY, 'wood', x < 8 ? 5 : 4);
      p.set(x, benchY + 1, 'wood', 1);
    }
    for (const x of [4, 20]) for (let y = benchY + 2; y <= JUGS_GROUND; y++) p.set(x, y, 'wood', x === 4 ? 3 : 2);
    jug(p, 6, benchY - 1, POT_TALL);
    jug(p, 13, benchY - 1, [3, 3, 5, 7, 7, 7, 5, 3], true);
    jug(p, 20, benchY - 1, POT_SMALL);
    // Makitra (wide bowl) and a small jug on the ground.
    jug(p, 29, JUGS_GROUND, [9, 9, 7, 5]);
    jug(p, 24, JUGS_GROUND, POT_SMALL);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) contactShadow(layers.shadow, { x0: 1, x1: W - 1, groundY: JUGS_GROUND, height: 3 });
  },
};

export default jugs;
