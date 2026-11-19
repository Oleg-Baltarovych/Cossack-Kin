// Спалах — the flash of a new tier (plan M2-12, SPEC §6.7): 3 frames — a 3-px core with 1-px arms, a
// wide star with a ring, a broken ring of sparks fading out. Warm light (plaster top, gold), drawn after the grade like
// the coins so it reads the same at night. Pivot = centre px.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const S = 25;
const C = 12;

const flash: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'flash',
  size: { w: S, h: S },
  frames: { idle: 3 },
  anchor: { x: C / S, y: C / S },
  generate(_rng, { frame, buffer, rampSize }) {
    const p = new Plot();
    // Frame 0: a 3-px core with short 1-px arms; frame 1 the long rays and a ring; frame 2 a sparse ring.
    const ray = frame === 0 ? 4 : frame === 1 ? 11 : 0;
    // Four rays: plaster near the core, gold toward the tips.
    for (let k = 1; k <= ray; k++) {
      const shade = k <= ray / 2 ? 6 : 5;
      for (const [dx, dy] of [
        [k, 0],
        [-k, 0],
        [0, k],
        [0, -k],
      ] as const)
        p.set(C + dx, C + dy, k <= ray / 2 ? 'plaster' : 'gold', shade);
    }
    if (frame < 2) {
      const core = 1;
      for (let dy = -core; dy <= core; dy++)
        for (let dx = -core; dx <= core; dx++)
          if (Math.abs(dx) + Math.abs(dy) <= core) p.set(C + dx, C + dy, 'plaster', 6);
    }
    if (frame >= 1) {
      // A ring of sparks (squared radius band, every other px on the last frame).
      const r = frame === 1 ? 7 : 10;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const d = (x - C) * (x - C) + (y - C) * (y - C);
          if (d < r * r - r || d > r * r + r) continue;
          if (frame === 2 && (x + y) % 3 !== 0) continue;
          p.set(x, y, 'gold', frame === 1 ? 5 : 4);
        }
    }
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default flash;
