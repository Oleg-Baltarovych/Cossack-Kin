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
 * The lira (art-director M2-21): a wheel-cover hump at the back end standing 2 px over the box with a lit top-left
 * (M2-29: it was 1 px and read as a bump in the lid), a darker 1-px key-box along the top of the body, the body a step
 * lighter than the strap with a top-left highlight, a dark rim.
 */
const LIRA: Mask = ['.Hh......', 'hHhh.....', 'hhhkkkkk.', 'rBbbbbbbr', 'rbbbbbbbr', 'rbbbbbbr.', '.rrrrrr..'];
const LIRA_AT = { x: 9, y: 15 } as const;
const LIRA_INK: PropLegend = {
  h: ['wood', 3],
  H: ['wood', 5],
  k: ['wood', 1],
  b: ['wood', 4],
  B: ['wood', 6],
  r: ['wood', 2],
};
/** The crank's axle out of the tail end (body-local). */
const AXLE = { x: 18, y: 19 } as const;
/**
 * The crank seen from the side (M2-29, art-director M2-21: the L of two same-tone px read as a stub): it turns in the
 * plane across the box, so its arm (a 1-px post, wood 2) and handle (a 1-px knob, wood 5) step up → toward us → down →
 * behind, one quarter per idle frame (still, up, on the walk). Points are body-local; `post` null = foreshortened.
 */
const CRANK: readonly {
  readonly post: { x: number; y: number } | null;
  readonly knob: { x: number; y: number; shade: number };
}[] = [
  { post: { x: 19, y: 18 }, knob: { x: 19, y: 17, shade: 5 } },
  { post: null, knob: { x: 19, y: 19, shade: 5 } },
  { post: { x: 19, y: 20 }, knob: { x: 19, y: 21, shade: 5 } },
  { post: null, knob: { x: 19, y: 19, shade: 2 } },
];

const LIRNYK: Traveller = {
  id: 'lirnyk',
  outfit: LIRNYK_OUTFIT,
  head: HEAD,
  headAt: { x: 6, y: 2 },
  dress: 'coat',
  front: (f) => [{ mask: LIRA, legend: LIRA_INK, x: LIRA_AT.x, y: LIRA_AT.y + f.bob }],
  thin: (f) => {
    const crank = CRANK[f.anim === 'idle' ? f.frame : 0];
    const b = f.bob;
    return [
      // The strap ends on the hump's top, over its highlight's shoulder.
      ...thinLine({ x: 6, y: 10 + f.top }, { x: 10, y: 14 + b }, 'wood', 1),
      { x: AXLE.x, y: AXLE.y + b, ramp: 'wood', shade: 1 },
      ...(crank?.post ? [{ x: crank.post.x, y: crank.post.y + b, ramp: 'wood' as const, shade: 2 }] : []),
      ...(crank ? [{ x: crank.knob.x, y: crank.knob.y + b, ramp: 'wood' as const, shade: crank.knob.shade }] : []),
    ];
  },
  shadow: [3, 17],
};

export default travellerGenerator(LIRNYK);
