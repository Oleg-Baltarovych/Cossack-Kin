// Конфеті — paper bits thrown up when a new building pops in (plan M2-12, SPEC §6.7 juice): 4 frames, each a colour
// and a turn of a tumbling bit (flat 2×2 on half the frames, edge-on, tilted) — crimson, gold, white and blue, the colours of a
// празник. Drawn after the grade like the tap coins (feedback reads the same at night), so plain lit/dark px.
// Pivot = centre px.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { RampName, SpriteGenerator } from '../../lib/types.ts';

const W = 3;
const H = 3;
/** Per frame: ramp, lit shade, dark shade and the px of the bit (frame coordinates). */
const SQUARE = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;
const BITS: readonly { ramp: RampName; lit: number; dark: number; px: readonly (readonly [number, number])[] }[] = [
  { ramp: 'crimson', lit: 4, dark: 2, px: SQUARE },
  // Edge-on: a 1×3 sliver.
  {
    ramp: 'gold',
    lit: 5,
    dark: 3,
    px: [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
  { ramp: 'plaster', lit: 6, dark: 4, px: SQUARE },
  // Tilted: a 3-px diagonal.
  {
    ramp: 'cloth',
    lit: 3,
    dark: 2,
    px: [
      [2, 0],
      [1, 1],
      [0, 2],
    ],
  },
];

const confetti: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'confetti',
  size: { w: W, h: H },
  frames: { idle: BITS.length },
  anchor: { x: 1 / W, y: 1 / H },
  generate(_rng, { frame, buffer, rampSize }) {
    const bit = BITS[frame] ?? BITS[0];
    if (!bit) return;
    const p = new Plot();
    // The top-left px of a bit catches the light; the rest is its shaded side.
    bit.px.forEach(([x, y], i) => {
      p.set(x, y, bit.ramp, i === 0 ? bit.lit : bit.dark);
    });
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default confetti;
