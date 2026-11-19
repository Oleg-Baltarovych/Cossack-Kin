// Віхоть — the tavern's sign (plan M2-08, ART-BIBLE §6 «вивіска-віник»): in the Hetmanate a шинок was known by a
// bundle of straw or twigs (віха, віхоть) raised on a pole by the door, not by a painted board. A leaning pole (wood
// 4 lit left, 2 right) with a crossbar near the top; the bundle hangs from it — straw (thatch 5 → 2, strands fanning
// out at the bottom) tied twice with crimson ribbon. Ramps: wood, thatch, crimson. 16×44, pivot at the pole's foot;
// a thin cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 16;
const H = 44;
const GROUND = 42;
const POLE_X = 4;

const broomSign: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'broom-sign',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: POLE_X / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    for (let y = 2; y <= GROUND; y++) {
      p.set(POLE_X, y, 'wood', 4);
      p.set(POLE_X + 1, y, 'wood', 2);
    }
    // Crossbar (кронштейн) out to the right with a brace.
    for (let x = POLE_X + 2; x <= 13; x++) p.set(x, 5, 'wood', x === 13 ? 2 : 3);
    for (let k = 1; k <= 4; k++) p.set(POLE_X + 1 + k, 5 + k, 'wood', 2);
    // The bundle: a cord, the tied neck, straw fanning out below.
    const bx = 11;
    p.set(bx, 6, 'wood', 1);
    const rows = [3, 3, 3, 5, 5, 5, 5, 7, 7, 7, 9, 9];
    rows.forEach((w, r) => {
      const y = 7 + r;
      const half = (w - 1) / 2;
      for (let c = -half; c <= half; c++) {
        const tie = r === 1 || r === 5;
        const strand = (c + r) % 2 === 0;
        const shade = c < -1 ? 5 : c > 1 ? 2 : strand ? 4 : 3;
        p.set(bx + c, y, tie ? 'crimson' : 'thatch', tie ? (c < 0 ? 4 : 3) : shade);
      }
    });
    // Ragged strand ends.
    for (const c of [-4, -2, 1, 3]) p.set(bx + c, 19, 'thatch', c < 0 ? 4 : 2);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: POLE_X, x1: POLE_X + 2, groundY: GROUND, reach: 8, depth: 3 });
  },
};

export default broomSign;
