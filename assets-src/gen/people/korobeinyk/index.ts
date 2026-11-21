// Коробейник — the pedlar (plan M2-21, SPEC §2.6), 18×28 on the 32-px traveller canvas, facing right: a brown felt
// шапка, a brown homespun свита with a crimson sash, linen trousers (art-director M2-21: not the blue long kaftan of
// the Russian офеня); a tall wooden короб on his back, rising over the shoulder — a lid with its seam, plank seams, a
// strap down the side, the right face a tone darker — its strap over the near shoulder. Ramps: skin, earth (hair,
// cap, boots, straps), wood (свита), crimson, plaster, thatch (the box's pale wood).
import type { Mask, Outfit } from '../../lib/doll.ts';
import { travellerGenerator, thinLine, type PropLegend, type Traveller } from '../visitor.ts';

/** A rounded felt cap, face 3/4 right, a short beard under the moustache. */
const HEAD: Mask = ['.cCCCc..', 'cCCCCccg', 'gCCCccgg', 'zSSsssz.', 'zsGssGs.', 'zssssSss', '.zshhhh.', '..zhhhj.'];

export const KOROBEINYK_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'earth', tones: [0, 1, 2, 3] },
  shirt: { ramp: 'wood', tones: [1, 2, 3, 4] },
  lower: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  accent: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'earth', tones: [0, 1, 2, 3] },
  hat: { ramp: 'earth', tones: [1, 2, 3, 4] },
};

/** The wooden короб: a light lid, its seam, plank seams, a strap down the side; the right face a tone darker. */
const PACK: Mask = [
  'TTTTTTTt',
  'LLLLLLtd',
  'eeeeeeee',
  'LLeLLLtd',
  'LLeLLLtd',
  'llellltd',
  'LLeLLLtd',
  'LLeLLLtd',
  'llellltd',
  'LLeLLLtd',
  'LLeLLLtd',
  '.ddddddd',
];
const PACK_INK: PropLegend = {
  T: ['thatch', 5],
  L: ['thatch', 4],
  l: ['thatch', 3],
  t: ['thatch', 3],
  d: ['thatch', 2],
  e: ['earth', 1],
};

const KOROBEINYK: Traveller = {
  id: 'korobeinyk',
  outfit: KOROBEINYK_OUTFIT,
  head: HEAD,
  headAt: { x: 6, y: 2 },
  dress: 'coat',
  back: (f) => [{ mask: PACK, legend: PACK_INK, x: -2, y: 6 + f.top }],
  thin: (f) => thinLine({ x: 6, y: 10 + f.top }, { x: 9, y: 15 + f.top }, 'earth', 1),
  shadow: [0, 16],
};

export default travellerGenerator(KOROBEINYK);
