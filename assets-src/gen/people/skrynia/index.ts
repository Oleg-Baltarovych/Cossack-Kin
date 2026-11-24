// Скриня — the raid's chest (plan M3-13, SPEC §6.6/§6.7: the squad comes home with it, it stands on the maidan until
// claimed): an oak box 12 × 9 with a domed lid, two iron bands over lid and box, an iron lock plate across the seam
// and an iron bracket on each end (the carriers' grips, `nosii`). Two ramps only — oak in earth, iron in stone — so
// the pair of Cossacks carrying it stays within 6 ramps a frame; the UI icon (loot `chest`) is the same object drawn
// at icon scale. Lit from the top-left: the lid's crown and left end lightest, the right end and the foot in shade,
// a dark seam under the lid and a plank seam on the front, a few grain px. `@shadow`: the contact ellipse.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const CHEST = { w: 12, h: 9 } as const;
/** Rows from the chest's top: the brackets (the carriers' hands) sit on this row. */
export const CHEST_GRIP_ROW = 4;

/** Paints the chest with its top-left at (x0, y0). */
export function paintChest(plot: Plot, x0: number, y0: number): void {
  const { w, h } = CHEST;
  const oak = (x: number, y: number, shade: number): void => {
    plot.set(x0 + x, y0 + y, 'earth', shade);
  };
  const iron = (x: number, y: number, shade: number): void => {
    plot.set(x0 + x, y0 + y, 'stone', shade);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Domed lid: the top row is inset 1 px each end.
      if (y === 0 && (x === 0 || x === w - 1)) continue;
      const right = x === w - 1;
      let shade: number;
      if (y === 0) shade = 5;
      else if (y === 1) shade = x === 0 ? 5 : right ? 3 : 4;
      else if (y === 2) shade = right ? 2 : 3;
      else if (y === 3) shade = 1;
      else if (y === h - 1) shade = 1;
      else if (y === 6) shade = 2;
      else shade = x === 0 ? 4 : right ? 2 : 3;
      oak(x, y, shade);
    }
  // Grain on the front planks.
  for (const [x, y] of [
    [4, 4],
    [8, 5],
    [5, 7],
    [9, 7],
  ] as const)
    oak(x, y, 2);
  // Iron bands over the lid (lit) and the box (dark), the lock plate across the seam with its keyhole.
  for (const bx of [2, w - 3]) for (let y = 0; y < h; y++) iron(bx, y, y < 3 ? (y === 0 ? 5 : 4) : y === h - 1 ? 1 : 2);
  iron(5, 2, 5);
  iron(6, 2, 4);
  iron(5, 3, 4);
  iron(6, 3, 3);
  iron(5, 4, 0);
  iron(6, 4, 3);
  // End brackets (the grips).
  iron(0, CHEST_GRIP_ROW, 4);
  iron(w - 1, CHEST_GRIP_ROW, 2);
}

const W = CHEST.w + 2;
const H = CHEST.h + 1;
const GROUND = H - 1;

const skrynia: SpriteGenerator = {
  atlas: 'people',
  id: 'skrynia',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: 1 },
  generate(_rng, { buffer, layers, rampSize }) {
    const plot = new Plot();
    paintChest(plot, 1, 1);
    compose(buffer, [plot.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
    });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: 1, x1: 1 + CHEST.w, groundY: GROUND, height: 3 });
  },
};

export default skrynia;
