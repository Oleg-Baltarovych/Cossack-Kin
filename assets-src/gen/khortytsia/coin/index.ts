// Дукат — the coin that pops from a tap on the world (plan M1-19, SPEC §6.7 juice). 9×9, gold ramp only, lit from the
// top-left; 4 frames of a spin (face → three-quarter → edge → three-quarter) so a rising coin turns as it fades.
// No outline pass: it flies over every ground colour, so its rim is the dark end of the gold ramp itself.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const SIZE = 9;
const C = (SIZE - 1) / 2;
const R = 4.3;
/** Half-width of the face per spin frame (the face narrows to its edge and back). */
const HALF_W = [R, 2.8, 1.4, 2.8] as const;

const coin: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'coin',
  size: { w: SIZE, h: SIZE },
  frames: { idle: HALF_W.length },
  anchor: { x: 0.5, y: 0.5 },
  generate(_rng, { buffer, frame, rampSize }) {
    const hw = HALF_W[frame] ?? R;
    const plot = new Plot();
    const top = rampSize('gold') - 1;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // Ellipse: full height, the width of the spin frame.
        const nx = (x - C) / hw;
        const ny = (y - C) / R;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const rim = d > 0.55;
        // Light from the top-left: the upper-left half of the face is lighter, the lower-right darker.
        const lit = x - C + (y - C) < 0;
        let shade = rim ? (lit ? 3 : 1) : lit ? 4 : 3;
        // A glint on the face near the top-left, only while the face is turned to us.
        if (frame === 0 && x === 3 && y === 2) shade = top;
        // The edge-on frame is all rim.
        if (hw < 1.5) shade = lit ? 3 : 2;
        plot.set(x, y, 'gold', Math.min(top, shade));
      }
    }
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default coin;
