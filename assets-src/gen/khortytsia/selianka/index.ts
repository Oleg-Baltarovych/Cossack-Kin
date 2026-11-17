// Селянка — peasant woman, 16×24, facing right (plan ART-06 spike, ART-BIBLE §2, §7). Paper-doll masks
// (assets-src/gen/lib/doll.ts): хустка tied at the nape, вишита сорочка, крайка belt, плахта over the shirt hem,
// red чобітки. Variants are palette swaps of the same masks. idle 4 frames @6 fps (kerchief tail and hand drift),
// walk 6 frames @10 fps (feet and arm from tables, body rises 1 px on the passing frames, hem trails at contact).
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const WOMAN_W = 16;
const W = WOMAN_W;
export const WOMAN_H = 24;
const H = WOMAN_H;
/** Ground row (soles); the pivot is the bottom edge of this row. */
export const SELIANKA_GROUND = 23;

// Printed-cloth dots (accent) so a gold хустка never reads as blond hair; a darker kerchief edge over the forehead.
const HEAD: Mask = ['..CCcc..', '.CCcAcg.', 'gCcAgggg', 'gcSSsss.', 'gcsjsjs.', 'gcssssS.', '.gzsssz.', '...zz...'];
const HEAD_AT = { x: 4, y: 1 } as const;

/** Kerchief ends tied at the nape: hang (idle), lifted and trailing (walk). */
const TAIL: readonly Mask[] = [
  ['g.', 'gg', 'G.'],
  ['gg', '.G', '..'],
];
const TAIL_AT = { x: 3, y: 6 } as const;

/** Сорочка (bust toward the front, right) and крайка belt. */
const TORSO: Mask = ['.WWwwwv..', 'WWwwwwvv.', 'WwAwwwvvv', 'Wwwwwwvvv', 'RRrrrrrtT'];
export const TORSO_AT = { x: 3, y: 9 } as const;

/** Плахта: blue wrap with crimson stripes, open at the front edge over the white shirt; the embroidered hem. */
const SKIRT: Mask = [
  '.PpaPpaqqv.',
  '.PpaPpaqqvv',
  'PPpaPpaqqvv',
  'PppaPpaqqvv',
  'PppaPpaqqqv',
  'PppaPpaqqqv',
  'PppaPpaqqqv',
];
const SKIRT_AT = { x: 2, y: 14 } as const;
const HEM: Mask = ['.WwAwAwAwv.'];
const HEM_AT = { x: 2, y: 21 } as const;

/** Near (right) arm: sleeve shaded on the inner edge so it reads over the shirt; hand. 0 hang, 1 fwd, 2 back. */
const ARM: readonly Mask[] = [
  ['vw.', 'vw.', 'va.', 'vw.', '.Sz'],
  ['vw..', '.vw.', '.va.', '..vw', '..Sz'],
  ['.vw', 'vw.', 'va.', 'vw.', 'Sz.'],
];
const ARM_AT = { x: 10, y: 10 } as const;

/** Чобітки below the hem (2 rows, toes to the right). 0 stand, 1 stride, 2 recoil, 3 passing. */
const FEET: readonly Mask[] = [
  ['..bd..bd..', '..bbD.bbD.'],
  ['bd......bd', 'bbD.....bbD'],
  ['..bd...bd.', '..bbD..bbD'],
  ['....bdbd..', '....bbD...'],
];
const FEET_AT = { x: 2, y: SELIANKA_GROUND - 1 } as const;

export interface Pose {
  readonly bob: number;
  /** Extra lift of the shoulders and head only (idle breath, ART-15). */
  readonly breath: number;
  readonly feet: number;
  readonly arm: number;
  readonly tail: number;
  /** Lower skirt + hem shift (px, negative = trails back to the left). */
  readonly hem: number;
}
export const IDLE: readonly Pose[] = [
  { bob: 0, breath: 0, feet: 0, arm: 0, tail: 0, hem: 0 },
  { bob: 0, breath: -1, feet: 0, arm: 0, tail: 0, hem: 0 },
  { bob: 0, breath: -1, feet: 0, arm: 0, tail: 1, hem: 0 },
  { bob: 0, breath: 0, feet: 0, arm: 0, tail: 1, hem: 0 },
];
export const WALK: readonly Pose[] = [
  { bob: 0, breath: 0, feet: 1, arm: 1, tail: 1, hem: -1 },
  { bob: 0, breath: 0, feet: 2, arm: 0, tail: 1, hem: 0 },
  { bob: -1, breath: 0, feet: 3, arm: 2, tail: 1, hem: 0 },
  { bob: 0, breath: 0, feet: 1, arm: 2, tail: 1, hem: -1 },
  { bob: 0, breath: 0, feet: 2, arm: 0, tail: 1, hem: 0 },
  { bob: -1, breath: 0, feet: 3, arm: 1, tail: 1, hem: 0 },
];

