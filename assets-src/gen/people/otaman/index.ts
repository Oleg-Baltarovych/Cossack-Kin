// Отаман — the otaman of the Sich (plan M2-19, ART-BIBLE §2, §7): his own 20×30 body, a head taller and wider than the
// rank and file and a different silhouette — a tall fur шапка with a crimson velvet top falling back, long grey вуса,
// a crimson кунтуш to mid-shin over a blue жупан (its front and hem show), the вильоти (the kuntush's slit sleeves)
// hanging from the back shoulder, a gold sash, yellow сап'янці, and the булава (the mace of command, gold) always in
// his hand. The canvas is 32×36: the raised булава reaches above the hat. idle 4 @6 (breath, вильоти drift), walk
// 6 @10, `speak` 4 @6 (булава raised, pointed at the ranks, raised again, brought to the chest), `march` 6 @10 (the
// review step, the булава upright before the face). One outfit (`otaman.a`).
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp, PEOPLE_SELECTIVE } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { paintArm, paintInks, type Ink, type Pt } from '../work.ts';

export const OTAMAN_W = 20;
export const OTAMAN_H = 30;
/** Margin each side (the булава held forward) and rows above the hat (raised). */
const PAD = 6;
const TOP = 6;
const W = OTAMAN_W + 2 * PAD;
const H = OTAMAN_H + TOP;
/** Ground row (soles), body-local; the pivot is the bottom edge of this row. */
const GROUND = 29;
export const OTAMAN_GROUND = GROUND + TOP;

/**
 * The шапка (art-director M2-19 review): a squared band of black lambskin, 3 rows (hat slot = stone 0 with a 1-px
 * stone 1 highlight top-left), the crimson velvet top a soft bag falling to the back (accent), no point; the face 3/4
 * right; the moustache two grey strands drooping from the mouth corners past a shaved (skin) chin — not a beard.
 */
const HEAD: Mask = [
  '..xaAAa..',
  '.xxaaaAa.',
  'xxxaaaaa.',
  'xCccccccc',
  'xcccccccc',
  '.cccccccc',
  'zSSsssz..',
  'zsGssGs..',
  'zssssSss.',
  '.zHhhhhs.',
  '.hzsssh..',
  '.h.zsz.h.',
  '.j.....j.',
];
const HEAD_AT = { x: 6, y: 0 } as const;

/** Кунтуш (shirt slot) open over the жупан (lower slot), the gold sash (belt). */
const TORSO: Mask = [
  '...WWwwwv...',
  '..WWwwpwwv..',
  '.WWwwwpPwvv.',
  '.Wwwwwpqwvvv',
  '.Wwwwwpqwvvv',
  '.RRrrrrrrtT.',
  '.Wwwwwpqwvvv',
];
const TORSO_AT = { x: 4, y: 11 } as const;

/** The kuntush's skirt to mid-shin, flaring, the жупан's front edge down the middle; the hem row shaded. */
const SKIRT: Mask = [
  '.Wwwwwpqwvvv',
  'WWwwwwpqwwvv',
  'Wwwwwwpqwwvvv',
  'Wwwwwwpqwwvvv',
  'WWwwwwpqwwwvvv',
  'Wwwwwwppqwwvvv',
  'Wvwwwwppqwwvvv',
  '.vvvvvqqqvvvv.',
];
const SKIRT_AT = { x: 3, y: 18 } as const;

/** Вильоти: the slit sleeves hanging from the back shoulder. 0 hang, 1 drifting back. */
const VYLOTY: readonly Mask[] = [
  ['.v', 'vV', 'vv', 'vV', 'Vv', 'vV', 'vv', 'V.', 'v.'],
  ['.v', 'vV', 'vv', 'Vv', 'v.', 'vV', 'V.', 'v.', '..'],
];
const VYLOTY_AT = { x: 2, y: 12 } as const;

