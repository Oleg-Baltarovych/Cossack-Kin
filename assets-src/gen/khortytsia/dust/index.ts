// Пил — dust kicked up at a scaffold's foot while a building goes up (plan M2-12): 3 frames by age, a small dense
// earth-brown puff → a wider one → a large thin one fraying away. Binary alpha thinned by a fixed scatter of holes
// (like the smoke, M2-11: graded world content must stay opaque or binary). Lit from the top-left. Pivot = bottom centre.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 9;
const H = 6;
/** Per age: half-width, height, kept share of px. */
const AGES = [
  { rx: 2.2, ry: 1.6, density: 1 },
  { rx: 3.4, ry: 2.3, density: 0.8 },
  { rx: 4.4, ry: 2.9, density: 0.5 },
] as const;

function scatter(x: number, y: number, f: number): number {
  let h = Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(f + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const dust: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'dust',
  size: { w: W, h: H },
  frames: { idle: AGES.length },
  anchor: { x: 4 / W, y: (H - 1) / H },
  generate(_rng, { frame, buffer, rampSize }) {
    const age = AGES[frame] ?? AGES[0];
    const p = new Plot();
    const cx = 4;
    const cy = H - 1 - age.ry + 0.6;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = (x - cx) / age.rx;
        const ny = (y - cy) / age.ry;
        const d = nx * nx + ny * ny;
        if (d > 1 || scatter(x, y, frame) > age.density * (1.2 - d * 0.6)) continue;
        // Light dust on the lit top-left, darker earth under it.
        const shade = nx + ny < -0.4 ? 5 : ny > 0.3 ? 3 : 4;
        p.set(x, y, 'earth', frame === 2 ? shade - 1 : shade);
      }
    }
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default dust;
