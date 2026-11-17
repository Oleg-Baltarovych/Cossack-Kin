// Вежа частоколу — a square log watchtower (plan ART-11, ART-BIBLE §6): a зруб of horizontal courses with round log
// ends on the corners, a lookout band with two slit windows (lit at night: the watch), a broad шатро roof with a
// finial. 32×88, pivot at the base; cast shadow to the right.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { logWall, opening, tentRoof } from '../../lib/recipes-sich.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 32;
const H = 88;
export const TOWER_GROUND = 86;
const WALL = { x: 5, w: 22, top: 34 };

const tower: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'tower',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: 0.5, y: (TOWER_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const body = new Plot();
    const glow = new Plot();
    logWall(body, { seed: 'tower', x: WALL.x, y: WALL.top, w: WALL.w, h: TOWER_GROUND + 1 - WALL.top, ends: true });
    // Lookout: two slits under the roof (the watch's fire shows at night).
    opening(body, glow, { x: WALL.x + 5, y: WALL.top + 3, w: 3, h: 5 }, 1);
    opening(body, glow, { x: WALL.x + 14, y: WALL.top + 3, w: 3, h: 5 }, 1);
    const roof = new Plot();
    tentRoof(roof, W / 2, 6, WALL.top, W - 2);
    compose(buffer, [body.part(1, 1, glow), roof.part(2, 2)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [2] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: W / 2, x1: WALL.x + WALL.w + 1, groundY: TOWER_GROUND });
  },
};

export default tower;
