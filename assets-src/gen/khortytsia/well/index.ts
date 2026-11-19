// Криниця-журавель — the suburb's crane well (plan M2-08, ART-BIBLE §6): a log-crib well (зруб, 3/4 view: lit front
// logs, a dark mouth on top), a forked post (сошка) carrying the sweep (очеп) on a peg — its short end weighted with a
// tied stone near the ground, its long thin end high over the crib — and the hanging pole with the bucket (відро)
// resting on the crib's rim. Ramps: wood, stone, ink (prop budget ≤ 16 colours). 52×60, pivot at the base of the crib; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { line, timberPost } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 52;
const H = 60;
export const WELL_GROUND = 57;
export const WELL_PIVOT_X = 34;
const CRIB = { x0: 26, x1: 42, top: 45 };
const FORK = { x: 12, top: 26 };
/** The sweep: the weighted end low on the left, the peg in the fork, the long end high over the crib. */
const SWEEP = { x0: 2, y0: 34, x1: 37, y1: 4 };

const well: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'well',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: WELL_PIVOT_X / W, y: (WELL_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // Сошка: a post forked at the top (two prongs) with the peg across.
    timberPost(p, FORK.x, FORK.top, WELL_GROUND - 3, 3);
    for (let k = 1; k <= 4; k++) {
      p.set(FORK.x - Math.floor(k / 2), FORK.top - k, 'wood', 4);
      p.set(FORK.x + 2 + Math.floor(k / 2), FORK.top - k, 'wood', 2);
    }
    // Очеп: 2 px thick, lit top row; thinning to 1 px past the crib side.
    line(p, SWEEP.x0, SWEEP.y0, 22, 13, 'wood', 4, 2);
    line(p, 22, 13, SWEEP.x1, SWEEP.y1, 'wood', 4);
    p.set(FORK.x + 1, FORK.top - 6, 'ink', 3); // the peg
    // The stone tied to the short end: stone 4/3/2 lit top-left, a rope loop (wood 5).
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        if ((r === 0 || r === 3) && (c === 0 || c === 4)) continue;
        p.set(1 + c, SWEEP.y0 + 2 + r, 'stone', r === 0 || c === 0 ? 4 : c >= 3 ? 2 : 3);
      }
    }
    p.set(3, SWEEP.y0 + 1, 'wood', 5);
    // Hanging pole from the long end down to the bucket on the rim.
    for (let y = SWEEP.y1 + 1; y < CRIB.top - 6; y++) p.set(SWEEP.x1, y, 'wood', 3);
    // Відро: 5 wide, 5 tall, staves with an iron hoop, a bail over it.
    const bx = SWEEP.x1 - 2;
    const by = CRIB.top - 6;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++)
        p.set(bx + c, by + r, r === 1 ? 'ink' : 'wood', r === 1 ? 2 : c === 0 ? 4 : c >= 3 ? 2 : 3);
    }
    // Зруб: three log courses (wood 4 lit tops, 2 shade rows), log ends on the left corner, a dark mouth on top.
    for (let x = CRIB.x0 + 2; x < CRIB.x1 - 1; x++) {
      p.set(x, CRIB.top, 'wood', 3);
      p.set(x, CRIB.top + 1, 'ink', 1);
      p.set(x, CRIB.top + 2, 'ink', 2);
    }
    for (let course = 0; course < 3; course++) {
      const y = CRIB.top + 3 + course * 3;
      for (let x = CRIB.x0; x <= CRIB.x1; x++) {
        const side = x > CRIB.x1 - 4;
        p.set(x, y, 'wood', side ? 3 : 5);
        p.set(x, y + 1, 'wood', side ? 2 : 3);
        p.set(x, y + 2, 'wood', side ? 1 : 2);
      }
      // Log end (end grain) at the lit corner.
      p.set(CRIB.x0 - 1, y, 'wood', 5);
      p.set(CRIB.x0 - 1, y + 1, 'wood', 4);
      p.set(CRIB.x0 - 1, y + 2, 'wood', 2);
    }
    // The crib's back rim and corner posts above the mouth.
    for (const x of [CRIB.x0, CRIB.x1 - 1])
      for (let y = CRIB.top - 1; y < CRIB.top + 3; y++) p.set(x, y, 'wood', x === CRIB.x0 ? 4 : 2);
    // The crib's bottom log sits on the ground row (wood 1 contact).
    for (let x = CRIB.x0 - 1; x <= CRIB.x1; x++) p.set(x, WELL_GROUND, 'wood', 1);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) {
      castShadow(layers.shadow, { x0: WELL_PIVOT_X, x1: CRIB.x1 + 2, groundY: WELL_GROUND, reach: 8, depth: 4 });
      castShadow(layers.shadow, { x0: FORK.x, x1: FORK.x + 3, groundY: WELL_GROUND - 3, reach: 10, depth: 4 });
    }
  },
};

export default well;
