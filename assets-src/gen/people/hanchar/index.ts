// Гончар — the travelling potter selling his ware (plan M2-21, SPEC §2.6), 18×28 on the 32-px traveller canvas,
// facing right: bare-headed, a white shirt with a green пояс over grey шаровари; a pole across his near shoulder with
// a terracotta глечик (jug) hung on a cord at each end, swinging as he walks. Ramps: skin, wood (hair, boots, pole,
// cords), plaster, grass, stone, gold (the fired red-ochre clay; art-director M2-21: not the sack brown).
import type { Mask, Outfit } from '../../lib/doll.ts';
import { travellerGenerator, thinLine, type PropLegend, type Traveller } from '../visitor.ts';

/** Bare head, short brown hair over the brow and ear, face 3/4 right, a 1-px nose with its shadow under it. */
const HEAD: Mask = ['..hHHhh.', '.hHHhhhh', 'hhSSsssh', 'hzsjssj.', 'hzsssssS', '.zsHhhhz', '.zHsssh.', '..zzzz..'];

export const HANCHAR_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'wood', tones: [1, 2, 3, 4] },
  shirt: { ramp: 'plaster', tones: [2, 3, 5, 6] },
  lower: { ramp: 'stone', tones: [2, 3, 4, 5] },
  accent: { ramp: 'plaster', tones: [2, 3, 5, 6] },
  belt: { ramp: 'grass', tones: [1, 2, 3, 4] },
  boots: { ramp: 'wood', tones: [0, 1, 2, 3] },
  hat: { ramp: 'wood', tones: [0, 1, 2, 3] },
};

/**
 * A глечик 7×9 (handle on the right): a 1-px lighter lip over a 2-px neck, wide shoulders narrowing to a flat 3-px
 * base, a 1-px handle loop from neck to shoulder, lit top-left and darkest at the lower right.
 */
const JUG: Mask = ['.HHHm..', '..Lmoo.', '..Lm..o', '.HLLm.o', 'HLLLmmo', 'LLLmmmd', 'LLmmmdd', '.mmmdd.', '..ddd..'];
/** The same jug with the handle on the left (the back one: handles on the outer sides). */
// Masks are ASCII by contract (checkMask), so reversing by UTF-16 unit is exact.
const JUG_BACK: Mask = JUG.map((row) =>
  Array.from({ length: row.length }, (_, i) => row.charAt(row.length - 1 - i)).join(''),
);
const JUG_INK: PropLegend = { H: ['gold', 3], L: ['gold', 2], m: ['gold', 1], d: ['gold', 0], o: ['gold', 0] };
/** The jugs' swing (px) per walk frame: back and front swing opposite. */
const SWING = [0, 1, 1, 0, -1, -1];
/** Rows: the pole, then the jugs' tops (a 2-px cord between). */
const POLE_Y = 11;
const JUG_Y = 14;

const swing = (anim: string, frame: number): number => (anim === 'walk' ? (SWING[frame] ?? 0) : 0);

const HANCHAR: Traveller = {
  id: 'hanchar',
  outfit: HANCHAR_OUTFIT,
  head: HEAD,
  headAt: { x: 6, y: 2 },
  dress: 'shirt',
  back: (f) => [{ mask: JUG_BACK, legend: JUG_INK, x: -6 + swing(f.anim, f.frame), y: JUG_Y + f.top }],
  front: (f) => [{ mask: JUG, legend: JUG_INK, x: 17 - swing(f.anim, f.frame), y: JUG_Y + f.top }],
  thin: (f) => {
    const s = swing(f.anim, f.frame);
    const t = f.top;
    // The yoke, and a cord from it to each jug's neck (the back jug's neck is columns 3–4, the front's 2–3).
    return [
      ...thinLine({ x: -6, y: POLE_Y + t }, { x: 24, y: POLE_Y - 1 + t }, 'wood', 2),
      ...thinLine({ x: -3, y: POLE_Y + 1 + t }, { x: -3 + s, y: JUG_Y - 1 + t }, 'wood', 1),
      ...thinLine({ x: 20, y: POLE_Y + t }, { x: 20 - s, y: JUG_Y - 1 + t }, 'wood', 1),
    ];
  },
  shadow: [-6, 24],
};

export default travellerGenerator(HANCHAR);
