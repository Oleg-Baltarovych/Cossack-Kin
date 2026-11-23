// Гончар — the travelling potter selling his ware (plan M2-21, SPEC §2.6), 18×28 on the 32-px traveller canvas,
// facing right: bare-headed, a white shirt with a green пояс over grey шаровари; a pole across his near shoulder with
// a terracotta глечик (jug) hung on a cord at each end, swinging as he walks. Ramps: skin, wood (hair, boots, pole,
// cords), plaster, grass, stone, gold (the fired red-ochre clay; art-director M2-21: not the sack brown).
import type { Mask, Outfit } from '../../lib/doll.ts';
import { travellerGenerator, thinLine, type PropLegend, type Traveller } from '../visitor.ts';

/**
 * Bare head, short brown hair over the brow and ear, face 3/4 right. The nose is not in the mask: a mask px on the
 * face's edge gets the outline round it and reads 2–3 px long (art-director M2-21), so it is one unoutlined px (`NOSE`)
 * with the outline under it as its shadow.
 */
const HEAD: Mask = ['..hHHhh.', '.hHHhhhh', 'hhSSsssh', 'hzsjssj.', 'hzsssss.', '.zsHhhh.', '.zHsssh.', '..zzzz..'];
const HEAD_AT = { x: 6, y: 2 } as const;
/** The nose: one lit skin px off the face's edge (head-local), its shadow the outline px under it. */
const NOSE = { x: 7, y: 4, shade: 4 } as const;

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
 * A глечик 7×9: a flat 3-px lip (вінця) with a 1-px highlight on its lit end and the neck in shade under it, wide
 * shoulders narrowing to a flat 3-px base, lit top-left and darkest at the lower right. Only the body (from the
 * shoulders) is an outlined mask: the outline, lighter on the lit side, rounded an outlined lip and handle into
 * «ears» like a tied pouch (art-director M2-21), so the lip, the neck (`NECK`) and the handle (`HANDLE`, a 1-px loop on
 * the jug's outer side from the neck to the shoulder, the outline px inside it the hole) are unoutlined px.
 */
const JUG: Mask = ['.......', '.......', '.......', '.HLLmm.', 'HLLLmmd', 'LLLmmmd', 'LLmmmdd', '.mmmdd.', '..ddd..'];
const JUG_W = 7;
/** Lip and neck (jug-local, gold shades): the lip lit at its left end, the neck darker under it. */
const NECK: readonly { readonly x: number; readonly y: number; readonly shade: number }[] = [
  { x: 2, y: 0, shade: 4 },
  { x: 3, y: 0, shade: 3 },
  { x: 4, y: 0, shade: 2 },
  { x: 2, y: 1, shade: 1 },
  { x: 3, y: 1, shade: 1 },
  { x: 4, y: 1, shade: 0 },
  { x: 2, y: 2, shade: 2 },
  { x: 3, y: 2, shade: 1 },
  { x: 4, y: 2, shade: 0 },
];
/** The front jug's handle (jug-local, its right side); the back jug's is its mirror. */
// 1 px out from the neck, then down to the shoulder (art-director M2-29 B1: a 1-px diagonal start was lost).
const HANDLE: readonly { readonly x: number; readonly y: number }[] = [
  { x: 5, y: 1 },
  { x: 6, y: 1 },
  { x: 6, y: 2 },
  { x: 6, y: 3 },
];
const JUG_INK: PropLegend = { H: ['gold', 3], L: ['gold', 2], m: ['gold', 1], d: ['gold', 0] };
/** The jugs' swing (px) per walk frame: back and front swing opposite. */
const SWING = [0, 1, 1, 0, -1, -1];
/** Rows: the pole, then the jugs' tops (a 2-px cord between). */
const POLE_Y = 11;
const JUG_Y = 14;
/** The jugs' left edges (body-local) at rest. */
const BACK_X = -6;
const FRONT_X = 17;

const swing = (anim: string, frame: number): number => (anim === 'walk' ? (SWING[frame] ?? 0) : 0);

const HANCHAR: Traveller = {
  id: 'hanchar',
  outfit: HANCHAR_OUTFIT,
  head: HEAD,
  headAt: HEAD_AT,
  dress: 'shirt',
  back: (f) => [{ mask: JUG, legend: JUG_INK, x: BACK_X + swing(f.anim, f.frame), y: JUG_Y + f.top }],
  front: (f) => [{ mask: JUG, legend: JUG_INK, x: FRONT_X - swing(f.anim, f.frame), y: JUG_Y + f.top }],
  thin: (f) => {
    const s = swing(f.anim, f.frame);
    const t = f.top;
    const back = BACK_X + s;
    const front = FRONT_X - s;
    // The yoke, and a cord from it to each jug's lip (the middle column, 3).
    return [
      ...thinLine({ x: -6, y: POLE_Y + t }, { x: 24, y: POLE_Y - 1 + t }, 'wood', 2),
      ...thinLine({ x: -3, y: POLE_Y + 1 + t }, { x: back + 3, y: JUG_Y - 1 + t }, 'wood', 1),
      ...thinLine({ x: 20, y: POLE_Y + t }, { x: front + 3, y: JUG_Y - 1 + t }, 'wood', 1),
      ...[back, front].flatMap((x0) =>
        NECK.map((n) => ({ x: x0 + n.x, y: JUG_Y + n.y + t, ramp: 'gold' as const, shade: n.shade })),
      ),
      // Handles on the outer sides, lighter than the outline px of the hole inside the loop; the back one on the lit
      // side a step lighter (both jugs share one mask, lit top-left).
      ...HANDLE.map((h) => ({ x: back + JUG_W - 1 - h.x, y: JUG_Y + h.y + t, ramp: 'gold' as const, shade: 3 })),
      ...HANDLE.map((h) => ({ x: front + h.x, y: JUG_Y + h.y + t, ramp: 'gold' as const, shade: 2 })),
      { x: HEAD_AT.x + NOSE.x, y: HEAD_AT.y + NOSE.y + t, ramp: 'skin', shade: NOSE.shade },
    ];
  },
  shadow: [-6, 24],
};

export default travellerGenerator(HANCHAR);