// Outfits: crimson хустка and plakhta stripes on a blue плахта; a second with a green plakhta and a gold kerchief.
export const WOMAN_BASE: Omit<Outfit, 'hat' | 'lower' | 'accent'> = {
  skin: { ramp: 'skin', tones: [1, 2, 4, 5] },
  hair: { ramp: 'wood', tones: [0, 1, 2, 3] },
  shirt: { ramp: 'plaster', tones: [2, 3, 5, 6] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'crimson', tones: [0, 1, 2, 3] },
};
export const SELIANKA_OUTFITS: Readonly<Record<string, Outfit>> = {
  a: {
    ...WOMAN_BASE,
    hat: { ramp: 'crimson', tones: [1, 2, 3, 4] },
    lower: { ramp: 'cloth', tones: [0, 1, 2, 3] },
    accent: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  },
  b: {
    ...WOMAN_BASE,
    hat: { ramp: 'gold', tones: [1, 2, 3, 4] },
    lower: { ramp: 'grass', tones: [1, 2, 3, 4] },
    accent: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  },
};

for (const [name, m] of Object.entries({ HEAD, TORSO, SKIRT, HEM })) checkMask(m, `selianka ${name}`);
for (const set of [TAIL, ARM, FEET])
  set.forEach((m, i) => {
    checkMask(m, `selianka #${String(i)}`);
  });

/**
 * A woman's doll (shared with the girl, ART-15): `back` (kerchief tail, ribbons, braid) goes behind everything,
 * `head` on top of the shirt; the near arm last.
 */
export function womanStamps(pose: Pose, head: Mask, back: readonly Stamp[], front: readonly Stamp[] = []): Stamp[] {
  const pick = <T>(list: readonly T[], i: number): T => {
    const v = list[i] ?? list[0];
    if (v === undefined) throw new Error('empty pose table');
    return v;
  };
  const b = pose.bob;
  const top = b + pose.breath;
  // The skirt's lower 3 rows sway with the hem; the upper rows ride with the body. Both cover the same rows when
  // the body rises, so no gap opens between them; the feet stay planted. Idle breath lifts the shirt, head and arm
  // only; the shirt's last row stays over the belt, so no gap opens there either. `back` and `front` (over the
  // shirt) ride with the head.
  return [
    ...back.map((st) => ({ ...st, y: st.y + top })),
    { mask: pick(FEET, pose.feet), x: FEET_AT.x, y: FEET_AT.y },
    { mask: SKIRT.slice(4), x: SKIRT_AT.x + pose.hem, y: SKIRT_AT.y + 4 },
    { mask: HEM, x: HEM_AT.x + pose.hem, y: HEM_AT.y },
    { mask: SKIRT.slice(0, 5), x: SKIRT_AT.x, y: SKIRT_AT.y + b },
    { mask: TORSO.slice(3), x: TORSO_AT.x, y: TORSO_AT.y + 3 + b },
    { mask: TORSO.slice(0, 4), x: TORSO_AT.x, y: TORSO_AT.y + top },
    ...front.map((st) => ({ ...st, y: st.y + top })),
    { mask: head, x: HEAD_AT.x, y: HEAD_AT.y + top },
    { mask: pick(ARM, pose.arm), x: ARM_AT.x, y: ARM_AT.y + top },
  ];
}

const selianka: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'selianka',
  size: { w: W, h: H },
  frames: { idle: IDLE.length, walk: WALK.length },
  variants: Object.keys(SELIANKA_OUTFITS),
  layers: ['shadow'],
  anchor: { x: 0.5, y: (SELIANKA_GROUND + 1) / H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const outfit = SELIANKA_OUTFITS[variant ?? 'a'];
    const pose = (anim === 'walk' ? WALK : IDLE)[frame];
    if (!outfit || !pose) throw new Error(`selianka: no outfit/pose for ${String(variant)} ${anim} ${String(frame)}`);
    const plot = new Plot();
    const tail = TAIL[pose.tail] ?? TAIL[0] ?? [];
    paintDoll(plot, outfit, womanStamps(pose, HEAD, [{ mask: tail, x: TAIL_AT.x, y: TAIL_AT.y }]));
    compose(buffer, [plot.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'lighter' },
    });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: 3, x1: 13, groundY: SELIANKA_GROUND, height: 3 });
  },
};

export default selianka;
