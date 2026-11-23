// Кінський щавель — a patch of horse sorrel gone to seed in the steppe band (plan M2-29 A5, Q13 item 5): broad low
// leaves (grass 2–3) and two or three upright panicles of rust-red seed (gold 1 lit left, crimson 2 body, crimson 1 on
// the shaded right) on straw stems — the rusty accents of a late-summer steppe. Five baked sway frames (stiffer than
// the feather grass: the profile leans only the panicles), no outline, 1-row contact shadow. `a` three panicles, `b`
// two and a low one. 16×18, pivot at the root centre.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { footProfile, SWAY_SHIFTS, swayed } from '../../lib/recipes-plants.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 16;
const H = 18;
export const SORREL_GROUND = 16;
const CX = 7;

/** A panicle: stem x, its top row, how many rows of seed hang from the top. */
type Panicle = readonly [number, number, number];

const PANICLES: Readonly<Record<'a' | 'b', readonly Panicle[]>> = {
  a: [
    [CX - 3, 6, 5],
    [CX, 3, 7],
    [CX + 3, 7, 4],
  ],
  b: [
    [CX - 2, 4, 6],
    [CX + 2, 6, 6],
    [CX + 5, 10, 3],
  ],
};

function panicle(p: Plot, [x, top, rows]: Panicle): void {
  for (let y = top; y < SORREL_GROUND - 1; y++) p.set(x, y, 'thatch', 2);
  for (let k = 0; k < rows; k++) {
    const y = top + k;
    // Whorls of seed: wider in the middle of the panicle, a single px at the top; lit on the left.
    const wide = k > 0 && k < rows - 1 && k % 2 === 1;
    p.set(x, y, 'crimson', 2);
    if (wide || k === rows - 1) {
      p.set(x - 1, y, 'gold', 1);
      p.set(x + 1, y, 'crimson', 1);
    }
  }
  p.set(x, top - 1, 'gold', 1);
}

function leaves(p: Plot): void {
  // Broad dock leaves splayed low: two tones, the lit ones left.
  const rows: readonly (readonly [number, number])[] = [
    [-5, 5],
    [-4, 4],
    [-3, 3],
  ];
  rows.forEach(([a, b], i) => {
    const y = SORREL_GROUND - i;
    for (let dx = a; dx <= b; dx++) p.set(CX + dx, y, 'grass', i === 0 ? 1 : dx < 0 ? 3 : 2);
  });
}

const sorrel: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'sorrel',
  size: { w: W, h: H },
  frames: { idle: SWAY_SHIFTS.length },
  variants: ['a', 'b'],
  layers: ['shadow'],
  anchor: { x: CX / W, y: (SORREL_GROUND + 1) / H },
  generate(_rng, { frame, variant, buffer, layers, rampSize }) {
    const shift = SWAY_SHIFTS[frame] ?? 0;
    const p = new Plot();
    for (const pan of PANICLES[variant === 'b' ? 'b' : 'a']) panicle(p, pan);
    leaves(p);
    // Only the seed heads lean (the leaves are low and heavy): half the shift above the leaves.
    const foot = footProfile(SORREL_GROUND - 3, SORREL_GROUND - 6);
    const out = swayed(p, shift, foot);
    compose(buffer, [out.part(1, 1)], rampSize, { light: false, occlusion: false });
    const shadow = layers.shadow;
    if (shadow) for (let x = CX - 3; x <= CX + 5; x++) shadow.set(x, SORREL_GROUND + 1, { ramp: 'ink', shade: 1 });
  },
};

export default sorrel;
