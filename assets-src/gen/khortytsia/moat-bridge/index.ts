// Plank bridge over the moat at the gate path (plan M2-09, art-director: the moat must read): 2-px planks laid along
// the path across the water, dark side beams, a 1-px shadow on the water under the near edge. A flat decal drawn over
// the `moat`/`rampart` tiles from walls II (after the road track). 12×8, centred.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 12;
const H = 8;

const moatBridge: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'moat-bridge',
  size: { w: W, h: H },
  frames: { idle: 1 },
  anchor: { x: 0.5, y: 0.5 },
  generate(_rng, { buffer, rampSize }) {
    const plot = new Plot();
    for (let y = 0; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const beam = x === 1 || x === W - 2;
        // Planks 2 px wide: lit / shaded pairs, the far end a step lighter (it catches the light).
        const pair = Math.floor((x - 2) / 2) % 2 === 0;
        plot.set(x, y, 'wood', beam ? 1 : y === 0 ? 5 : pair ? 4 : 3);
      }
    }
    for (let x = 1; x < W - 1; x++) plot.set(x, H - 1, 'ink', 1);
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default moatBridge;
