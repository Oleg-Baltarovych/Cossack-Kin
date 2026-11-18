// Віз зі снопами — a wooden harvest cart heaped with sheaves, an add-on of the wheat field from tier V (plan M2-06,
// ART-BIBLE §6 «вози»): ladder sides (драбини) over a plank bed, two spoked wheels (rasterized with integer distances,
// no trig), a drawbar resting on the ground to the left. Ramps: wood, thatch. 48×28, pivot at the wheels' foot.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { composeOutlined, stook } from '../../lib/recipes-farm.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 48;
const H = 28;
export const CART_GROUND = 25;
const BED: { readonly x0: number; readonly x1: number; readonly y: number } = { x0: 9, x1: 40, y: 16 };
const WHEELS = [14, 34] as const;
const R = 5;

function wheel(p: Plot, cx: number, cy: number): void {
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R + R) continue;
      const rim = d2 >= (R - 1) * (R - 1);
      const hub = d2 <= 1;
      const spoke = dx === 0 || dy === 0 || dx === dy || dx === -dy;
      if (rim) p.set(cx + dx, cy + dy, 'wood', dx + dy < 0 ? 3 : 1);
      else if (hub) p.set(cx + dx, cy + dy, 'wood', dx + dy < 0 ? 5 : 3);
      else if (spoke) p.set(cx + dx, cy + dy, 'wood', dx + dy < 0 ? 4 : 2);
    }
  }
}

const cart: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'cart',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (CART_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // Load: a heap of sheaves over the bed, then the ladder side in front of it.
    for (let cx = BED.x0 + 3; cx <= BED.x1 - 3; cx += 5) stook(p, cx, BED.y - 1, 9 + (cx % 3));
    for (let c = BED.x0 + 1; c < BED.x1 - 1; c++) {
      for (let y = BED.y - 7; y < BED.y - 3; y++) p.set(c, y, 'thatch', (c + y) % 3 === 0 ? 5 : c < 24 ? 4 : 3);
    }
    // Ladder side: top rail, rungs every 4 px, bottom rail = bed edge.
    for (let c = BED.x0; c <= BED.x1; c++) {
      p.set(c, BED.y - 5, 'wood', c < 24 ? 5 : 4);
      if ((c - BED.x0) % 4 === 0) for (let y = BED.y - 4; y < BED.y; y++) p.set(c, y, 'wood', 3);
      p.set(c, BED.y, 'wood', 4);
      p.set(c, BED.y + 1, 'wood', 2);
    }
    // Drawbar: from the bed's front corner down to the ground at the left.
    for (let k = 0; k <= 8; k++) {
      const x = BED.x0 - k;
      const y = BED.y + 1 + Math.floor((k * (CART_GROUND - BED.y - 1)) / 8);
      p.set(x, y, 'wood', 3);
      p.set(x, y + 1, 'wood', 1);
    }
    for (const cx of WHEELS) wheel(p, cx, CART_GROUND - R);
    composeOutlined(buffer, [p.part(1, 1)], rampSize);
    if (layers.shadow) {
      castShadow(layers.shadow, { x0: 20, x1: BED.x1 + 1, groundY: CART_GROUND, reach: 8, depth: 3 });
    }
  },
};

export default cart;
