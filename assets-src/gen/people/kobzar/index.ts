// Кобзар — the blind wandering bard (plan M2-21, SPEC §6.4, §2.6), 18×28 on the 32-px traveller canvas, facing right.
// An old man, bare-headed, long grey hair to the nape and a long grey moustache, eyes closed; a brown свита with the
// linen collar, light linen trousers. Walking, his kobza (pear-shaped bowl, neck straight up) rides on his back and he feels the
// way with a staff; `play` 4@6: seated on a low stool, the kobza on his knee, the far hand on its neck, the near hand
// strumming over the rosette while a string shivers. Ramps: skin, stone (grey hair), earth, plaster, wood.
import type { Mask, Outfit } from '../../lib/doll.ts';
import type { Plot } from '../../lib/plot.ts';
import {
  FAR_SHOULDER,
  NEAR_SHOULDER,
  SIT_DROP,
  paintBody,
  paintProp,
  paintSleeve,
  paintThin,
  seatedStamps,
  thinLine,
  travellerGenerator,
  type FrameInfo,
  type PropLegend,
  type Traveller,
} from '../visitor.ts';

/** Bare head: grey hair over the crown and down the back of the head, eyes closed, a long drooping moustache. */
const HEAD: Mask = ['..jhHh..', '.jhHHHh.', 'jhhSSsz.', 'jhzsZsZ.', 'jhssssSs', 'jjzsHhhh', '.j.zHssh', '....H..h'];

export const KOBZAR_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'stone', tones: [2, 3, 4, 5] },
  shirt: { ramp: 'earth', tones: [1, 2, 3, 4] },
  lower: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  accent: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  belt: { ramp: 'wood', tones: [1, 2, 3, 4] },
  boots: { ramp: 'wood', tones: [0, 1, 2, 3] },
  hat: { ramp: 'stone', tones: [1, 2, 3, 4] },
};

/**
 * The kobza on his back (art-director M2-21): a pear-shaped bowl with the neck straight above it and the pegbox on
 * top — one object — a pale string from the soundhole up the neck, the rim in the darkest brown (it separates the bowl
 * from the свита).
 */
const KOBZA_BACK: Mask = [
  '..p...',
  '..nS..',
  '..nS..',
  '..nS..',
  '..nS..',
  '..rS..',
  '.rbSr.',
  '.rbSr.',
  'rbBSbr',
  'rbbobr',
  'rbbbbr',
  'rbbbbr',
  '.rrrr.',
];
/** The bowl alone, on his knee in `play` (the neck is drawn 1 px wide toward the pegs). */
const KOBZA_BOWL: Mask = ['..rr...', '.rbbrr.', 'rbBbbbr', 'rbbobbr', 'rbbbbbr', 'rbbbbbr', '.rrrrr.'];
const KOBZA_INK: PropLegend = {
  r: ['wood', 0],
  b: ['wood', 5],
  B: ['wood', 6],
  o: ['wood', 0],
  n: ['wood', 2],
  p: ['wood', 1],
  S: ['wood', 6],
};

/** A low stool (дзиґлик) under him in `play`: seat and two legs, mostly under the coat. */
const STOOL: Mask = ['lsssssss', 'dddddddd', '.d....d.', '.d....d.', '.d....d.'];
const STOOL_INK: PropLegend = { l: ['wood', 4], s: ['wood', 3], d: ['wood', 1] };

/** The strumming hand's place over the rosette, per `play` frame. */
const STRUM: readonly { readonly x: number; readonly y: number }[] = [
  { x: 13, y: 20 },
  { x: 14, y: 21 },
  { x: 13, y: 21 },
  { x: 14, y: 20 },
];

function play(plot: Plot, thin: Plot, f: FrameInfo): void {
  paintProp(plot, { mask: STOOL, legend: STOOL_INK, x: 4, y: 23 });
  paintSleeve(plot, KOBZAR_OUTFIT, { x: FAR_SHOULDER.x, y: FAR_SHOULDER.y + SIT_DROP }, { x: 18, y: 15 }, true);
  paintBody(plot, KOBZAR_OUTFIT, seatedStamps(KOBZAR, f.frame === 2 ? 1 : 0));
  paintProp(plot, { mask: KOBZA_BOWL, legend: KOBZA_INK, x: 9, y: 17 });
  const hand = STRUM[f.frame] ?? { x: 13, y: 20 };
  paintSleeve(plot, KOBZAR_OUTFIT, { x: NEAR_SHOULDER.x, y: NEAR_SHOULDER.y + SIT_DROP }, hand, false);
  // The neck up and forward to the pegs, and one string shivering across the board.
  paintThin(thin, [
    ...thinLine({ x: 15, y: 17 }, { x: 19, y: 12 }, 'wood', 2),
    { x: 20, y: 11, ramp: 'wood', shade: 1 },
    { x: 11, y: 19 + (f.frame % 2), ramp: 'wood', shade: 6 },
  ]);
}

/** The staff's foot (px ahead of the hand) per walk frame: planted ahead once a cycle, then passed as he steps on. */
const STAFF_LEAN = [2, 1, 1, 0, 0, -1];

const KOBZAR: Traveller = {
  id: 'kobzar',
  outfit: KOBZAR_OUTFIT,
  head: HEAD,
  headAt: { x: 6, y: 2 },
  dress: 'coat',
  // The kobza on his back, its neck straight up behind the far shoulder.
  back: (f) => [{ mask: KOBZA_BACK, legend: KOBZA_INK, x: -1, y: 6 + f.top }],
  // The staff in the near hand (held forward), planted ahead.
  arm: 1,
  thin: (f) => [
    ...thinLine(
      { x: 15, y: 13 + f.top },
      { x: 15 + (f.anim === 'walk' ? (STAFF_LEAN[f.frame] ?? 0) : 0), y: 27 },
      'wood',
      3,
    ),
    { x: 15, y: 12 + f.top, ramp: 'wood', shade: 5 },
  ],
  shadow: [1, 16],
  play,
};

export default travellerGenerator(KOBZAR);
