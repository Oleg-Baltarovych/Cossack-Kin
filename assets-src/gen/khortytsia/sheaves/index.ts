// Снопи — three stooks of sheaves (копи) standing in the stubble, an add-on of the wheat field from tier IV (plan
// M2-06). One ramp (thatch). 36×16, pivot at the base; a contact ellipse + a short cast shadow per stook.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { composeOutlined, stook } from '../../lib/recipes-farm.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 36;
const H = 16;
export const SHEAVES_GROUND = 13;
/** Stooks: centre x, ground row, rows tall. */
const STOOKS = [
  [6, 13, 11],
  [17, 12, 12],
  [28, 13, 10],
] as const;

const sheaves: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'sheaves',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (SHEAVES_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    for (const [cx, g, h] of STOOKS) stook(p, cx, g, h);
    composeOutlined(buffer, [p.part(1, 1)], rampSize);
    if (layers.shadow) {
      for (const [cx, g] of STOOKS) castShadow(layers.shadow, { x0: cx, x1: cx + 4, groundY: g, reach: 4, depth: 2 });
    }
  },
};

export default sheaves;
