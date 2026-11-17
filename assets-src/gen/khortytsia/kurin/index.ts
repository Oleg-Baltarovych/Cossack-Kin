// Курінь — a long Cossack barracks (plan ART-11, ART-BIBLE §6: a long log house under reed with the курінний знак
// over the entrance): log walls with round ends, a heavy reed roof (set-1 thatch recipe), a plank door in the middle
// under the курінний знак (a painted board), four lit windows. 112×56, pivot at the base; cast shadow to the right.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { thatchRoof } from '../../lib/recipes.ts';
import { logWall, opening } from '../../lib/recipes-sich.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 112;
const H = 56;
export const KURIN_GROUND = 54;
const WALL = { x: 8, w: 96, top: 29 };
const ROOF = { x: WALL.x - 3, w: WALL.w + 6, top: 3, lip: 26 };
const DOOR = { x: 52, w: 8, top: 38 };
/** Emblem px on the 8 × 3 field of the курінний знак (a gold diamond). */
const EMBLEM: readonly (readonly [number, number])[] = [
  [3, 1],
  [4, 1],
  [2, 2],
  [5, 2],
  [3, 3],
  [4, 3],
];

const kurin: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'kurin',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: 0.5, y: (KURIN_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const body = new Plot();
    const glow = new Plot();
    logWall(body, { seed: 'kurin', x: WALL.x, y: WALL.top, w: WALL.w, h: KURIN_GROUND + 1 - WALL.top, ends: true });
    // Eave shadow on the logs (2 rows wood 0): the plaster AO band of the khata read as tin or snow on a log house.
    for (let x = WALL.x; x < WALL.x + WALL.w; x++) {
      body.set(x, WALL.top, 'wood', 0);
      body.set(x, WALL.top + 1, 'wood', (x & 1) === 0 ? 0 : 1);
    }
    // Door: vertical planks, a dark frame, an iron ring.
    for (let y = DOOR.top; y <= KURIN_GROUND; y++) {
      for (let x = DOOR.x; x < DOOR.x + DOOR.w; x++) {
        const frame = x === DOOR.x || x === DOOR.x + DOOR.w - 1 || y === DOOR.top;
        const gap = (x - DOOR.x) % 3 === 0;
        body.set(x, y, 'wood', frame ? 1 : gap ? 2 : x < DOOR.x + 4 ? 4 : 3);
      }
    }
    body.set(DOOR.x + 5, DOOR.top + 8, 'stone', 3);
    // Курінний знак: a small painted board above the door (crimson field, gold emblem).
    const signTop = WALL.top + 2;
    for (let y = signTop; y < signTop + 5; y++) {
      for (let x = DOOR.x - 1; x < DOOR.x + DOOR.w + 1; x++) {
        const edge = y === signTop || y === signTop + 4 || x === DOOR.x - 1 || x === DOOR.x + DOOR.w;
        if (edge) body.set(x, y, 'wood', 1);
        else body.set(x, y, 'crimson', 3);
      }
    }
    for (const [dx, dy] of EMBLEM) body.set(DOOR.x + dx, signTop + dy, 'gold', 4);
    // Four windows, two each side of the door.
    for (const wx of [WALL.x + 12, WALL.x + 30, WALL.x + 60, WALL.x + 78]) {
      opening(body, glow, { x: wx, y: WALL.top + 8, w: 5, h: 5 }, 1);
    }
    const roof = new Plot();
    thatchRoof(roof, { seed: 'kurin', ...ROOF });
    compose(buffer, [body.part(2, 2, glow), roof.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [1] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: W / 2, x1: WALL.x + WALL.w + 1, groundY: KURIN_GROUND });
  },
};

export default kurin;
