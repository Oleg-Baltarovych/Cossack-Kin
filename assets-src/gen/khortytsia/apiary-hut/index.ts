// Хатка пасічника — the beekeeper's little whitewashed hut under reed thatch (plan M2-06), an add-on of the apiary
// from tier V: the khata recipes at a smaller size (3/4 view: lit front, shaded side wall under the right hip), one
// window with a night mask, pryzba, contact + cast shadow. Ramps: plaster, thatch, wood, earth, ink. 44×36, pivot at
// the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { eaveAO, pryzbaBand, sideWall, thatchRoof, whitewashWall, WINDOW, windowRecipe } from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 44;
const H = 36;
export const HUT_GROUND = 32;
export const HUT_PIVOT_X = 18;
const WALL = { x: 6, w: 24 } as const;
const SIDE = 6;
const FRONT_W = WALL.w - SIDE;
const ROOF = { x: WALL.x - 3, w: WALL.w + 6, top: 2, lip: 12 } as const;
const WALL_TOP = ROOF.lip + 3;
const PRYZBA_Y = HUT_GROUND - 3;
const WINDOW_X = WALL.x + Math.round((FRONT_W - WINDOW.w) / 2);
const WINDOW_Y = WALL_TOP + 3;

const ROOF_PART = 1;
const BODY_PART = 2;

const hut: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'apiary-hut',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: HUT_PIVOT_X / W, y: (HUT_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const seed = 'apiary-hut';
    const body = new Plot();
    const glow = new Plot();
    const win = { x: WINDOW_X, y: WINDOW_Y, w: WINDOW.w, h: WINDOW.h + 1 };
    whitewashWall(body, {
      seed,
      x: WALL.x,
      y: WALL_TOP,
      w: FRONT_W,
      h: PRYZBA_Y - WALL_TOP,
      avoid: [win],
      aoRows: 2,
      shadeEdge: false,
    });
    eaveAO(body, WALL.x, WALL.x + FRONT_W, WALL_TOP);
    sideWall(body, { x: WALL.x + FRONT_W, y: WALL_TOP, w: SIDE, h: PRYZBA_Y - WALL_TOP });
    windowRecipe(body, glow, win.x, win.y);
    pryzbaBand(body, { seed, x: WALL.x - 1, y: PRYZBA_Y, w: WALL.w + 2 });
    const roof = new Plot();
    thatchRoof(roof, { seed, ...ROOF, hipFoot: { left: 0.45, right: 0.9 } });
    compose(buffer, [body.part(2, BODY_PART, glow), roof.part(1, ROOF_PART)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [ROOF_PART] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) {
      castShadow(layers.shadow, {
        x0: WALL.x + Math.floor(WALL.w / 2),
        x1: WALL.x + WALL.w + 1,
        groundY: HUT_GROUND,
        reach: 9,
        depth: 4,
      });
    }
  },
};

export default hut;