/** Сап'янці under the hem (rows 26–29): 0 stand, 1 stride, 2 recoil, 3 passing. */
const BOOTS: readonly Mask[] = [
  ['....bd..bd..', '....bd..bd..', '....bd..bbd.', '...bbd..bbbD'],
  ['...bd....bd.', '..bd.....bbd', '.bd......bbd', 'bbd......bbbD'],
  ['...bd...bd..', '...bd...bbd.', '..bd....bbd.', '..bbd...bbbD'],
  ['.....bd.....', '.....bd.....', '.....bbd....', '.....bbbD...'],
];
const BOOTS_AT = { x: 3, y: 26 } as const;

for (const m of [HEAD, TORSO, SKIRT]) checkMask(m, 'otaman');
for (const set of [VYLOTY, BOOTS])
  set.forEach((m, i) => {
    checkMask(m, `otaman #${String(i)}`);
  });

/** Near (right) shoulder and the hand's rest at the hip, body-local. */
const NEAR: Pt = { x: 14, y: 12 };

export const OTAMAN_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'stone', tones: [2, 3, 4, 5] },
  // Кармазин: the crimson kuntush of the starshyna.
  shirt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  // The blue жупан under it.
  lower: { ramp: 'cloth', tones: [0, 1, 2, 3] },
  // The velvet top of the шапка, a step brighter than the kuntush.
  accent: { ramp: 'crimson', tones: [2, 3, 4, 5] },
  belt: { ramp: 'gold', tones: [2, 3, 4, 5] },
  boots: { ramp: 'gold', tones: [1, 2, 3, 4] },
  // Black lambskin band (≈ #2b2730 → stone 0, its highlight ≈ #4a4550 → stone 1): never read as hair.
  hat: { ramp: 'stone', tones: [0, 0, 0, 1] },
};

interface Frame {
  readonly bob: number;
  readonly lift: number;
  readonly boots: number;
  readonly vyloty: number;
  /** Near hand (body-local) and where the булава's head is relative to it. */
  readonly hand: readonly [number, number];
  readonly mace: readonly [number, number];
}

const IDLE: readonly Frame[] = [
  { bob: 0, lift: 0, boots: 0, vyloty: 0, hand: [15, 18], mace: [2, -4] },
  { bob: 0, lift: 1, boots: 0, vyloty: 0, hand: [15, 17], mace: [2, -4] },
  { bob: 0, lift: 1, boots: 0, vyloty: 1, hand: [15, 17], mace: [2, -4] },
  { bob: 0, lift: 0, boots: 0, vyloty: 1, hand: [15, 18], mace: [2, -4] },
];
const WALK: readonly Frame[] = [
  { bob: 0, lift: 0, boots: 1, vyloty: 1, hand: [17, 17], mace: [2, -4] },
  { bob: 0, lift: 0, boots: 2, vyloty: 0, hand: [16, 18], mace: [2, -4] },
  { bob: -1, lift: 0, boots: 3, vyloty: 1, hand: [14, 18], mace: [1, -4] },
  { bob: 0, lift: 0, boots: 1, vyloty: 1, hand: [14, 18], mace: [1, -4] },
  { bob: 0, lift: 0, boots: 2, vyloty: 0, hand: [16, 18], mace: [2, -4] },
  { bob: -1, lift: 0, boots: 3, vyloty: 1, hand: [17, 17], mace: [2, -4] },
];
const SPEAK: readonly Frame[] = [
  { bob: 0, lift: 0, boots: 0, vyloty: 0, hand: [17, 4], mace: [1, -4] },
  { bob: 0, lift: 0, boots: 0, vyloty: 1, hand: [19, 9], mace: [4, -2] },
  { bob: 0, lift: 1, boots: 0, vyloty: 1, hand: [16, 2], mace: [1, -4] },
  { bob: 0, lift: 0, boots: 0, vyloty: 0, hand: [16, 14], mace: [1, -4] },
];
/** The review step: the булава upright before the face, the walk's boots. */
const MARCH: readonly Frame[] = WALK.map((f) => ({ ...f, hand: [16, 15], mace: [0, -5] }));

