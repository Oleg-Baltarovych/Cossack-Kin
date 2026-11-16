// Хата-мазанка, tier I and III (plan ART-05, ART-BIBLE §5–6, recipes docs/art/recipes/materials-1.md): heavy hipped
// reed roof over bright whitewashed walls, pryzba, window(s) with an emissive night mask, contact + wedge shadow.
// Modular: tier III adds a mirrored window, a рушник, a chimney and mallows on the same base. Pivot at the base.
import { compose } from '../../lib/passes.ts';
import { contactShadow, wedgeShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import {
  chimney,
  eaveAO,
  mallow,
  pryzbaBand,
  rushnyk,
  thatchRoof,
  whitewashWall,
  WINDOW,
  windowRecipe,
  type Rect,
} from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 64;
const H = 56;
/** Ground row: the pryzba's bottom row; the sprite's pivot is the bottom edge of this row. */
export const KHATA_GROUND = 52;
const WALL = { x: 10, w: 44 } as const;
const ROOF = { x: WALL.x - 3, w: WALL.w + 6, top: 2, lip: 27 } as const;
const WALL_TOP = ROOF.lip + 3;
const PRYZBA_Y = KHATA_GROUND - 3;
const WINDOW_Y = WALL_TOP + 4;
/** Window 1 centred ~1/3 from the left wall edge; tier III mirrors it. */
const WINDOW_X = WALL.x + Math.round(WALL.w / 3) - 3;
const WINDOW_X2 = WALL.x + WALL.x + WALL.w - 1 - (WINDOW_X + WINDOW.w - 1);

const ROOF_PART = 1;
const BODY_PART = 2;

const khata: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'khata',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: ['t1', 't3'],
  layers: ['emissive', 'shadow'],
  anchor: { x: 0.5, y: (KHATA_GROUND + 1) / H },
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
      w: WALL.w,
      h: PRYZBA_Y - WALL_TOP,
      avoid: windows,
      aoRows: 3,
    });
    eaveAO(body, WALL.x, WALL.x + WALL.w, WALL_TOP);
    for (const win of windows) windowRecipe(body, glow, win.x, win.y);
    pryzbaBand(body, { seed, x: WALL.x - 1, y: PRYZBA_Y, w: WALL.w + 2 });
    if (tier3) {
      const first = windows[0];
      if (first) rushnyk(body, first);
      mallow(body, WALL.x + 2, KHATA_GROUND, 9);
      mallow(body, WALL.x + 5, KHATA_GROUND, 7);
      mallow(body, WALL.x + WALL.w - 4, KHATA_GROUND, 8);
    }

    const roof = new Plot();
    const info = thatchRoof(roof, { seed, ...ROOF });
    if (tier3) chimney(roof, info.ridgeX1 - 7, ROOF.top - 1, 7);

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
      contactShadow(shadow, { x0: WALL.x - 1, x1: WALL.x + WALL.w + 1, groundY: KHATA_GROUND });
      wedgeShadow(shadow, { x: WALL.x + WALL.w + 1, groundY: KHATA_GROUND, length: 9, height: 4 });
    }
  },
};

export default khata;
