// Вогонь горна — the smithy's forge fire (plan M2-08, ART-BIBLE §5 «Вогонь», §8.3): an add-on laid on the hearth's
// fire bed (`smithyForge`), 4 frames @8 fps. A bed of coals (crimson 2/3 with gold 3 hot spots) and low tongues of
// flame (gold 3 → 5 core, crimson 4 tips) whose heights follow a fixed table per frame — whole px, no pulse of the
// whole fire. `@emissive`: the coals and the flames glow after grading at night, and the light layer lays a warm
// flickering pool in front of the smithy (`FORGE` in render/atmosphere/config.ts). 14×12, pivot under the coal bed.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 14;
const H = 12;
export const FORGE_FRAMES = 4;
const BED = H - 1;
/** Flame heights for columns 2…11 per frame (0 = no tongue); neighbouring frames differ by ±1–2 px per tongue. */
const TONGUES: readonly (readonly number[])[] = [
  [0, 2, 4, 3, 6, 5, 3, 4, 2, 0],
  [1, 3, 3, 5, 5, 6, 4, 3, 1, 0],
  [0, 2, 5, 4, 4, 7, 5, 2, 2, 1],
  [1, 3, 4, 6, 3, 5, 6, 3, 1, 0],
];

const forge: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'forge',
  size: { w: W, h: H },
  frames: { idle: FORGE_FRAMES },
  layers: ['emissive'],
  anchor: { x: 7 / W, y: (BED + 1) / H },
  generate(_rng, { frame, buffer, layers, rampSize }) {
    const p = new Plot();
    const glow = new Plot();
    // Coals: two rows across the bed, hot spots shifting with the frame.
    for (let x = 2; x < 12; x++) {
      const hot = (x + frame * 3) % 4 === 0;
      p.set(x, BED, 'crimson', hot ? 3 : 2);
      p.set(x, BED - 1, hot ? 'gold' : 'crimson', 3);
      glow.set(x, BED, 'gold', hot ? 4 : 3);
      glow.set(x, BED - 1, 'gold', hot ? 5 : 4);
    }
    const heights = TONGUES[frame % FORGE_FRAMES] ?? [];
    heights.forEach((h, i) => {
      const x = i + 2;
      for (let k = 0; k < h; k++) {
        const y = BED - 2 - k;
        const tip = k === h - 1;
        const core = k < h - 2 && i > 1 && i < 8;
        p.set(x, y, tip ? 'crimson' : 'gold', tip ? 4 : core ? 5 : 3);
        glow.set(x, y, 'gold', tip ? 3 : core ? 5 : 4);
      }
    });
    compose(buffer, [p.part(1, 1, glow)], rampSize, {
      light: false,
      occlusion: false,
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
  },
};

export default forge;
