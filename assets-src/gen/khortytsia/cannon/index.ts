// Гармата — a bronze cannon on a wooden field carriage (plan ART-11, ART-BIBLE §6: "гармати на валах"): a tapered
// bronze barrel (gold 1–3, a lit top line, reinforcing rings, a dark muzzle) pointing right, a wooden carriage with a
// trail resting on the ground (wood 2–4), one spoked wheel in front (wood 1 rim, wood 3 spokes, iron hub). 28×16,
// pivot at the base; contact shadow.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 28;
const H = 16;
export const CANNON_GROUND = 14;

const cannon: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'cannon',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (CANNON_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const plot = new Plot();
    // Carriage: a sloping trail from the ground on the left up to the axle on the right.
    for (let x = 2; x < 18; x++) {
      const y = CANNON_GROUND - Math.round((x - 2) * 0.4);
      plot.set(x, y, 'wood', 4);
      plot.set(x, y + 1, 'wood', 2);
      if (y + 2 <= CANNON_GROUND) plot.set(x, y + 2, 'wood', 1);
    }
    // Barrel: 18 px, 4 rows at the breech tapering to 3, bronze; rings at 1/3 and 2/3, a dark muzzle.
    for (let x = 6; x < 26; x++) {
      const t = (x - 6) / 20;
      const rows = t < 0.5 ? 4 : 3;
      const ring = x === 12 || x === 19;
      for (let r = 0; r < rows; r++) {
        const y = 3 + r + (t < 0.5 ? 0 : 0);
        const shade = r === 0 ? 3 : r === rows - 1 ? 1 : 2;
        plot.set(x, y, 'gold', ring ? Math.max(0, shade - 1) : shade);
      }
    }
    plot.set(5, 4, 'gold', 2); // cascabel knob
    plot.set(5, 5, 'gold', 1);
    for (let r = 0; r < 3; r++) plot.set(26, 3 + r, 'ink', 1); // muzzle
    // Wheel: radius 4 around (16, 10): wood 1 rim, wood 3 spokes, a stone hub.
    const cx = 16;
    const cy = 10;
    for (let y = cy - 4; y <= cy + 4; y++) {
      for (let x = cx - 4; x <= cx + 4; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > 18) continue;
        if (d2 >= 10) plot.set(x, y, 'wood', x < cx && y < cy ? 2 : 1);
        else if (x === cx || y === cy || x - cx === y - cy || x - cx === cy - y) plot.set(x, y, 'wood', 3);
      }
    }
    plot.set(cx, cy, 'stone', 3);
    compose(buffer, [plot.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) contactShadow(layers.shadow, { x0: 3, x1: 24, groundY: CANNON_GROUND, height: 3 });
  },
};

export default cannon;
