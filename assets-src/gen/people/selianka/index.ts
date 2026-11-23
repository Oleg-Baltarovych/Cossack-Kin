// Селянка — peasant woman, 16×24, facing right (plan ART-06 spike, ART-BIBLE §2, §7). Paper-doll masks
// (assets-src/gen/lib/doll.ts): хустка tied at the nape, вишита сорочка, крайка belt, плахта over the shirt hem,
// red чобітки. Variants are palette swaps of the same masks. idle 4 frames @6 fps (kerchief tail and hand drift),
// walk 6 frames @10 fps (feet and arm from tables, body rises 1 px on the passing frames, hem trails at contact).
// M2-17: work, talk, sit and cheer poses from the shared choreography (people/work.ts); the canvas is padded to 32 px
// so tools and props fit beside the body (the pivot column is unchanged).
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp, PEOPLE_SELECTIVE } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import {
  isWorkAnim,
  paintArm,
  paintInks,
  workPose,
  WORK_FRAMES,
  type BodyGeom,
  type ToolInks,
  type WorkPose,
} from '../work.ts';

export const WOMAN_W = 16;
/** Margin each side of the 16-px body (room for tools and props); the canvas is 32 px, the pivot stays at x 8 + PAD. */
const PAD = 8;
const W = WOMAN_W + 2 * PAD;
export const WOMAN_H = 24;
const H = WOMAN_H;
/** Ground row (soles); the pivot is the bottom edge of this row. */
export const SELIANKA_GROUND = 23;

// Printed-cloth dots (accent) so a gold хустка never reads as blond hair; a darker kerchief edge over the forehead.
// The kerchief's edge over the forehead is its deepest shade (G): a hard band between cloth and face, so the
// хустка never reads as hair (art-director M2-17).
const HEAD: Mask = ['..CCcc..', '.CCcAcg.', 'gCcAGGGG', 'gcSSsss.', 'gcsjsjs.', 'gcssssS.', '.gzsssz.', '...zz...'];
const HEAD_AT = { x: 4, y: 1 } as const;

/** The knot at the nape (lit) and the kerchief ends: hanging (idle), lifted and trailing (walk). */
const TAIL: readonly Mask[] = [
  ['.Cg', '.gG', '.g.', '.G.'],
  ['.Cg', 'gG.', 'G..', '...'],
];
const TAIL_AT = { x: 2, y: 6 } as const;

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

/**
 * Seated (stool, potter's wheel, the fire at night): the плахта over the thighs, falling from the knees to the
 * embroidered hem over the shins, the чобітки under it.
 */
const SIT: Mask = [
  '.PpaPpaqqvvvv.',
  'PPpaPpaqqqqqqv',
  '.........Ppaqq',
  '.........Ppaqq',
  '.........WAwAv',
  '..........bbbD',
];
const SIT_AT = { x: 2, y: 18 } as const;
checkMask(SIT, 'selianka SIT');

/** The woman's joints for the shared choreography. */
export const WOMAN_GEOM: BodyGeom = {
  ground: SELIANKA_GROUND,
  cx: 8,
  near: { x: 11, y: 10 },
  far: { x: 5, y: 10 },
  reach: 4,
  sitDrop: 4,
  shadow: [3, 13],
};
/** Tools in ramps every woman's outfit has: wood (hair) for handles, plaster as steel, skin tones for wheat, wax, clay. */
const WOMAN_TOOLS: ToolInks = {
  wood: 'wood',
  woodTop: 3,
  metal: { ramp: 'plaster', shades: [0, 1, 3] },
  honey: { ramp: 'skin', shades: [3, 4] },
  clay: { ramp: 'skin', shades: [0, 1, 3] },
  hot: { ramp: 'crimson', shade: 5 },
};

