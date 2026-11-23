// Козак — Zaporozhian Cossack, 18×28, facing right (plan ART-06 spike, ART-BIBLE §2, §7). Paper-doll masks
// (assets-src/gen/lib/doll.ts): шапка with a crimson шлик hanging to the back, long grey вуса, white сорочка, a wide
// crimson пояс whose ends hang behind, baggy blue шаровари, red чоботи. Variants are palette swaps (sharovary and
// шлик colour, skin, moustache). idle 4 frames @6 fps (breath: shoulders 1 px, шлик and belt ends drift), walk
// 6 frames @10 fps (leg masks per frame, arm swing, body rises 1 px on the passing frames, шлик and belt ends trail).
// M2-19: the Sich's set from people/cossack.ts — `drill` (the musket drill), `sit-smoke` (on a log by the fire with a
// люлька), `cheer` (arms up); the canvas is padded to 32 px for the musket (the pivot column is unchanged).
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp, PEOPLE_SELECTIVE } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { paintArm, paintInks, type BodyGeom } from '../work.ts';
import { cossackPose, COSSACK_FRAMES, isCossackAction, type CossackInks, type CossackPose } from '../cossack.ts';

export const MAN_W = 18;
export const MAN_H = 28;
const H = MAN_H;
/** Ground row (soles); the pivot is the bottom edge of this row. */
export const KOZAK_GROUND = 27;
/** Margin each side of the 18-px body (room for the musket); the canvas is 32 px, the pivot stays at x 9 + PAD. */
export const KOZAK_PAD = 7;
const W = MAN_W + 2 * KOZAK_PAD;

/** Fur шапка (hat), face 3/4 right, long moustache hanging past the chin (hair). The шлик is its own stamp. */
// Near-black sheepskin crown with a straight lit brim above the brows (reads as fur, not hair); a 1-px moustache
// under the nose with drooping ends, skin chin between (art-director ART-06: a full grey block read as a beard).
const HEAD: Mask = ['.CCCccg.', 'CcccCccg', 'gCCCCCcg', 'zSSsssz.', 'zsGssGs.', 'zssssSss', '.zsHhhh.', '.zHsssh.'];
export const HEAD_AT = { x: 6, y: 2 } as const;

/** Шлик: crimson only on the crown's top row and the tail hanging to the back (left); the fur shows below. 0 hang, 1 lifted (walk / idle drift). */
const SHLYK: readonly Mask[] = [
  ['...AAaa', '..x....', '.xX....', '.X.....', '.X.....'],
  ['...AAaa', '.xx....', 'xX.....', 'X......', '.......'],
];
const SHLYK_AT = { x: 4, y: 1 } as const;

/**
 * Bare shaved head (ART-15, the young Cossack): a round skull lit top-left in place of the шапка, the same face and
 * moustache rows. The оселедець is its own stamp, drawn over the crown.
 */
const HEAD_BARE: Mask = [
  '..zzzz..',
  '.zSsssz.',
  'zSssssz.',
  'zSSsssz.',
  'zsGssGs.',
  'zssssSs.',
  '.zsHhhh.',
  '.zHsssh.',
];
/**
 * Оселедець (art-director ART-15, M2-19 review): rooted on the crown, a 1-px lock laid back along the top of the
 * shaved skull (its first row a 1-px stubble shade, no hair) and falling over the left ear to eye level — bare skin
 * everywhere else, so it reads as a forelock, not a head of hair. 0 hangs, 1 the free end flicked back (walk); the
 * root never moves.
 */
const OSELEDETS: readonly Mask[] = [
  ['..hhhH.', '.h.....', '.h.....', '.h.....', '.j.....'],
  ['..hhhH.', 'h......', 'h......', '.j.....', '.......'],
];
const OSELEDETS_AT = { x: 5, y: 1 } as const;

/** Head style per variant: a/b шапка with шлик, c bare head with оселедець. */
const HEADS: Readonly<Record<string, 'hat' | 'bare'>> = { a: 'hat', b: 'hat', c: 'bare' };

/** Сорочка with wide shoulders (shaded toward the back-right) and the пояс (belt). */
const TORSO: Mask = ['.WWwwwv..', 'WWwwwwwv.', 'Wwwwwwwvv', 'Wwwwwwwvv', 'Wwwwwwvvv', 'RRrrrrrtT', 'Rrrrrrrtt'];
export const TORSO_AT = { x: 4, y: 10 } as const;

/** Belt ends hanging behind the left hip. 0 hang, 1 trailing. */
const BELT_ENDS: readonly Mask[] = [
  ['r', 'rt', 'tT', 'T.'],
  ['rr', 'tT', 'T.', '..'],
];
const BELT_ENDS_AT = { x: 3, y: 16 } as const;

