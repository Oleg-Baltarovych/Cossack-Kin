// Хата-мазанка, tier I and III (plan ART-05, ART-BIBLE §5–6, recipes docs/art/recipes/materials-1.md): heavy hipped
// reed roof over bright whitewashed walls in a 3/4 view — a lit front face and a shaded side wall under the right
// hip — pryzba, window(s) with an emissive night mask, contact line + cast shadow. Modular: tier III adds a mirrored
// window, a рушник and a chimney on the same base; mallows are a separate prop (`mallows`), so the body keeps to
// plaster, thatch, wood and earth (art-director ART-05 review: colour budget). Pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import {
  chimney,
  eaveAO,
  pryzbaBand,
  rushnyk,
  sideWall,
  thatchRoof,
  whitewashWall,
  WINDOW,
  windowRecipe,
  type Rect,
} from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

/** Wider than the house: the cast shadow runs ~12 px right of the wall. */
const W = 76;
const H = 56;
/** Ground row: the pryzba's bottom row; the sprite's pivot is the bottom edge of this row. */
export const KHATA_GROUND = 52;
/** Pivot column (bottom-centre of the house body, as before the canvas grew for the shadow). */
export const KHATA_PIVOT_X = 32;
const WALL = { x: 10, w: 44 } as const;
/** Side wall under the right hip: the last SIDE columns of the wall. */
const SIDE = 9;
const FRONT_W = WALL.w - SIDE;
const ROOF = { x: WALL.x - 3, w: WALL.w + 6, top: 2, lip: 27 } as const;
const WALL_TOP = ROOF.lip + 3;
const PRYZBA_Y = KHATA_GROUND - 3;
const WINDOW_Y = WALL_TOP + 4;
/** Window 1 centred ~1/3 from the left edge of the front face; tier III mirrors it on that face. */
const WINDOW_X = WALL.x + Math.round(FRONT_W / 3) - 3;
const WINDOW_X2 = WALL.x + WALL.x + FRONT_W - 1 - (WINDOW_X + WINDOW.w - 1);

const ROOF_PART = 1;
const BODY_PART = 2;

const khata: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'khata',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: ['t1', 't3'],
  layers: ['emissive', 'shadow'],
  anchor: { x: KHATA_PIVOT_X / W, y: (KHATA_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const tier3 = variant === 't3';
    const seed = `khata.${variant ?? 't1'}`;
    const body = new Plot();
    const glow = new Plot();
    const windows: Rect[] = [{ x: WINDOW_X, y: WINDOW_Y, w: WINDOW.w, h: WINDOW.h + 1 }];
    if (tier3) windows.push({ x: WINDOW_X2, y: WINDOW_Y, w: WINDOW.w, h: WINDOW.h + 1 });

    whitewashWall(body, {
      seed,
      x: WALL.x,
      y: WALL_TOP,
      w: FRONT_W,
      h: PRYZBA_Y - WALL_TOP,
      avoid: windows,
      aoRows: 2,
      shadeEdge: false,
    });
    eaveAO(body, WALL.x, WALL.x + FRONT_W, WALL_TOP);
    sideWall(body, { x: WALL.x + FRONT_W, y: WALL_TOP, w: SIDE, h: PRYZBA_Y - WALL_TOP });
    for (const win of windows) windowRecipe(body, glow, win.x, win.y);
    pryzbaBand(body, { seed, x: WALL.x - 1, y: PRYZBA_Y, w: WALL.w + 2 });
    if (tier3) {
      const first = windows[0];
      if (first) rushnyk(body, first);
    }

    const roof = new Plot();
    // The right hip foot spans the side wall plus the overhang.
    const info = thatchRoof(roof, { seed, ...ROOF, hipFoot: { left: 0.45, right: 0.9 } });
    if (tier3) chimney(roof, info.ridgeX1 - 9, ROOF.top - 1, 7);

    compose(buffer, [body.part(2, BODY_PART, glow), roof.part(1, ROOF_PART)], rampSize, {
      light: false,
      occlusion: false,
      // Heavy soft roof edge: a darker rim only on the shaded right/bottom side of the thatch silhouette.
      outline: { mode: 'outer', parts: [ROOF_PART] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });

    const shadow = layers.shadow;
    if (shadow) {
      castShadow(shadow, {
        x0: WALL.x + Math.floor(WALL.w / 2),
        x1: WALL.x + WALL.w + 1,
        groundY: KHATA_GROUND,
      });
    }
  },
};

export default khata;