// Outfits: crimson хустка and plakhta stripes on a blue плахта; a second with a green plakhta and a gold kerchief;
// c: white хустка, crimson плахта with gold stripes, green крайка; d: indigo хустка, dark brown плахта with crimson
// stripes, darker skin.
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
  c: {
    ...WOMAN_BASE,
    // A grey-lavender хустка under the white shirt: head and сорочка separate, and it is not the brightest thing
    // at night (art-director M2-17).
    hat: { ramp: 'plaster', tones: [1, 2, 3, 4] },
    lower: { ramp: 'crimson', tones: [1, 2, 3, 4] },
    accent: { ramp: 'gold', tones: [2, 3, 3, 4] },
    belt: { ramp: 'grass', tones: [1, 2, 2, 3] },
  },
  d: {
    ...WOMAN_BASE,
    skin: { ramp: 'skin', tones: [0, 1, 3, 4] },
    hat: { ramp: 'cloth', tones: [1, 2, 3, 3] },
    lower: { ramp: 'earth', tones: [0, 1, 2, 3] },
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

/**
 * Embroidered collar under the chin for the white-kerchief outfit (c): a red line (the boots slot — every woman's
 * чобітки are crimson) separating the хустка from the сорочка. Rides with the head.
 */
const COLLAR: Mask = ['BbBbB'];
checkMask(COLLAR, 'selianka COLLAR');
const collarOf = (outfit: Outfit): Stamp[] =>
  outfit === SELIANKA_OUTFITS['c'] ? [{ mask: COLLAR, x: 5, y: TORSO_AT.y }] : [];

/** A work / talk / sit / cheer frame of the woman: lower body by kind, upper body dropped, leaned and lifted. */
function workStamps(p: WorkPose, outfit: Outfit): Stamp[] {
  const b = p.drop;
  const top = p.drop - p.lift;
  const lx = p.lean;
  const tail = TAIL[0] ?? [];
  const lower: Stamp[] =
    p.lower === 'sit'
      ? [{ mask: SIT, x: SIT_AT.x, y: SIT_AT.y }]
      : [
          { mask: FEET[p.lower === 'stance' ? 2 : 0] ?? [], x: FEET_AT.x, y: FEET_AT.y },
          { mask: SKIRT.slice(4), x: SKIRT_AT.x, y: SKIRT_AT.y + 4 },
          { mask: HEM, x: HEM_AT.x, y: HEM_AT.y },
          // A hip shift keeps the unshifted skirt under it, so no gap opens at the back.
          { mask: SKIRT.slice(0, 5), x: SKIRT_AT.x, y: SKIRT_AT.y + b },
          { mask: SKIRT.slice(0, 5), x: SKIRT_AT.x + p.hip, y: SKIRT_AT.y + b },
        ];
  return [
    { mask: tail, x: TAIL_AT.x + lx, y: TAIL_AT.y + top },
    ...lower,
    { mask: TORSO.slice(3), x: TORSO_AT.x, y: TORSO_AT.y + 3 + b },
    { mask: TORSO.slice(3), x: TORSO_AT.x + p.hip, y: TORSO_AT.y + 3 + b },
    { mask: TORSO.slice(0, 4), x: TORSO_AT.x + lx, y: TORSO_AT.y + top },
    ...collarOf(outfit).map((st) => ({ ...st, x: st.x + lx, y: st.y + top })),
    { mask: HEAD, x: HEAD_AT.x + lx, y: HEAD_AT.y + top },
  ];
}

function paintWork(plot: Plot, tools: Plot, grip: Plot, outfit: Outfit, p: WorkPose): void {
  const top = p.drop - p.lift;
  paintInks(plot, p.props, PAD);
  if (p.far) paintArm(plot, outfit, { x: WOMAN_GEOM.far.x + p.lean, y: WOMAN_GEOM.far.y + top }, p.far, true, PAD);
  paintDoll(
    plot,
    outfit,
    workStamps(p, outfit).map((st) => ({ ...st, x: st.x + PAD })),
  );
  paintInks(plot, p.propsFront, PAD);
  if (p.near) {
    const s = { x: WOMAN_GEOM.near.x + p.lean, y: WOMAN_GEOM.near.y + top };
    paintArm(plot, outfit, s, p.near, false, PAD, grip);
  } else paintDoll(plot, outfit, [{ mask: ARM[0] ?? [], x: ARM_AT.x + p.lean + PAD, y: ARM_AT.y + top }]);
  paintInks(tools, p.tools, PAD);
}

const selianka: SpriteGenerator = {
  atlas: 'people',
  id: 'selianka',
  size: { w: W, h: H },
  frames: { idle: IDLE.length, walk: WALK.length, ...WORK_FRAMES },
  variants: Object.keys(SELIANKA_OUTFITS),
  layers: ['shadow'],
  anchor: { x: 0.5, y: (SELIANKA_GROUND + 1) / H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const outfit = SELIANKA_OUTFITS[variant ?? 'a'];
    if (!outfit) throw new Error(`selianka: no outfit ${String(variant)}`);
    const plot = new Plot();
    const tools = new Plot();
    const grip = new Plot();
    let span: readonly [number, number] = WOMAN_GEOM.shadow;
    if (isWorkAnim(anim)) {
      const p = workPose(anim, frame, WOMAN_GEOM, WOMAN_TOOLS, 'woman');
      paintWork(plot, tools, grip, outfit, p);
      span = p.shadow;
    } else {
      const pose = (anim === 'walk' ? WALK : IDLE)[frame];
      if (!pose) throw new Error(`selianka: no pose for ${anim} ${String(frame)}`);
      const tail = TAIL[pose.tail] ?? TAIL[0] ?? [];
      const stamps = womanStamps(pose, HEAD, [{ mask: tail, x: TAIL_AT.x, y: TAIL_AT.y }], collarOf(outfit));
      paintDoll(
        plot,
        outfit,
        stamps.map((st) => ({ ...st, x: st.x + PAD })),
      );
    }
    // Tools over the body without an outline (1 px stays 1 px); the gripping hand is painted again over its tool.
    compose(buffer, [plot.part(1, 1), tools.part(1, 2), grip.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
      selective: PEOPLE_SELECTIVE,
    });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: span[0] + PAD, x1: span[1] + PAD, groundY: SELIANKA_GROUND, height: 3 });
  },
};

export default selianka;
