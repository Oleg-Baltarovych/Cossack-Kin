// Дуб — an old oak in the farm's front row (plan ART-14, ART-BIBLE §5 "Дуб / верба"): a broad crown of round
// "cloud" clusters lit from the top-left on a thick furrowed trunk with two limbs. Five sway frames (SWAY_SHIFTS):
// the trunk stands still, the crown moves as one piece, its upper half up to the full shift — whole-px row offsets
// only, so the grid never breaks. 88×96, pivot at the base; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { crown, lean, SWAY_SHIFTS, swayed, trunk } from '../../lib/recipes-plants.ts';
import { seededRng } from '../../lib/rng.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 88;
const H = 96;
export const OAK_GROUND = 94;
/** Rows above this are crown (they sway); below, the trunk (still). */
const CROWN_BOTTOM = 62;
const PUFFS = [
  [44, 34, 17],
  [27, 43, 13],
  [61, 42, 14],
  [34, 22, 12],
  [55, 21, 13],
  [44, 12, 9],
  [16, 50, 8],
  [72, 51, 8],
  [44, 50, 12],
] as const;

const oak: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'oak',
  size: { w: W, h: H },
  frames: { idle: SWAY_SHIFTS.length },
  layers: ['shadow'],
  anchor: { x: 44 / W, y: (OAK_GROUND + 1) / H },
  generate(_rng, { frame, buffer, layers, rampSize }) {
    const shift = SWAY_SHIFTS[frame] ?? 0;
    const wood = new Plot();
    const rng = seededRng('oak:trunk');
    trunk(wood, 40, CROWN_BOTTOM - 14, OAK_GROUND, 8, rng);
    // Root flare and two limbs into the crown.
    for (const dx of [-2, -1, 8, 9]) wood.set(40 + dx, OAK_GROUND, 'wood', dx < 0 ? 2 : 0);
    wood.set(39, OAK_GROUND - 1, 'wood', 3);
    for (let k = 0; k < 12; k++) {
      wood.set(39 - k, CROWN_BOTTOM - 10 - Math.floor(k * 0.6), 'wood', 3);
      wood.set(39 - k, CROWN_BOTTOM - 9 - Math.floor(k * 0.6), 'wood', 1);
      wood.set(48 + k, CROWN_BOTTOM - 12 - Math.floor(k * 0.7), 'wood', 2);
      wood.set(48 + k, CROWN_BOTTOM - 11 - Math.floor(k * 0.7), 'wood', 0);
    }
    const leaves = new Plot();
    crown(leaves, PUFFS, seededRng('oak:crown'));
    // Upper crown leans the full shift, the lower crown half of it (rounded away from 0, so ±1 moves it all).
    const profile = (s: number, _x: number, y: number): number => (y >= CROWN_BOTTOM ? 0 : lean(s, y < 30 ? 1 : 0.5));
    const p = swayed(wood, shift, profile);
    swayed(leaves, shift, profile, p);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 44, x1: 80, groundY: OAK_GROUND, reach: 16, depth: 6 });
  },
};

export default oak;