/** Шаровари + чоботи from the hip row down to the soles (12 rows). 0 stand, 1 stride, 2 recoil, 3 passing. */
export const LEGS: readonly Mask[] = [
  [
    '.PPppppqq.',
    'PPpppppqqq',
    'PPpppppqqq',
    'Ppppppqqqq',
    'Pppppq.pqq',
    'Ppppq..ppq',
    '.Ppq...pq.',
    '.Ppq...pq.',
    '.bBd...bbd',
    '.bbd...bbd',
    '.bbd...bbd',
    '.bbbD..bbbD',
  ],
  [
    '.PPppppqq..',
    'PPpppppqqq.',
    'PPpppppqqq.',
    'Pppp..ppqqq',
    'Ppq....ppqq',
    'Pq......pqq',
    'Pq......pq.',
    'Pq.......pq',
    'bd......bbd',
    'bd......bbd',
    'bd......bbd',
    'bbD.....bbbD',
  ],
  [
    '.PPppppqq.',
    'PPpppppqqq',
    'PPpppppqqq',
    'Ppppp.pqqq',
    'Pppq..pqq.',
    'Ppq...ppq.',
    '.Pq...pq..',
    '.Pq...pq..',
    '.bd...bbd.',
    '.bd...bbd.',
    '.bd...bbd.',
    '.bbD..bbbD',
  ],
  [
    '.PPppppqq.',
    'PPpppppqqq',
    'PPpppppqqq',
    'Ppppppqqqq',
    '.Ppppppqq.',
    '..Ppppq...',
    '..Pqppq...',
    '..Pqppq...',
    '....bbd...',
    '..bdbbd...',
    '..bdbbd...',
    '....bbbD..',
  ],
];
export const LEGS_AT = { x: 4, y: KOZAK_GROUND - 11 } as const;

/**
 * Seated on a log by the fire (M2-19): the baggy шаровари over the thighs, the near shin down to the boot, the far one
 * a shade darker behind it.
 */
const SIT: Mask = [
  '.PPppppppqqq...',
  '.PppppppppppqQ.',
  '..QqqqqqqqqqQQ.',
  '........qPpqq..',
  '........qPpqq..',
  '........dBbbd..',
  '.......dBBbbbD.',
];
const SIT_AT = { x: 3, y: 21 } as const;

/** Near (right) arm: wide sleeve, inner edge shaded, hand. 0 hang, 1 forward, 2 back. */
export const ARM: readonly Mask[] = [
  ['vw.', 'vww', 'vww', 'vww', '.vw', '.Sz'],
  ['vw..', '.vww', '.vww', '..vw', '..vw', '..Sz'],
  ['.vw', 'vww', 'vww', 'vw.', 'vw.', 'Sz.'],
];
export const ARM_AT = { x: 11, y: 11 } as const;

export interface Pose {
  readonly bob: number;
  /** Extra lift of the shoulders and head only (idle breath). */
  readonly breath: number;
  readonly legs: number;
  readonly arm: number;
  readonly shlyk: number;
  readonly belt: number;
}
export const IDLE: readonly Pose[] = [
  { bob: 0, breath: 0, legs: 0, arm: 0, shlyk: 0, belt: 0 },
  { bob: 0, breath: -1, legs: 0, arm: 0, shlyk: 0, belt: 0 },
  { bob: 0, breath: -1, legs: 0, arm: 0, shlyk: 1, belt: 0 },
  { bob: 0, breath: 0, legs: 0, arm: 0, shlyk: 1, belt: 0 },
];
export const WALK: readonly Pose[] = [
  { bob: 0, breath: 0, legs: 1, arm: 1, shlyk: 1, belt: 1 },
  { bob: 0, breath: 0, legs: 2, arm: 0, shlyk: 1, belt: 0 },
  { bob: -1, breath: 0, legs: 3, arm: 2, shlyk: 0, belt: 1 },
  { bob: 0, breath: 0, legs: 1, arm: 2, shlyk: 1, belt: 1 },
  { bob: 0, breath: 0, legs: 2, arm: 0, shlyk: 1, belt: 0 },
  { bob: -1, breath: 0, legs: 3, arm: 1, shlyk: 0, belt: 1 },
];

/** The man's joints (body-local) for the shared choreography (people/work.ts, people/cossack.ts). */
export const KOZAK_GEOM: BodyGeom = {
  ground: KOZAK_GROUND,
  cx: 9,
  near: { x: 12, y: 11 },
  far: { x: 6, y: 11 },
  reach: 5,
  sitDrop: 5,
  shadow: [4, 15],
};

