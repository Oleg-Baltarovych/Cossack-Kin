// Загін у дорозі (plan M3-10; M3-11 shows it for a running raid): a Cossack rider (dark shapka, crimson top) on a bay
// horse, facing east (the way M3-11 moves it is its business; flip in the DOM for the west). A
// 4-frame trot (legs and tail — the rider stays, «менше руху» shows frame 0). Ramps: ink outline, wood
// horse, crimson coat and shapka top, skin. No emblem (SPEC §16). 18×16, pivot at the hooves' centre.
import { Glyph } from '../../lib/glyph.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const SQUAD_W = 18;
export const SQUAD_H = 16;

/** Leg columns per row (rows 10–12) for each trot frame: back pair, front pair. */
const LEGS: readonly (readonly (readonly [number, number, number])[])[] = [
  [
    [5, 4, 3],
    [6, 6, 6],
    [11, 12, 13],
    [10, 10, 10],
  ],
  [
    [5, 5, 5],
    [7, 7, 7],
    [11, 11, 11],
    [10, 10, 10],
  ],
  [
    [5, 5, 5],
    [6, 5, 4],
    [11, 11, 11],
    [10, 11, 12],
  ],
  [
    [5, 5, 5],
    [7, 7, 7],
    [11, 11, 11],
    [10, 10, 10],
  ],
];

const raidSquad: SpriteGenerator = {
  atlas: 'map',
  id: 'raid-squad',
  size: { w: SQUAD_W, h: SQUAD_H },
  frames: { march: LEGS.length },
  anchor: { x: 0.5, y: 1 },
  generate(_rng, { frame, buffer }) {
    const g = new Glyph();
    // Everything one row down: the lance's head keeps its outline row.
    const set = (x: number, y: number, ramp: 'wood' | 'ink' | 'skin' | 'crimson', shade: number): void => {
      g.set(x, y + 1, ramp, shade);
    };
    // Horse: body lit on top, shaded belly; the neck forward at ~45° with a dark mane, a long head, one ear tip.
    for (let x = 4; x <= 12; x++) {
      set(x, 7, 'wood', 4);
      set(x, 8, 'wood', 3);
      set(x, 9, 'wood', 2);
    }
    for (const [x, y, s] of [
      [13, 7, 3],
      [13, 8, 2],
      [12, 6, 3],
      [13, 6, 3],
      [13, 5, 3],
      [14, 5, 3],
      [14, 4, 4],
      [15, 4, 4],
      [16, 4, 3],
      [15, 5, 3],
      [16, 5, 2],
      [14, 3, 2],
    ] as const)
      set(x, y, 'wood', s);
    set(12, 5, 'ink', 3);
    set(13, 4, 'ink', 3);
    // The tail flicks between strides.
    const tail =
      frame % 2 === 0
        ? ([
            [3, 7],
            [2, 8],
            [2, 9],
          ] as const)
        : ([
            [3, 7],
            [2, 7],
            [1, 8],
          ] as const);
    for (const [x, y] of tail) set(x, y, 'wood', 1);
    // Legs, the hoof row darker.
    for (const leg of LEGS[frame] ?? []) {
      leg.forEach((x, i) => {
        set(x, 10 + i, 'wood', i === 2 ? 1 : 2);
      });
    }
    // Rider: a dark shapka with a crimson top, face (facing east), crimson coat, sharovary over the saddle.
    set(8, 1, 'crimson', 3);
    set(8, 2, 'ink', 3);
    set(9, 2, 'ink', 3);
    set(8, 3, 'skin', 3);
    set(9, 3, 'skin', 4);
    set(8, 4, 'crimson', 4);
    set(9, 4, 'crimson', 3);
    set(8, 5, 'crimson', 3);
    set(9, 5, 'crimson', 2);
    set(8, 6, 'crimson', 2);
    // His leg down the horse's flank, the hand forward on the reins.
    set(8, 7, 'crimson', 2);
    set(8, 8, 'crimson', 1);
    set(10, 5, 'skin', 3);
    g.draw(buffer);
  },
};

export default raidSquad;