const FRAMES: Readonly<Record<string, readonly Frame[]>> = { idle: IDLE, walk: WALK, speak: SPEAK, march: MARCH };

/**
 * The булава: a dark gold haft from the hand to the head, a round head (lit top-left) with a finial px —
 * gold, the sash's ramp, so the mace adds no ramp.
 */
function mace(hand: Pt, head: Pt): Ink[] {
  const out: Ink[] = [];
  const steps = Math.max(Math.abs(head.x - hand.x), Math.abs(head.y - hand.y));
  for (let i = 1; i < steps; i++)
    out.push({
      x: hand.x + Math.round(((head.x - hand.x) * i) / steps),
      y: hand.y + Math.round(((head.y - hand.y) * i) / steps),
      ramp: 'gold',
      shade: 1,
    });
  const g = (dx: number, dy: number, shade: number): Ink => ({ x: head.x + dx, y: head.y + dy, ramp: 'gold', shade });
  // A squat round head (3 × 2, lit top-left) and a finial: never a plus (a cross would read as a crucifix).
  return [...out, g(0, -2, 3), g(-1, -1, 5), g(0, -1, 4), g(1, -1, 3), g(-1, 0, 4), g(0, 0, 3), g(1, 0, 2)];
}

function bodyStamps(f: Frame): Stamp[] {
  const top = f.bob - f.lift;
  const pick = <T>(list: readonly T[], i: number): T => {
    const v = list[i] ?? list[0];
    if (v === undefined) throw new Error('otaman: empty table');
    return v;
  };
  return [
    { mask: pick(VYLOTY, f.vyloty), x: VYLOTY_AT.x, y: VYLOTY_AT.y + top },
    { mask: pick(BOOTS, f.boots), x: BOOTS_AT.x, y: BOOTS_AT.y },
    { mask: SKIRT, x: SKIRT_AT.x, y: SKIRT_AT.y + f.bob },
    { mask: TORSO.slice(4), x: TORSO_AT.x, y: TORSO_AT.y + 4 + f.bob },
    { mask: TORSO.slice(0, 5), x: TORSO_AT.x, y: TORSO_AT.y + top },
    { mask: HEAD, x: HEAD_AT.x, y: HEAD_AT.y + top },
  ];
}

const otaman: SpriteGenerator = {
  atlas: 'people',
  id: 'otaman',
  size: { w: W, h: H },
  frames: { idle: IDLE.length, walk: WALK.length, speak: SPEAK.length, march: MARCH.length },
  variants: ['a'],
  layers: ['shadow'],
  anchor: { x: 0.5, y: (OTAMAN_GROUND + 1) / H },
  generate(_rng, { anim, frame, buffer, layers, rampSize }) {
    const f = FRAMES[anim]?.[frame];
    if (!f) throw new Error(`otaman: no frame ${anim} ${String(frame)}`);
    const o = OTAMAN_OUTFIT;
    const plot = new Plot();
    const tools = new Plot();
    const grip = new Plot();
    const top = f.bob - f.lift;
    paintDoll(
      plot,
      o,
      bodyStamps(f).map((st) => ({ ...st, x: st.x + PAD, y: st.y + TOP })),
    );
    const shoulder = { x: NEAR.x, y: NEAR.y + top + TOP };
    const hand = { x: f.hand[0], y: f.hand[1] + top + TOP };
    paintArm(plot, o, shoulder, hand, false, PAD, grip);
    paintInks(tools, mace(hand, { x: hand.x + f.mace[0], y: hand.y + f.mace[1] }), PAD);
    compose(buffer, [plot.part(1, 1), tools.part(1, 2), grip.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
      selective: PEOPLE_SELECTIVE,
    });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: 3 + PAD, x1: 17 + PAD, groundY: OTAMAN_GROUND, height: 3 });
  },
};

export default otaman;
