// Лірник — the wandering hurdy-gurdy player (plan M2-21, SPEC §2.6), 18×28 on the 32-px traveller canvas, facing
// right: a brimless grey felt cap, a grey свита with a crimson sash, linen trousers; his lira (a long box with the
// key-box along the top, the wheel cover at the back and the L-shaped crank at its tail) hangs at his near hip on a
// strap across the chest, the crank turning in idle. Ramps: skin, wood (hair, boots, lira, strap), stone, plaster, crimson.
import type { Mask, Outfit } from '../../lib/doll.ts';
import { travellerGenerator, thinLine, type PropLegend, type Traveller } from '../visitor.ts';

/** Felt cap with a shaded band, face 3/4 right, a brown moustache. */
const HEAD: Mask = ['..cCCc..', '.cCCCccg', '.gggggg.', 'zSSsssz.', 'zsGssGs.', 'zssssSss', '.zsHhhh.', '.zHsssh.'];

export const LIRNYK_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'wood', tones: [1, 2, 3, 4] },
  shirt: { ramp: 'stone', tones: [1, 2, 3, 4] },
  lower: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  accent: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'wood', tones: [0, 1, 2, 3] },
  hat: { ramp: 'stone', tones: [0, 1, 2, 3] },
};

/**
 * The lira (art-director M2-21): a wheel-cover hump at the back end, a darker 1-px key-box along the top of the body,
 * the body a step lighter than the strap with a top-left highlight, a dark rim.
 */
const LIRA: Mask = ['.hh......', 'hHhkkkkk.', 'rBbbbbbbr', 'rbbbbbbbr', 'rbbbbbbr.', '.rrrrrr..'];
const LIRA_INK: PropLegend = {
  h: ['wood', 3],
  H: ['wood', 5],
  k: ['wood', 1],
  b: ['wood', 4],
  B: ['wood', 6],
  r: ['wood', 2],
};
/** The crank at the tail: its axle and an L-shaped 2-px handle turning a quarter per idle frame (still on the walk). */
const AXLE = { x: 18, y: 19 } as const;
const CRANK: readonly (readonly { readonly x: number; readonly y: number }[])[] = [
  [
    { x: 19, y: 19 },
    { x: 19, y: 20 },
  ],
  [
    { x: 19, y: 19 },
    { x: 20, y: 19 },
  ],
  [
    { x: 19, y: 19 },
    { x: 19, y: 18 },
  ],
  [
    { x: 19, y: 18 },
    { x: 20, y: 18 },
  ],
];

const LIRNYK: Traveller = {
  id: 'lirnyk',
  outfit: LIRNYK_OUTFIT,
  head: HEAD,
  headAt: { x: 6, y: 2 },
  dress: 'coat',
  front: (f) => [{ mask: LIRA, legend: LIRA_INK, x: 9, y: 16 + f.bob }],
  thin: (f) => {
    const crank = CRANK[f.anim === 'idle' ? f.frame : 0] ?? [];
    return [
      ...thinLine({ x: 6, y: 10 + f.top }, { x: 10, y: 15 + f.bob }, 'wood', 1),
      { x: AXLE.x, y: AXLE.y + f.bob, ramp: 'wood', shade: 1 },
      ...crank.map((p) => ({ x: p.x, y: p.y + f.bob, ramp: 'wood' as const, shade: 3 })),
    ];
  },
  shadow: [3, 17],
};

export default travellerGenerator(LIRNYK);
