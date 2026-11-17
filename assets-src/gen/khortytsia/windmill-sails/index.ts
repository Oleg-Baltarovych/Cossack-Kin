// Крила вітряка — the four sails of the post mill (plan ART-13): 8 frames covering a quarter turn (the sails are 4-fold
// symmetric, so 8 × 11.25° loop seamlessly). Each frame is rasterized px by px in the generator — no runtime rotation,
// so the sails never shimmer at sub-px offsets. A sail: a spar (wood 1/2) from the hub, and on its trailing side a
// lattice frame (wood 3 laths every 4 px on a blade-relative grid) with a canvas infill (plaster 3, a plaster 4 edge
// toward the sun, plaster 2 on the shaded edge) over the inner three quarters; the outer quarter is open lattice.
// Angles are quantized to 1/4096 (generator determinism contract). 72×72, pivot at the hub (centre).
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const S = 72;
const C = (S - 1) / 2;
export const SAIL_FRAMES = 8;
/** Sail reach from the hub (px); the lattice runs from INNER to REACH on one side of the spar. */
const REACH = 33;
const INNER = 7;
const WIDTH = 7;

const q = (v: number): number => Math.round(v * 4096) / 4096;

const sails: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'windmill-sails',
  size: { w: S, h: S },
  frames: { idle: SAIL_FRAMES },
  anchor: { x: 0.5, y: 0.5 },
  generate(_rng, { frame, buffer, rampSize }) {
    const p = new Plot();
    const base = (frame / SAIL_FRAMES) * (Math.PI / 2);
    for (let k = 0; k < 4; k++) {
      const a = base + (k * Math.PI) / 2;
      const ca = q(Math.cos(a));
      const sa = q(Math.sin(a));
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x - C;
          const dy = y - C;
          // Blade-local coordinates: u along the spar, v across it (positive = trailing side).
          const u = dx * ca + dy * sa;
          const v = -dx * sa + dy * ca;
          if (u < 1 || u > REACH) continue;
          if (Math.abs(v) < 0.75) {
            p.set(x, y, 'wood', 2);
            continue;
          }
          if (u < INNER || v < 0.75 || v > WIDTH) continue;
          const edge = v > WIDTH - 1 || u > REACH - 1 || u < INNER + 1;
          // Laths on a blade-relative grid (rounded, so a lath keeps its place along the blade frame to frame).
          const cross = Math.round(u) % 4 === 0;
          const open = u > INNER + (REACH - INNER) * 0.72; // the outer quarter is open lattice: grass shows through
          // The open tip's frame one step darker (wood 2), so the tips fade out instead of reading heavier.
          if (edge || cross) p.set(x, y, 'wood', open ? 2 : 3);
          else if (!open) {
            // Canvas plaster 3 (never brighter than the whitewashed khatas); a 1-px plaster 4 lit edge on the side
            // facing the sun (top-left), plaster 2 on the shaded edge.
            const towardSun = sa - ca > 0; // +v side faces up-left
            const nearOuter = v > WIDTH - 2;
            const nearSpar = v < 1.75;
            const lit = (towardSun && nearOuter) || (!towardSun && nearSpar);
            const shaded = (towardSun && nearSpar) || (!towardSun && nearOuter);
            p.set(x, y, 'plaster', lit ? 4 : shaded ? 2 : 3);
          }
        }
      }
    }
    // Hub cap.
    for (let y = Math.floor(C) - 1; y <= Math.ceil(C) + 1; y++) {
      for (let x = Math.floor(C) - 1; x <= Math.ceil(C) + 1; x++) p.set(x, y, 'wood', x < C ? 3 : 1);
    }
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default sails;
