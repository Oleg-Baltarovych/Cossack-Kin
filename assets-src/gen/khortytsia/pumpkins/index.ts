// Гарбузи — ripe pumpkins on their vine at a bed end or by a fence (plan M2-10; art-director: round, 2–3 per group,
// a darker rib line, a green stalk pixel, a leaf or two and the vine). Ramps: gold, grass. 22×10, pivot at the base
// centre; contact shadow.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 22;
const H = 10;
const GROUND = 8;

/** A round pumpkin: row widths bottom-up, lit on the upper left, a dark rib line either side of the middle. */
function pumpkin(p: Plot, cx: number, rows: readonly number[]): void {
  rows.forEach((width, r) => {
    const half = Math.floor(width / 2);
    for (let x = cx - half; x <= cx - half + width - 1; x++) {
      const edge = x === cx - half || x === cx - half + width - 1;
      const rib = !edge && (x === cx - 2 || x === cx + 2);
      const lit = x < cx && r >= rows.length - 2 && !edge;
      p.set(x, GROUND - r, 'gold', r === 0 || rib ? 1 : lit ? 3 : 2);
    }
  });
  p.set(cx, GROUND - rows.length, 'grass', 2);
}

/** A vine leaf: three px, lit on the left. */
function leaf(p: Plot, x: number, y: number): void {
  p.set(x, y, 'grass', 4);
  p.set(x + 1, y, 'grass', 3);
  p.set(x, y + 1, 'grass', 3);
}

const pumpkins: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'pumpkins',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 11 / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // The vine along the ground, under and between the pumpkins.
    for (let x = 1; x <= 20; x++) p.set(x, GROUND, 'grass', 2);
    pumpkin(p, 7, [5, 7, 7, 7, 5]);
    pumpkin(p, 15, [5, 5, 5, 3]);
    leaf(p, 1, GROUND - 2);
    leaf(p, 19, GROUND - 2);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) contactShadow(layers.shadow, { x0: 2, x1: 20, groundY: GROUND, height: 3 });
  },
};

export default pumpkins;
