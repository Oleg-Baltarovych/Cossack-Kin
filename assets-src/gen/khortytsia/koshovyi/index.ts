// Дім кошового (M2-09, ART-BIBLE §6 «дім кошового — більший курінь із ґанком»): a taller log house under a heavy reed
// roof with a daub chimney; a raised porch (ґанок) on carved posts (crimson notches) up two steps, with a low railing,
// a carved valance and a plank gable — crimson bargeboards with gold studs, a gold sun in the pediment, a gold
// finial; carved crimson window surrounds (лиштви) with a small pediment; a бунчук (pole, gold knob, pale horsetail)
// by the porch. Four lit windows. Night (M2-08): thatch ≤ 4. Ramps: wood, thatch, ink, crimson, gold, plaster.
// 104×66, pivot at the base; cast shadow to the right.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { thatchRoof } from '../../lib/recipes.ts';
import { logWall, opening } from '../../lib/recipes-sich.ts';
import { daubChimney, plankDoor, softenThatch } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 104;
const H = 66;
export const KOSHOVYI_GROUND = 63;
const WALL = { x: 14, w: 76, top: 35 } as const;
export const KOSHOVYI_PIVOT_X = WALL.x + WALL.w / 2;
const CX = KOSHOVYI_PIVOT_X;
const ROOF = { x: WALL.x - 3, w: WALL.w + 6, top: 8, lip: WALL.top - 3 } as const;
/** Porch deck top row (two steps above the ground) and the door on it. */
const DECK = KOSHOVYI_GROUND - 5;
const DOOR = { x: CX - 4, w: 9, top: DECK - 16 } as const;
const GABLE = { top: 22, rows: 17 } as const;
const POSTS = [CX - 12, CX + 10] as const;
/** Window glass (5 × 6), two each side of the porch, mirrored on the pivot. */
const WIN = { w: 5, h: 6, y: WALL.top + 8 } as const;
const WINDOW_XS = [20, 30, 2 * CX - 30 - WIN.w, 2 * CX - 20 - WIN.w] as const;
/** Бунчук pole column (2 px), left of the porch; knob top row. */
export const BUNCHUK_X = CX - 15;
const BUNCHUK_TOP = 3;

const halfAt = (r: number): number => 1 + Math.floor((r * 3) / 4);

