// Курінь з ґанком, the Sich's fourth kurin (M2-09, ART-BIBLE §6): a log barracks like `kurin` with its own
// silhouette — a covered porch (ґанок) on two posts before the door, its reed gable breaking the eave line with the
// курінний знак (a gold star on crimson) in the pediment, and a whitewashed daub chimney (димар) through the thatch.
// Four lit windows. Night (M2-08): thatch ≤ 4. Ramps: wood, thatch, ink, crimson, gold, plaster. 112×62, pivot at
// the base; cast shadow to the right.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { thatchRoof } from '../../lib/recipes.ts';
import { kurinSign, logWall, opening } from '../../lib/recipes-sich.ts';
import { daubChimney, plankDoor, softenThatch, timberPost } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 112;
const H = 62;
export const KURIN_C_GROUND = 60;
const WALL = { x: 11, w: 90, top: 35 } as const;
export const KURIN_C_PIVOT_X = WALL.x + WALL.w / 2;
const ROOF = { x: WALL.x - 3, w: WALL.w + 6, top: 7, lip: WALL.top - 3 } as const;
/** Door and porch centred on the pivot column. */
const CX = KURIN_C_PIVOT_X;
const DOOR = { x: CX - 3, w: 7, top: KURIN_C_GROUND - 16 } as const;
/** Porch gable: apex row, rows down to the tie beam; half-width 1 + ¾ per row. */
const GABLE = { top: 28, rows: 15 } as const;
const POSTS = [CX - 10, CX + 8] as const;
/** Star on the 7 × 5 field. */
const STAR: readonly (readonly [number, number, number?])[] = [
  [2, 1, 3],
  [4, 1],
  [6, 1, 3],
  [3, 2],
  [4, 2],
  [5, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [4, 3],
  [5, 3],
  [6, 3],
  [7, 3],
  [3, 4],
  [4, 4],
  [5, 4],
  [2, 5, 3],
  [4, 5],
  [6, 5, 3],
];
const WINDOW_XS = [WALL.x + 8, WALL.x + 22, WALL.x + 63, WALL.x + 77] as const;

const halfAt = (r: number): number => 1 + Math.floor((r * 3) / 4);

const kurinC: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'kurin-c',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: KURIN_C_PIVOT_X / W, y: (KURIN_C_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const g = KURIN_C_GROUND;
    const body = new Plot();
    const glow = new Plot();
    logWall(body, { seed: 'kurin-c', x: WALL.x, y: WALL.top, w: WALL.w, h: g + 1 - WALL.top, ends: true });
    for (let x = WALL.x; x < WALL.x + WALL.w; x++) {
      body.set(x, WALL.top, 'wood', 0);
      body.set(x, WALL.top + 1, 'wood', (x & 1) === 0 ? 0 : 1);
    }
    for (const wx of WINDOW_XS) opening(body, glow, { x: wx, y: WALL.top + 8, w: 5, h: 5 }, 1);
    // Under the porch roof the logs sit a step deeper in shade, so the posts stand out from the wall.
    const beam = GABLE.top + GABLE.rows - 1;
    for (let y = beam + 1; y <= g; y++) {
      for (let x = POSTS[0] + 3; x < POSTS[1]; x++) {
        const px = body.get(x, y);
        if (px?.ramp === 'wood') body.set(x, y, 'wood', Math.max(0, px.shade - 2));
      }
    }
    plankDoor(body, DOOR.x, DOOR.top, DOOR.w, g - DOOR.top + 1);

    const roof = new Plot();
    const info = thatchRoof(roof, { seed: 'kurin-c', ...ROOF });
    softenThatch(roof);
    const flue = new Plot();
    daubChimney(flue, info.ridgeX1 - 12, ROOF.top - 4, 8);

    // Porch (ґанок): a front gable — reed rakes (lit left, shaded right), a plank pediment carrying the sign, a tie
    // beam — on two posts, a plank step at the foot.
    const porch = new Plot();
    for (let r = 0; r < GABLE.rows; r++) {
      const y = GABLE.top + r;
      const half = halfAt(r);
      for (let x = CX - half; x <= CX + half; x++) {
        const u = x - CX;
        const edge = half - Math.abs(u);
        if (r === GABLE.rows - 1) porch.set(x, y, 'wood', u < 0 ? 1 : 0);
        else if (edge === 0) porch.set(x, y, 'thatch', u < 0 ? 4 : 1);
        else if (edge === 1) porch.set(x, y, 'wood', u < 0 ? 5 : 1);
        else if (edge === 2) porch.set(x, y, 'wood', 0);
        else porch.set(x, y, 'wood', u % 2 === 0 ? 2 : u < 0 ? 4 : 3);
      }
    }
    kurinSign(porch, CX - 4, GABLE.top + 6, 9, 7, STAR);
    porch.set(CX, GABLE.top - 1, 'wood', 4);
    for (const px of POSTS) timberPost(porch, px, beam + 1, g, 3);
    for (let x = POSTS[0] - 1; x <= POSTS[1] + 3; x++) porch.set(x, g, 'wood', x < CX ? 4 : 3);

    compose(buffer, [body.part(2, 2, glow), roof.part(1, 1), flue.part(5, 5), porch.part(4, 4)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [1, 4] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: CX, x1: WALL.x + WALL.w + 1, groundY: g });
  },
};

export default kurinC;
