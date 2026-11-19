// Казан — the Cossack cauldron for куліш over the maidan fire (plan M2-09): a dark iron pot with a lit rim, hung by
// its bail and a hook chain from a тринога (three poles lashed at the top, the back pole behind the pot). It is laid
// exactly over the `campfire` prop: same canvas (24×32), same ground row and pivot, so the pot's bottom hangs 3 px
// above the flames' base row (campfire: flames rise from row 26) and the tongues lick round it. Ramps: wood, stone,
// ink. Pivot at the base; small contact shadows under the feet.
import { contactShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 24;
const H = 32;
/** Same as CAMPFIRE_GROUND: the kazan shares the campfire's pivot (12, 31). */
export const KAZAN_GROUND = 30;
const CX = 12;
const APEX = 3;
/** Pot: rim row and bottom row (3 px above the flames' base row 26). */
const POT_BOTTOM = 23;
const POT_TOP = POT_BOTTOM - 7;

/** A pole from (x0, y0) down to (x1, y1), 2 px wide: lit left px, shaded right px. */
function pole(plot: Plot, x0: number, y0: number, x1: number, y1: number, lit: number, dark: number): void {
  for (let y = y0; y <= y1; y++) {
    const x = Math.round(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0));
    plot.set(x, y, 'wood', lit);
    plot.set(x + 1, y, 'wood', dark);
  }
}

const kazan: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'kazan',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: CX / W, y: (KAZAN_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const legs = new Plot();
    // Back pole first (further away: its foot higher, darker), then the two front poles crossing above the lashing.
    pole(legs, CX, APEX + 1, CX + 4, KAZAN_GROUND - 3, 2, 1);
    pole(legs, CX + 1, APEX - 2, 1, KAZAN_GROUND, 4, 2);
    pole(legs, CX - 2, APEX - 2, 21, KAZAN_GROUND, 3, 1);
    // Lashing round the crossing.
    for (let x = CX - 1; x <= CX + 2; x++) {
      legs.set(x, APEX + 1, 'wood', 0);
      legs.set(x, APEX + 2, 'wood', x === CX - 1 ? 2 : 0);
    }
    // Hook chain: alternating links down to the bail.
    for (let y = APEX + 3; y < POT_TOP - 3; y++) legs.set(CX, y, 'stone', y % 2 === 0 ? 3 : 1);
    legs.set(CX, POT_TOP - 3, 'stone', 2);

    const pot = new Plot();
    // Bail: an arc from the rim ends up to the hook.
    const bail: readonly (readonly [number, number])[] = [
      [-1, -2],
      [0, -2],
      [1, -2],
      [-3, -1],
      [-2, -1],
      [2, -1],
      [3, -1],
      [-4, 0],
      [4, 0],
    ];
    for (const [dx, dy] of bail) pot.set(CX + dx, POT_TOP - 1 + dy, 'stone', dx < 0 ? 2 : 1);
    // Rim (seen a little from above): a lit lip ring round a dark mouth.
    for (let x = CX - 5; x <= CX + 5; x++) {
      const lit = x < CX + 1;
      pot.set(x, POT_TOP, 'stone', x === CX - 5 ? 3 : lit ? 4 : 2);
      pot.set(x, POT_TOP + 1, x === CX - 5 || x === CX + 5 ? 'stone' : 'ink', x === CX - 5 ? 3 : x === CX + 5 ? 1 : 0);
    }
    // Belly: widest under the rim, rounding to the bottom; iron lit on the left, dark on the right.
    const halves = [6, 6, 6, 5, 4, 3];
    halves.forEach((half, i) => {
      const y = POT_BOTTOM - (halves.length - 1) + i;
      for (let x = CX - half; x <= CX + half - 1; x++) {
        const u = (x - (CX - half)) / (2 * half);
        // Iron: stone 2 on the sunny left, stone 1 body, ink on the shaded right and the sooty bottom.
        const dark = u >= 0.7 || i >= 4;
        const shade = dark ? (u >= 0.7 && i >= 3 ? 0 : 1) : u < 0.3 && i < 4 ? 2 : 1;
        pot.set(x, y, dark ? 'ink' : 'stone', shade);
      }
    });
    // The dull iron highlight under the rim.
    pot.set(CX - 4, POT_TOP + 3, 'stone', 3);
    pot.set(CX - 3, POT_TOP + 3, 'stone', 3);
    pot.set(CX - 4, POT_TOP + 4, 'stone', 3);

    compose(buffer, [legs.part(1, 1), pot.part(2, 2)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [2], drop: 1 },
      selective: { lit: 'lighter' },
    });
    if (layers.shadow) {
      contactShadow(layers.shadow, { x0: 0, x1: 3, groundY: KAZAN_GROUND, height: 2 });
      contactShadow(layers.shadow, { x0: 21, x1: 24, groundY: KAZAN_GROUND, height: 2 });
    }
  },
};

export default kazan;