const BASE: Omit<Outfit, 'lower' | 'accent'> = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'stone', tones: [1, 2, 3, 4] },
  shirt: { ramp: 'plaster', tones: [2, 3, 5, 6] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'crimson', tones: [0, 1, 2, 3] },
  // Near-black sheepskin шапка (earth 0–2): one step above its outline, darker than any skin or hair tone.
  hat: { ramp: 'earth', tones: [0, 0, 1, 2] },
};
/** a: blue sharovary, crimson шлик; b: crimson sharovary with an ochre sash, blue шлик, darker skin (sun-burnt). */
export const KOZAK_OUTFITS: Readonly<Record<string, Outfit>> = {
  a: {
    ...BASE,
    lower: { ramp: 'cloth', tones: [0, 1, 2, 3] },
    accent: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  },
  b: {
    ...BASE,
    skin: { ramp: 'skin', tones: [0, 1, 2, 3] },
    lower: { ramp: 'crimson', tones: [1, 2, 3, 4] },
    accent: { ramp: 'cloth', tones: [0, 1, 2, 3] },
    boots: { ramp: 'earth', tones: [1, 2, 3, 4] },
    // An ochre sash: crimson on crimson sharovary loses the belt (a required Cossack mark), and a blue one over the
    // white shirt and red sharovary stacked into the Russian tricolour at phone size (art-director ART-19).
    belt: { ramp: 'gold', tones: [1, 2, 3, 3] },
  },
  /** c: the young Cossack (ART-15) — bare head with оселедець, dark moustache, the third (light) skin tone, green
   * sharovary under a crimson belt. */
  c: {
    ...BASE,
    skin: { ramp: 'skin', tones: [2, 3, 4, 5] },
    hair: { ramp: 'wood', tones: [0, 1, 1, 2] },
    lower: { ramp: 'grass', tones: [1, 2, 3, 4] },
    accent: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  },
};

/**
 * Tool inks every Cossack outfit can take without a 7th ramp (≤ 6 ramps a frame, ART-BIBLE §4): earth (the шапка's
 * ramp; the bare-headed c has 5 ramps) for the stock, the log and the pipe, plaster (every shirt) as steel and smoke,
 * crimson (belt or boots in every outfit) for the ember.
 */
export const KOZAK_INKS: CossackInks = {
  wood: { ramp: 'earth', shades: [0, 1, 2] },
  // Dark lavender-grey steel: the barrel must read against the white shirt it crosses.
  metal: { ramp: 'plaster', shades: [0, 1, 3] },
  smoke: { ramp: 'plaster', shades: [5, 6] },
  ember: { ramp: 'crimson', shade: 5 },
};

for (const [name, m] of Object.entries({ HEAD, HEAD_BARE, TORSO, SIT })) checkMask(m, `kozak ${name}`);
for (const set of [SHLYK, OSELEDETS, BELT_ENDS, LEGS, ARM]) {
  set.forEach((m, i) => {
    checkMask(m, `kozak #${String(i)}`);
  });
}

const pick = <T>(list: readonly T[], i: number): T => {
  const v = list[i] ?? list[0];
  if (v === undefined) throw new Error('empty pose table');
  return v;
};

/** The head stamps (шапка + шлик, or the bare head + оселедець) at `top` (upper-body offset) and `lean`. */
function headStamps(head: 'hat' | 'bare', drift: number, top: number, lean: number): Stamp[] {
  return head === 'hat'
    ? [
        { mask: pick(SHLYK, drift), x: SHLYK_AT.x + lean, y: SHLYK_AT.y + top },
        { mask: HEAD, x: HEAD_AT.x + lean, y: HEAD_AT.y + top },
      ]
    : [
        { mask: HEAD_BARE, x: HEAD_AT.x + lean, y: HEAD_AT.y + top },
        { mask: pick(OSELEDETS, drift), x: OSELEDETS_AT.x + lean, y: OSELEDETS_AT.y + top },
      ];
}

/** The idle / walk body (body-local, unpadded). */
export function kozakStamps(pose: Pose, head: 'hat' | 'bare'): Stamp[] {
  const b = pose.bob;
  const top = b + pose.breath;
  return [
    { mask: pick(BELT_ENDS, pose.belt), x: BELT_ENDS_AT.x, y: BELT_ENDS_AT.y + b },
    // Legs: the hip row rides with the body; the leg mask's first row sits under the belt, so a 1-px rise
    // never opens a gap.
    { mask: pick(LEGS, pose.legs), x: LEGS_AT.x, y: LEGS_AT.y },
    { mask: TORSO.slice(5), x: TORSO_AT.x, y: TORSO_AT.y + 5 + b },
    // The shirt's last row stays over the belt while the chest lifts (idle breath): no gap above the belt.
    { mask: TORSO.slice(4, 5), x: TORSO_AT.x, y: TORSO_AT.y + 4 + b },
    { mask: TORSO.slice(0, 5), x: TORSO_AT.x, y: TORSO_AT.y + top },
    ...headStamps(head, pose.shlyk, top, 0),
    { mask: pick(ARM, pose.arm), x: ARM_AT.x, y: ARM_AT.y + top },
  ];
}

