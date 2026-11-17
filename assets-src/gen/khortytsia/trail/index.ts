// Протоптані стежки — worn paths across the maidan from the gate to the курінь doors (plan ART-11, art-director
// review: they lead the eye to the gate): two faint ruts of 1-px earth 4 dashes (3–6 px on, 1–3 off), wobbling ±1 px.
// Ground decals: `l` runs from its top-right corner (the gate) down-left, `r` from its top-left corner down-right.
// Pivot at the start (the gate end).
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { seededRng } from '../../lib/rng.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

/** Variant → run (dx, dy) from the gate end to the door end, logical px. */
export const TRAILS: Readonly<Record<string, { readonly dx: number; readonly dy: number }>> = {
  l: { dx: -104, dy: 168 },
  r: { dx: 100, dy: 226 },
};
const W = 112;
const H = 232;

const trail: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'trail',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(TRAILS),
  anchor: { x: 0, y: 0 },
  generate(_rng, { variant, buffer, rampSize }) {
    const run = TRAILS[variant ?? 'l'] ?? { dx: -104, dy: 168 };
    const rng = seededRng(`trail.${variant ?? 'l'}`);
    const plot = new Plot();
    const x0 = run.dx < 0 ? W - 4 : 2;
    const steps = Math.abs(run.dy);
    for (const offset of [0, 3]) {
      let on = 3 + Math.floor(rng() * 4);
      let wobble = 0;
      for (let i = 0; i < steps; i++) {
        if (i % 9 === 0) wobble = Math.max(-1, Math.min(1, wobble + (rng() < 0.5 ? -1 : 1)));
        on -= 1;
        if (on < 0) {
          if (on < -(1 + Math.floor(rng() * 3))) on = 3 + Math.floor(rng() * 4);
          continue;
        }
        const x = Math.round(x0 + (run.dx * i) / steps) + offset + wobble;
        if (x >= 0 && x < W && i < H) plot.set(x, i, 'earth', 4);
      }
    }
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default trail;
