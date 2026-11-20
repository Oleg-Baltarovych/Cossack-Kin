// Відблиск — the tool glint over a villager who finishes a spell of work (plan M2-18, art/code review): a 4-point star
// twinkling from a point to its full cross and back, in whitewash light px. Deliberately not the tap coin: no disc, no
// gold — it says «work done here», never «money» (the core pays nothing for it). Drawn after the grade like the coins.
// Pivot = centre px.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const S = 5;
const C = 2;
/** Frames: point, small cross, full star (arms 2 px, the tips dimmer), small cross again. */
const ARMS = [0, 1, 2, 1] as const;
export const GLINT_FRAMES = ARMS.length;

const glint: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'glint',
  size: { w: S, h: S },
  frames: { idle: GLINT_FRAMES },
  anchor: { x: C / S, y: C / S },
  generate(_rng, { frame, buffer, rampSize }) {
    const arm = ARMS[frame] ?? 0;
    const p = new Plot();
    p.set(C, C, 'plaster', 6);
    for (let r = 1; r <= arm; r++) {
      const shade = r === arm && arm > 1 ? 4 : 5;
      for (const [dx, dy] of [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ] as const)
        p.set(C + dx, C + dy, r === arm && arm > 1 ? 'sky' : 'plaster', shade);
    }
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default glint;
