// Чумак — the salt carter (plan M2-21, SPEC §2.6, §16), 18×28 on the 32-px traveller canvas, facing right: a wide
// flat straw бриль, the tar-blackened shirt chumaks wore on the road (дьогтем просмолена сорочка), a crimson пояс,
// wide linen шаровари; the батіг (ox whip) in his near hand, its lash hanging and swinging. He walks at the shoulder
// of his oxen (the food cart's віз, M2-20). Ramps: skin, thatch, stone, crimson, plaster, wood.
import type { Mask, Outfit } from '../../lib/doll.ts';
import { travellerGenerator, thinLine, type Traveller } from '../visitor.ts';

/** A wide flat бриль (13 px brim) over the brow, face 3/4 right, a dark moustache. */
const HEAD: Mask = [
  '.....cCCcg...',
  '..cCCCCCCccg.',
  'cCCCCCCCCCccg',
  '...zzSzzzz...',
  '...zsjssjs...',
  '...zssssSss..',
  '....zsHhhh...',
  '....zhsssh...',
];

export const CHUMAK_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [2, 3, 4, 5] },
  hair: { ramp: 'wood', tones: [0, 1, 2, 3] },
  // Tarred linen: near-black, the lit tone a dull grey.
  // Lit tone a step up: a lighter rim on the top-left shoulder and sleeve (art-director M2-21).
  shirt: { ramp: 'stone', tones: [0, 0, 1, 3] },
  lower: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  accent: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'wood', tones: [0, 1, 2, 3] },
  hat: { ramp: 'thatch', tones: [2, 3, 4, 5] },
};

/** The lash's sway (px) per walk frame. */
const SWAY = [0, 1, 1, 1, 0, 0];

const CHUMAK: Traveller = {
  id: 'chumak',
  outfit: CHUMAK_OUTFIT,
  head: HEAD,
  headAt: { x: 3, y: 2 },
  dress: 'shirt',
  arm: 1,
  thin: (f) => {
    const s = f.anim === 'walk' ? (SWAY[f.frame] ?? 0) : 0;
    const t = f.top;
    return [
      // A 2-px handle (lit edge and shade).
      ...thinLine({ x: 15, y: 15 + t }, { x: 18, y: 9 + t }, 'wood', 4),
      ...thinLine({ x: 16, y: 15 + t }, { x: 19, y: 9 + t }, 'wood', 2),
      // The lash: from the tip, the thick plaited part a tone lighter, tapering to the dark fall as it droops and swings.
      ...thinLine({ x: 20, y: 9 + t }, { x: 21, y: 11 + t }, 'wood', 2),
      ...thinLine({ x: 21, y: 12 + t }, { x: 21 + s, y: 14 + t }, 'wood', 1),
      ...thinLine({ x: 21 + s, y: 15 + t }, { x: 20 + s, y: 17 + t }, 'wood', 1),
      ...thinLine({ x: 20 + s, y: 18 + t }, { x: 21 + s, y: 21 + t }, 'wood', 0),
    ];
  },
  shadow: [3, 16],
};

export default travellerGenerator(CHUMAK);
