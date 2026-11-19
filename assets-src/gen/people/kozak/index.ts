// Козак — Zaporozhian Cossack, 18×28, facing right (plan ART-06 spike, ART-BIBLE §2, §7). Paper-doll masks
// (assets-src/gen/lib/doll.ts): шапка with a crimson шлик hanging to the back, long grey вуса, white сорочка, a wide
// crimson пояс whose ends hang behind, baggy blue шаровари, red чоботи. Variants are palette swaps (sharovary and
// шлик colour, skin, moustache). idle 4 frames @6 fps (breath: shoulders 1 px, шлик and belt ends drift), walk
// 6 frames @10 fps (leg masks per frame, arm swing, body rises 1 px on the passing frames, шлик and belt ends trail).
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const MAN_W = 18;
export const MAN_H = 28;
const W = MAN_W;
const H = MAN_H;
/** Ground row (soles); the pivot is the bottom edge of this row. */
export const KOZAK_GROUND = 27;

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
  '..SSsz..',
  '.SSsssz.',
  'zSssssz.',
  'zSSsssz.',
  'zsGssGs.',
  'zssssSs.',
  '.zsHhhh.',
  '.zHsssh.',
];
/**
 * Оселедець (art-director ART-15): rooted on top of the crown, a 1-px lock laid across the scalp over the skin to
 * above the left ear, only the last 2 px hanging free behind it, ending at eye level — bare skin stays between the
 * lock and the nape (that gap is what reads as a forelock, not long hair). 0 hangs, 1 the free tail flicked back
 * (walk); the root never moves.
 */
const OSELEDETS: readonly Mask[] = [
  ['.....hH', '.....h.', '....h..', '...h...', '..h....', '.h.....', '.j.....'],
  ['.....hH', '.....h.', '....h..', '...h...', '..h....', 'h......', 'j......'],
];
const OSELEDETS_AT = { x: 4, y: 1 } as const;

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

for (const [name, m] of Object.entries({ HEAD, HEAD_BARE, TORSO })) checkMask(m, `kozak ${name}`);
for (const set of [SHLYK, OSELEDETS, BELT_ENDS, LEGS, ARM]) {
  set.forEach((m, i) => {
    checkMask(m, `kozak #${String(i)}`);
  });
}

function stamps(pose: Pose, head: 'hat' | 'bare'): Stamp[] {
  const pick = <T>(list: readonly T[], i: number): T => {
    const v = list[i] ?? list[0];
    if (v === undefined) throw new Error('empty pose table');
    return v;
  };
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
    ...(head === 'hat'
      ? [
          { mask: pick(SHLYK, pose.shlyk), x: SHLYK_AT.x, y: SHLYK_AT.y + top },
          { mask: HEAD, x: HEAD_AT.x, y: HEAD_AT.y + top },
        ]
      : [
          { mask: HEAD_BARE, x: HEAD_AT.x, y: HEAD_AT.y + top },
          {
            mask: pick(OSELEDETS, pose.shlyk),
            x: OSELEDETS_AT.x,
            y: OSELEDETS_AT.y + top,
          },
        ]),
    { mask: pick(ARM, pose.arm), x: ARM_AT.x, y: ARM_AT.y + top },
  ];
}

const kozak: SpriteGenerator = {
  atlas: 'people',
  id: 'kozak',
  size: { w: W, h: H },
  frames: { idle: IDLE.length, walk: WALK.length },
  variants: Object.keys(KOZAK_OUTFITS),
  layers: ['shadow'],
  anchor: { x: 0.5, y: (KOZAK_GROUND + 1) / H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const outfit = KOZAK_OUTFITS[variant ?? 'a'];
    const pose = (anim === 'walk' ? WALK : IDLE)[frame];
    if (!outfit || !pose) throw new Error(`kozak: no outfit/pose for ${String(variant)} ${anim} ${String(frame)}`);
    const plot = new Plot();
    paintDoll(plot, outfit, stamps(pose, HEADS[variant ?? 'a'] ?? 'hat'));
    compose(buffer, [plot.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'lighter' },
    });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: 4, x1: 15, groundY: KOZAK_GROUND, height: 3 });
  },
};

export default kozak;
