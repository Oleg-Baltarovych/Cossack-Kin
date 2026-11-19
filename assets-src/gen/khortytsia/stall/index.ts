// Ятка — a fair stall (plan M2-08, ART-BIBLE §6): a plank counter on a board front, two front poles (the back ones
// hidden), a sloping awning with a scalloped hem, wares on the counter. Variants: `a` crimson-and-linen striped
// awning over glazed pots; `b` a blue cloth awning over калачі (ring loaves); `c` a reed roof over hanging ribbons and
// kerchiefs. Linen is plaster 3–4, never white (art-director: it glowed at night). Ramps: wood + 2–3 by variant (prop budget ≤ 16 colours). 40×36, pivot at the base centre; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { smallPot } from '../../lib/recipes-suburb.ts';
import type { RampName, SpriteGenerator } from '../../lib/types.ts';

const W = 40;
const H = 36;
const GROUND = 34;
const CX = 20;
const COUNTER = GROUND - 9;
/** A калач ring: px around its centre on the counter. */
const KALACH: readonly (readonly [number, number])[] = [
  [-1, -2],
  [0, -2],
  [1, -2],
  [-2, -1],
  [2, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
];

const stall: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'stall',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: ['a', 'b', 'c'],
  layers: ['shadow'],
  anchor: { x: CX / W, y: (GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const p = new Plot();
    // Poles at the front corners, up to the awning.
    for (const x of [6, 32]) {
      for (let y = GROUND - 24; y <= GROUND; y++) {
        p.set(x, y, 'wood', 4);
        p.set(x + 1, y, 'wood', 2);
      }
    }
    // Board front and the counter top (lit edge).
    for (let y = COUNTER + 2; y <= GROUND; y++) {
      for (let x = 8; x < 32; x++) p.set(x, y, 'wood', (x - 8) % 4 === 3 ? 1 : y === COUNTER + 2 ? 2 : 3);
    }
    for (let x = 5; x < 35; x++) {
      p.set(x, COUNTER, 'wood', 4);
      p.set(x, COUNTER + 1, 'wood', 2);
    }
    // Wares on the counter.
    if (variant === 'a') for (const x of [11, 17, 23, 29]) smallPot(p, x, COUNTER - 1);
    if (variant === 'b') {
      for (const x of [11, 17, 23, 29]) {
        for (const [dx, dy] of KALACH) p.set(x + dx, COUNTER - 1 + dy, 'thatch', dy === -2 || dx < 0 ? 4 : 2);
      }
    }
    // The awning: back edge high, front edge low, a scalloped hem; or a reed roof (c).
    const cloth = (x: number, row: number): [RampName, number] => {
      if (variant === 'a') {
        return Math.floor((x - 3) / 4) % 2 === 0 ? ['crimson', row === 0 ? 4 : 3] : ['plaster', row === 0 ? 4 : 3];
      }
      if (variant === 'b') return ['cloth', row === 0 ? 3 : x > 28 ? 1 : 2];
      return ['thatch', row === 0 ? 4 : (x + row) % 3 === 0 ? 2 : x > 28 ? 2 : 3];
    };
    for (let x = 3; x < 37; x++) {
      const top = GROUND - 29 + Math.floor((x - 3) / 12);
      for (let r = 0; r < 6; r++) {
        const [ramp, shade] = cloth(x, r);
        p.set(x, top + r, ramp, shade);
      }
      // Scallops (cloth) or a ragged eave (reeds).
      if ((x - 3) % 4 !== 3) {
        const [ramp, shade] = cloth(x, 5);
        p.set(x, top + 6, ramp, Math.max(1, shade - 1));
      }
    }
    if (variant === 'c') {
      // Ribbons and kerchiefs hung from the eave.
      const goods: readonly (readonly [number, RampName, number])[] = [
        [10, 'crimson', 3],
        [13, 'plaster', 3],
        [17, 'crimson', 3],
        [21, 'cloth', 3],
        [25, 'crimson', 3],
        [28, 'plaster', 3],
      ];
      for (const [x, ramp, shade] of goods) {
        const top = GROUND - 22 + Math.floor((x - 3) / 12);
        for (let k = 0; k < 6 + (x % 3); k++) p.set(x, top + k, ramp, shade);
      }
    }
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 1 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: CX, x1: 34, groundY: GROUND, reach: 8, depth: 4 });
  },
};

export default stall;
