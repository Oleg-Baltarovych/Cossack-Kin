// Мазаний курінь, the Sich's third kurin (M2-09, ART-BIBLE §6 «довгі рубані або мазані хати під очеретом»): a long
// whitewashed wattle-and-daub barracks in the tavern's 3/4 view (lit front face, shaded side wall under the right
// hip), a heavy reed roof, a plank door under its курінний знак (crossed sabres, gold on crimson), four lit windows.
// Night (M2-08): whitewash two steps down and thatch ≤ 4, so the windows stay the focal point. Ramps: plaster,
// thatch, wood, ink, crimson, gold (no pryzba, no clay patch: the budget). 112×56, pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { eaveAO, sideWall, thatchRoof, whitewashWall, WINDOW, windowRecipe, type Rect } from '../../lib/recipes.ts';
import { kurinSign } from '../../lib/recipes-sich.ts';
import { plankDoor, softenThatch } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 112;
const H = 56;
export const KURIN_B_GROUND = 54;
/** Wall 9…103 (front face + side wall); pivot at its centre. */
const WALL = { x: 9, w: 94 } as const;
export const KURIN_B_PIVOT_X = WALL.x + WALL.w / 2;
const SIDE = 9;
const FRONT_W = WALL.w - SIDE;
const WALL_TOP = 32;
const ROOF = { x: WALL.x - 3, w: WALL.w + 6, top: 5, lip: WALL_TOP - 3 } as const;
const DOOR: Rect = { x: 47, y: KURIN_B_GROUND - 14, w: 8, h: 15 };
const SIGN: Rect = { x: DOOR.x - 2, y: WALL_TOP + 1, w: 12, h: 7 };
/** Crossed sabres on the 10 × 5 field: blades gold 4 crossing in the middle, hilts and guards gold 3. */
const SABRES: readonly (readonly [number, number, number?])[] = [
  [1, 1],
  [2, 1],
  [9, 1],
  [10, 1],
  [3, 2],
  [8, 2],
  [4, 3],
  [5, 3],
  [6, 3],
  [7, 3],
  [3, 4, 3],
  [8, 4, 3],
  [2, 5, 3],
  [4, 5, 3],
  [7, 5, 3],
  [9, 5, 3],
];
const WINDOW_XS = [15, 30, 64, 79] as const;

const kurinB: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'kurin-b',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: KURIN_B_PIVOT_X / W, y: (KURIN_B_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const seed = 'kurin-b';
    const g = KURIN_B_GROUND;
    const winY = WALL_TOP + 5;
    const windows: Rect[] = WINDOW_XS.map((x) => ({ x, y: winY, w: WINDOW.w, h: WINDOW.h + 1 }));

    const body = new Plot();
    const glow = new Plot();
    whitewashWall(body, {
      seed,
      x: WALL.x,
      y: WALL_TOP,
      w: FRONT_W,
      h: g - WALL_TOP + 1,
      avoid: [...windows, DOOR, SIGN],
      aoRows: 2,
      clay: false,
      shadeEdge: false,
    });
    eaveAO(body, WALL.x, WALL.x + FRONT_W, WALL_TOP);
    sideWall(body, { x: WALL.x + FRONT_W, y: WALL_TOP, w: SIDE, h: g - WALL_TOP + 1 });
    for (const win of windows) windowRecipe(body, glow, win.x, win.y);
    plankDoor(body, DOOR.x, DOOR.y, DOOR.w, DOOR.h);
    kurinSign(body, SIGN.x, SIGN.y, SIGN.w, SIGN.h, SABRES);

    // Whitewash two steps down (tavern, art-director M2-08): the lit front plaster 4, the corner 3, the side wall 2.
    const REMAP = [1, 1, 1, 2, 3, 4, 4] as const;
    for (const [key, px] of body.px) {
      if (px.ramp === 'plaster') body.px.set(key, { ...px, shade: REMAP[px.shade] ?? px.shade });
    }

    const roof = new Plot();
    thatchRoof(roof, { seed, ...ROOF, hipFoot: { left: 0.45, right: 0.9 } });
    softenThatch(roof);

    compose(buffer, [body.part(2, 2, glow), roof.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [1] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: KURIN_B_PIVOT_X, x1: WALL.x + WALL.w + 1, groundY: g });
  },
};

export default kurinB;
