// Бджоли — a little swarm over the hives (plan M2-06, SPEC §6.5 idle animation «бджоли біля вуликів»): 4 frames
// @ 8 fps. Five bees clustered within ~16 px, each a 3×2 body (gold 4 · ink 1 stripe · gold 4 over gold 3 · ink 1 ·
// gold 3) with a 1-px light wing (plaster 6) above it on alternate frames, on its own 4-step loop of whole-px offsets,
// phases staggered. 1-px detail: no outline (ART-BIBLE §3), no shadow. Shown by day only and never under «менше руху»
// (the layout marks the part `daytime`). 20×24, pivot at the bottom centre = the hive's ground.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 20;
const H = 24;
export const BEES_FRAMES = 4;
/** Home points (x, y of the body's left px) and loop phase; rows 4–12 = 12–20 px above the ground, around the caps. */
const BEES = [
  [2, 9, 0],
  [7, 4, 1],
  [12, 8, 2],
  [15, 5, 3],
  [9, 12, 1],
] as const;
/** One loop: a small lopsided circle of whole-px steps. */
const LOOP = [
  [0, 0],
  [2, -1],
  [2, 1],
  [0, 2],
] as const;

const bees: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'bees',
  size: { w: W, h: H },
  frames: { idle: BEES_FRAMES },
  anchor: { x: 0.5, y: 1 },
  generate(_rng, { frame, buffer, rampSize }) {
    const p = new Plot();
    BEES.forEach(([x, y, phase], i) => {
      const [dx, dy] = LOOP[(frame + phase) % LOOP.length] ?? [0, 0];
      // Alternate bees fly the loop mirrored, so they cross.
      const bx = x + (i % 2 === 0 ? dx : -dx);
      const by = y + dy;
      p.set(bx, by, 'gold', 4);
      p.set(bx + 1, by, 'ink', 1);
      p.set(bx + 2, by, 'gold', 4);
      p.set(bx, by + 1, 'gold', 3);
      p.set(bx + 1, by + 1, 'ink', 1);
      p.set(bx + 2, by + 1, 'gold', 3);
      if ((frame + i) % 2 === 0) p.set(bx + 1, by - 1, 'plaster', 6);
    });
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default bees;
