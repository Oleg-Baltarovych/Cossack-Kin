// Горн гончаря — the potter's kiln (plan M2-07), an add-on of the potter's khata from tier V: a domed clay kiln on a
// low base, lit upper left, a sooty smoke hole on top, an arched fire mouth with embers (by night the mouth glows:
// `@emissive`, a light pool in front) and split firewood stacked on the right. Ramps: earth, ink, crimson, wood.
// 30×26, pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 30;
const H = 26;
export const KILN_GROUND = 23;
export const KILN_PIVOT_X = 12;
const R = 9; // dome half-width
const DOME_H = 14;

const kiln: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'kiln',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: KILN_PIVOT_X / W, y: (KILN_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    const glow = new Plot();
    const cx = KILN_PIVOT_X;
    const base = KILN_GROUND - 2;
    // Dome: half-width shrinks toward the top (integer ellipse, no trig).
    for (let r = 0; r < DOME_H; r++) {
      const y = base - r;
      const t = r / DOME_H;
      const half = Math.round(R * Math.sqrt(1 - t * t));
      for (let x = cx - half; x <= cx + half; x++) {
        const u = (x - (cx - half)) / Math.max(1, 2 * half);
        let shade = u < 0.3 ? 5 : u < 0.65 ? 4 : u < 0.85 ? 3 : 2;
        if (r > DOME_H - 4 && u < 0.5) shade = 5;
        if ((x * 3 + y * 5) % 11 === 0) shade -= 1; // clay patching
        p.set(x, y, 'earth', shade);
      }
    }
    // Smoke hole with soot.
    p.set(cx - 1, base - DOME_H, 'ink', 1);
    p.set(cx, base - DOME_H, 'ink', 1);
    p.set(cx - 1, base - DOME_H + 1, 'earth', 1);
    p.set(cx, base - DOME_H + 1, 'earth', 1);
    // Base plinth: two rows of earth 2 / 1.
    for (let x = cx - R - 1; x <= cx + R + 1; x++) {
      p.set(x, base + 1, 'earth', x < cx ? 3 : 2);
      p.set(x, base + 2, 'earth', 1);
    }
    // Arched fire mouth: 5 wide, 5 tall, embers at the bottom; the glow mask is the mouth.
    const mx = cx - 2;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 0 && (c === 0 || c === 4)) continue;
        const y = base - 4 + r;
        const ember = r >= 3 && (c + r) % 2 === 0;
        p.set(mx + c, y, ember ? 'crimson' : 'ink', ember ? 2 : 1);
        glow.set(mx + c, y, 'gold', r >= 3 ? 4 : r >= 1 ? 3 : 2);
      }
    }
    for (let c = -1; c <= 5; c++) p.set(mx + c, base - 5, 'earth', c === -1 || c === 5 ? 2 : 1); // arch lintel
    for (let c = 0; c <= 4; c++) p.set(mx + c, base - 6, 'ink', 2); // soot above the mouth
    // Firewood stack on the right: split logs, end grain wood 5 rings.
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4 - row; k++) {
        const x = cx + R + 2 + k * 3 + row;
        const y = KILN_GROUND - 1 - row * 2;
        p.set(x, y, 'wood', 5);
        p.set(x + 1, y, 'wood', 3);
        p.set(x, y + 1, 'wood', 3);
        p.set(x + 1, y + 1, 'wood', 1);
      }
    }
    compose(buffer, [p.part(1, 1, glow)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: cx, x1: cx + R + 2, groundY: KILN_GROUND, reach: 7, depth: 3 });
  },
};

export default kiln;
