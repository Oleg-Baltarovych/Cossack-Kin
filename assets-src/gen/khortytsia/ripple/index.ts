// Брижі — the ripples a boat makes on the Dnipro (plan M2-11, SPEC §6.3 «брижі від човнів»): broken 1-px dashes at the
// waterline and the row under it, wider than the hull, light (water 6) on the lit side and a darker trough (water 3)
// under each crest. 3 frames: the dashes step outward a px at a time and the outermost one fades — whole px, no blur.
// Drawn over the boat's waterline (render boats.ts). Variants: `day`, and `night` with the crests a step lower (the
// graded light crest read as a lit line on the dark river, art-director M2-11). Pivot = the waterline row's centre.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 34;
const H = 3;
const CX = W / 2;
export const RIPPLE_FRAMES = 3;
/** Dash rows: [row, distance from the centre to the dash's inner end, length] per dash, per side. */
const DASHES: readonly (readonly [number, number, number])[] = [
  [0, 11, 3],
  [1, 9, 4],
  [2, 13, 3],
];

const ripple: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'ripple',
  size: { w: W, h: H },
  frames: { idle: RIPPLE_FRAMES },
  variants: ['day', 'night'],
  anchor: { x: CX / W, y: 1 / H },
  generate(_rng, { variant, buffer, frame, rampSize }) {
    const p = new Plot();
    const dim = variant === 'night' ? 1 : 0;
    for (const [row, inner, len] of DASHES) {
      const from = inner + frame;
      // The dash that has run furthest out loses its outer px (it fades into the stream).
      const n = frame === RIPPLE_FRAMES - 1 ? len - 1 : len;
      for (let k = 0; k < n; k++) {
        const crest = (row === 0 ? 6 : 5) - dim;
        p.set(CX - from - k - 1, row, 'water', crest);
        p.set(CX + from + k, row, 'water', k === 0 ? crest : crest - 1);
      }
      // A trough px under the inner end of the lower dashes.
      if (row > 0 && row + 1 < H) {
        p.set(CX - from - 1, row + 1, 'water', 3);
        p.set(CX + from, row + 1, 'water', 3);
      }
    }
    // Along the hull itself: a broken light line where the water laps the waterline.
    for (let x = CX - 9; x < CX + 9; x++)
      if ((x + frame) % 3 !== 0) p.set(x, 1, 'water', ((x + frame) % 3 === 1 ? 6 : 4) - dim);
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default ripple;