/** An action frame's body without the near arm (body-local, unpadded): lower half by kind, upper half dropped / lifted. */
export function kozakActionStamps(p: CossackPose, head: 'hat' | 'bare'): Stamp[] {
  const b = p.drop;
  const top = p.drop - p.lift;
  const lower: Stamp[] =
    p.lower === 'sit'
      ? [{ mask: SIT, x: SIT_AT.x, y: SIT_AT.y }]
      : [{ mask: pick(LEGS, p.lower === 'stance' ? 2 : 0), x: LEGS_AT.x, y: LEGS_AT.y }];
  return [
    { mask: pick(BELT_ENDS, 0), x: BELT_ENDS_AT.x, y: BELT_ENDS_AT.y + b },
    ...(p.lower === 'sit' ? [] : lower),
    { mask: TORSO.slice(5), x: TORSO_AT.x, y: TORSO_AT.y + 5 + b },
    { mask: TORSO.slice(4, 5), x: TORSO_AT.x, y: TORSO_AT.y + 4 + b },
    ...(p.lower === 'sit' ? lower : []),
    { mask: TORSO.slice(0, 5), x: TORSO_AT.x + p.lean, y: TORSO_AT.y + top },
    ...headStamps(head, p.drift, top, p.lean),
  ];
}

/**
 * Paints a Cossack action frame (drill, pipe, cheer, the guards' watch / torch): props behind, the far arm, the body,
 * props in front, the near arm (gripping over its tool), tools on top; `pad` = the canvas margin.
 */
export function paintCossackAction(
  plot: Plot,
  tools: Plot,
  grip: Plot,
  outfit: Outfit,
  head: 'hat' | 'bare',
  p: CossackPose,
  pad: number,
  dy = 0,
): void {
  const g = KOZAK_GEOM;
  const top = p.drop - p.lift;
  const at = (q: { readonly x: number; readonly y: number }) => ({ x: q.x, y: q.y + dy });
  const shift = <T extends { readonly y: number }>(list: readonly T[]): T[] => list.map((i) => ({ ...i, y: i.y + dy }));
  paintInks(plot, shift(p.props), pad);
  if (p.far) paintArm(plot, outfit, at({ x: g.far.x + p.lean, y: g.far.y + top }), at(p.far), true, pad);
  paintDoll(
    plot,
    outfit,
    kozakActionStamps(p, head).map((st) => ({ ...st, x: st.x + pad, y: st.y + dy })),
  );
  paintInks(plot, shift(p.propsFront), pad);
  if (p.near) paintArm(plot, outfit, at({ x: g.near.x + p.lean, y: g.near.y + top }), at(p.near), false, pad, grip);
  else paintDoll(plot, outfit, [{ mask: pick(ARM, 0), x: ARM_AT.x + p.lean + pad, y: ARM_AT.y + top + dy }]);
  paintInks(tools, shift(p.tools), pad);
  paintInks(grip, shift(p.overGrip), pad);
  // Behind the body: only where neither the body nor a tool is.
  for (const i of shift(p.behind))
    if (!plot.has(i.x + pad, i.y) && !tools.has(i.x + pad, i.y)) tools.set(i.x + pad, i.y, i.ramp, i.shade);
}

const kozak: SpriteGenerator = {
  atlas: 'people',
  id: 'kozak',
  size: { w: W, h: H },
  frames: { idle: IDLE.length, walk: WALK.length, ...COSSACK_FRAMES },
  variants: Object.keys(KOZAK_OUTFITS),
  layers: ['shadow'],
  anchor: { x: 0.5, y: (KOZAK_GROUND + 1) / H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const outfit = KOZAK_OUTFITS[variant ?? 'a'];
    if (!outfit) throw new Error(`kozak: no outfit ${String(variant)}`);
    const head = HEADS[variant ?? 'a'] ?? 'hat';
    const plot = new Plot();
    const tools = new Plot();
    const grip = new Plot();
    let span: readonly [number, number] = KOZAK_GEOM.shadow;
    if (isCossackAction(anim)) {
      const p = cossackPose(anim, frame, KOZAK_GEOM, KOZAK_INKS);
      paintCossackAction(plot, tools, grip, outfit, head, p, KOZAK_PAD);
      span = p.shadow;
    } else {
      const pose = (anim === 'walk' ? WALK : IDLE)[frame];
      if (!pose) throw new Error(`kozak: no pose for ${anim} ${String(frame)}`);
      paintDoll(
        plot,
        outfit,
        kozakStamps(pose, head).map((st) => ({ ...st, x: st.x + KOZAK_PAD })),
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
    if (shadow)
      contactShadow(shadow, { x0: span[0] + KOZAK_PAD, x1: span[1] + KOZAK_PAD, groundY: KOZAK_GROUND, height: 3 });
  },
};

export default kozak;