const koshovyi: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'koshovyi',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: KOSHOVYI_PIVOT_X / W, y: (KOSHOVYI_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const g = KOSHOVYI_GROUND;
    const body = new Plot();
    const glow = new Plot();
    logWall(body, { seed: 'koshovyi', x: WALL.x, y: WALL.top, w: WALL.w, h: g + 1 - WALL.top, ends: true });
    for (let x = WALL.x; x < WALL.x + WALL.w; x++) {
      body.set(x, WALL.top, 'wood', 0);
      body.set(x, WALL.top + 1, 'wood', (x & 1) === 0 ? 0 : 1);
    }
    // Windows in carved surrounds: crimson jambs (lit left), a lintel, a small pediment with a gold boss, a dentil
    // row under the sill.
    for (const x of WINDOW_XS) {
      const y = WIN.y;
      opening(body, glow, { x, y, w: WIN.w, h: WIN.h }, 1);
      for (let r = 0; r < WIN.h; r++) {
        body.set(x - 1, y + r, 'crimson', 4);
        body.set(x + WIN.w, y + r, 'crimson', 2);
      }
      for (let c = -2; c <= WIN.w + 1; c++) body.set(x + c, y - 1, 'crimson', 3);
      for (let c = 0; c < WIN.w; c++) body.set(x + c, y - 2, 'crimson', c < 2 ? 4 : 3);
      for (let c = 1; c < WIN.w - 1; c++) body.set(x + c, y - 3, 'crimson', c === 1 ? 4 : 2);
      body.set(x + 2, y - 2, 'gold', 4);
      for (let c = -1; c <= WIN.w; c += 2) body.set(x + c, y + WIN.h + 1, 'crimson', 2);
    }
    // Under the porch roof the logs sit two steps deeper in shade, so the posts and railing stand out.
    const beam = GABLE.top + GABLE.rows - 1;
    for (let y = beam + 1; y <= DECK; y++) {
      for (let x = POSTS[0] + 3; x < POSTS[1]; x++) {
        const px = body.get(x, y);
        if (px?.ramp === 'wood') body.set(x, y, 'wood', Math.max(0, px.shade - 2));
      }
    }
    plankDoor(body, DOOR.x, DOOR.top, DOOR.w, DECK - DOOR.top);

    const roof = new Plot();
    const info = thatchRoof(roof, { seed: 'koshovyi', ...ROOF });
    softenThatch(roof);
    const flue = new Plot();
    daubChimney(flue, info.ridgeX1 - 10, ROOF.top - 4, 8);

    const porch = new Plot();
    // Gable: reed rake, crimson bargeboard with gold studs, a dark inner line, plank pediment, the tie beam.
    for (let r = 0; r < GABLE.rows; r++) {
      const y = GABLE.top + r;
      const half = halfAt(r);
      for (let x = CX - half; x <= CX + half; x++) {
        const u = x - CX;
        const edge = half - Math.abs(u);
        if (r === GABLE.rows - 1) porch.set(x, y, 'wood', u < 0 ? 1 : 0);
        else if (edge === 0) porch.set(x, y, 'thatch', u < 0 ? 4 : 1);
        else if (edge === 1) {
          const stud = r % 3 === 2;
          porch.set(x, y, stud ? 'gold' : 'crimson', stud ? (u < 0 ? 4 : 3) : u < 0 ? 4 : 2);
        } else if (edge === 2) porch.set(x, y, 'wood', 0);
        else porch.set(x, y, 'wood', u % 2 === 0 ? 2 : u < 0 ? 4 : 3);
      }
    }
    // Sun in the pediment: a gold disc with four rays.
    const sy = GABLE.top + 10;
    for (const [dx, dy, shade] of [
      [0, -2, 4],
      [-1, -1, 4],
      [0, -1, 5],
      [1, -1, 4],
      [-2, 0, 4],
      [-1, 0, 5],
      [0, 0, 4],
      [1, 0, 4],
      [2, 0, 3],
      [-1, 1, 4],
      [0, 1, 4],
      [1, 1, 3],
      [0, 2, 3],
    ] as const) {
      porch.set(CX + dx, sy + dy, 'gold', shade);
    }
    porch.set(CX, GABLE.top - 1, 'gold', 4);
    porch.set(CX, GABLE.top - 2, 'gold', 5);
    // Valance (carved board) under the beam between the posts.
    for (let x = POSTS[0] + 3; x < POSTS[1]; x++) {
      porch.set(x, beam + 1, 'crimson', 3);
      if ((x - CX) % 2 === 0) porch.set(x, beam + 2, 'crimson', 2);
    }
    // Carved posts: 3 px (lit, mid, shaded) with crimson notches every 3 rows, a wider cap under the beam.
    for (const px of POSTS) {
      for (let y = beam + 1; y < DECK; y++) {
        const notch = (y - beam) % 3 === 0 && y < DECK - 1;
        porch.set(px, y, 'wood', 4);
        porch.set(px + 1, y, notch ? 'crimson' : 'wood', notch ? 3 : 3);
        porch.set(px + 2, y, 'wood', 1);
      }
      for (let c = -1; c <= 3; c++) porch.set(px + c, beam + 1, 'wood', c < 1 ? 4 : 2);
    }
    // Railing between each post and the door: a top rail and 1-px balusters.
    const railTop = DECK - 6;
    for (const [a, b] of [
      [POSTS[0] + 3, DOOR.x - 1],
      [DOOR.x + DOOR.w + 1, POSTS[1]],
    ] as const) {
      for (let x = a; x < b; x++) {
        porch.set(x, railTop, 'wood', x < CX ? 4 : 3);
        if ((x - a) % 2 === 1) for (let y = railTop + 1; y < DECK; y++) porch.set(x, y, 'wood', 3);
      }
    }
    // Deck, skirting and two steps down to the ground.
    const d0 = CX - halfAt(GABLE.rows - 1);
    const d1 = CX + halfAt(GABLE.rows - 1);
    for (let x = d0; x <= d1; x++) {
      porch.set(x, DECK, 'wood', x < CX ? 5 : 4);
      porch.set(x, DECK + 1, 'wood', 2);
      for (let y = DECK + 2; y <= g; y++) porch.set(x, y, 'wood', (x - d0) % 3 === 0 ? 0 : 1);
    }
    for (let x = CX - 6; x <= CX + 6; x++) {
      porch.set(x, DECK + 2, 'wood', x < CX ? 5 : 4);
      porch.set(x, DECK + 3, 'wood', 2);
    }
    for (let x = CX - 7; x <= CX + 7; x++) {
      porch.set(x, DECK + 4, 'wood', x < CX ? 5 : 4);
      porch.set(x, g, 'wood', 2);
    }

    // Бунчук: a dark pole, a gold knob, a pale horsetail tuft hanging under it (lit left, strands shaded right).
    const pole = new Plot();
    const bx = BUNCHUK_X;
    for (let y = BUNCHUK_TOP + 3; y <= g; y++) {
      pole.set(bx, y, 'wood', 2);
      pole.set(bx + 1, y, 'wood', 0);
    }
    pole.set(bx, BUNCHUK_TOP, 'gold', 5);
    pole.set(bx + 1, BUNCHUK_TOP, 'gold', 4);
    pole.set(bx - 1, BUNCHUK_TOP + 1, 'gold', 4);
    pole.set(bx, BUNCHUK_TOP + 1, 'gold', 4);
    pole.set(bx + 1, BUNCHUK_TOP + 1, 'gold', 3);
    pole.set(bx + 2, BUNCHUK_TOP + 1, 'gold', 3);
    pole.set(bx, BUNCHUK_TOP + 2, 'gold', 3);
    pole.set(bx + 1, BUNCHUK_TOP + 2, 'gold', 3);
    /** Tuft rows: [first dx, last dx] around the pole; strands of uneven length at the hem. */
    const TUFT: readonly (readonly [number, number])[] = [
      [-1, 2],
      [-2, 3],
      [-2, 3],
      [-3, 3],
      [-3, 4],
      [-3, 4],
      [-3, 4],
      [-2, 4],
      [-3, 3],
      [-2, 3],
    ];
    TUFT.forEach(([c0, c1], r) => {
      const y = BUNCHUK_TOP + 3 + r;
      for (let c = c0; c <= c1; c++) {
        const strand = (c + 7) % 2 === 1;
        if (r === TUFT.length - 1 && strand) continue;
        const shade = c <= c0 + 1 ? 4 : c >= c1 - 1 ? 2 : strand ? 2 : 3;
        pole.set(bx + c, y, 'plaster', shade);
      }
    });

    compose(
      buffer,
      [body.part(2, 2, glow), roof.part(1, 1), flue.part(5, 5), porch.part(4, 4), pole.part(6, 6)],
      rampSize,
      {
        light: false,
        occlusion: false,
        outline: { mode: 'outer', parts: [1, 4] },
        selective: { lit: 'vanish' },
        ...(layers.emissive ? { emissive: layers.emissive } : {}),
      },
    );
    if (layers.shadow) castShadow(layers.shadow, { x0: CX, x1: WALL.x + WALL.w + 1, groundY: g });
  },
};

export default koshovyi;
