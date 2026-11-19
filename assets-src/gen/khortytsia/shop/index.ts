// Крамниця — the fair's shop (plan M2-08, ART-BIBLE §6 «крамниці»), from tier IV: a plank-walled shop on a stone
// footing in the 3/4 view (lit front, shaded side), a hipped roof of wooden shingles (гонт, staggered rows), a wide
// counter window whose shutter is propped up as an awning, a plank door. At night the counter window glows
// (`@emissive`, a window pool). Tier VI puts the gilt vane on its ridge (`SHOP_RIDGE`). Ramps: wood, stone, ink.
// 56×52, pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { plankDoor } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 56;
const H = 52;
export const SHOP_GROUND = 49;
export const SHOP_PIVOT_X = 24;
const WALL = { x0: 8, front: 28, side: 8, top: 29 };
const ROOF = { top: 12, lip: 27 };
const RIDGE_X = 26;

/** The ridge's middle as a layout offset for the gilt vane (its rod foot on the row above the ridge). */
export const SHOP_RIDGE = { dx: RIDGE_X - SHOP_PIVOT_X, lift: SHOP_GROUND - ROOF.top + 1 } as const;

const shop: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'shop',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: SHOP_PIVOT_X / W, y: (SHOP_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    const glow = new Plot();
    const g = SHOP_GROUND;
    const x1 = WALL.x0 + WALL.front;
    const end = x1 + WALL.side;
    // Plank walls: vertical boards on the front, the side wall a step darker, an eave shadow.
    for (let y = WALL.top; y < g - 1; y++) {
      for (let x = WALL.x0; x < end; x++) {
        const side = x >= x1;
        const seam = (x - WALL.x0) % 4 === 3;
        let shade = side ? (seam ? 1 : 2) : seam ? 2 : x === WALL.x0 ? 4 : 3;
        if (y < WALL.top + 2) shade = Math.max(1, shade - 1);
        p.set(x, y, 'wood', shade);
      }
    }
    // Stone footing.
    for (let x = WALL.x0 - 1; x <= end; x++) {
      p.set(x, g - 1, 'stone', x < x1 ? 3 : 2);
      p.set(x, g, 'stone', (x * 3) % 5 === 0 ? 1 : 2);
    }
    // Counter window with the propped shutter above and jars on the sill; the opening glows at night.
    const wx = WALL.x0 + 3;
    const wy = WALL.top + 6;
    for (let y = wy; y < wy + 7; y++) {
      for (let x = wx; x < wx + 13; x++) {
        const frame = y === wy + 6 || x === wx || x === wx + 12;
        p.set(x, y, frame ? 'wood' : 'ink', frame ? (y === wy + 6 ? 4 : 2) : 1);
        if (!frame) glow.set(x, y, 'gold', y > wy + 3 ? 4 : 3);
      }
    }
    for (const x of [wx + 3, wx + 6, wx + 9]) p.set(x, wy + 5, 'stone', 3);
    for (let x = wx - 1; x < wx + 14; x++) {
      p.set(x, wy - 3, 'wood', 4);
      p.set(x, wy - 2, 'wood', 2);
    }
    for (const x of [wx, wx + 12]) p.set(x, wy - 1, 'wood', 1);
    plankDoor(p, x1 - 9, g - 13, 6, 12);
    // Shingle hip roof: staggered courses, lit left hip, shaded right hip, a dark eave row.
    const roof = new Plot();
    for (let y = ROOF.top; y <= ROOF.lip + 1; y++) {
      const r = y - ROOF.top;
      const inset = Math.max(0, 14 - r);
      const a = WALL.x0 - 3 + inset;
      const b = end + 2 - inset;
      for (let x = a; x < b; x++) {
        const u = (x - a) / Math.max(1, b - a);
        const course = r % 3 === 2;
        const joint = (x + (Math.floor(r / 3) % 2) * 2) % 4 === 0;
        let shade = u < 0.22 ? 4 : u > 0.8 ? 2 : 3;
        if (course || joint) shade -= 1;
        if (y === ROOF.top) shade = 4;
        if (y >= ROOF.lip) shade = y === ROOF.lip ? 3 : 1;
        roof.set(x, y, 'wood', Math.max(1, shade));
      }
    }
    compose(buffer, [p.part(1, 1, glow), roof.part(2, 2)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 1 },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: SHOP_PIVOT_X, x1: end + 1, groundY: g });
  },
};

export default shop;
