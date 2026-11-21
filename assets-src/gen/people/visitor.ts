// Travellers (plan M2-21, SPEC §2.6, ART-BIBLE §7): the visitors who pass through the village — a кобзар, a лірник,
// a чумак, a коробейник and a гончар. One paper doll for all five: the man's legs, arm and idle/walk tables (kozak),
// a свита to the knee or a shirt over шаровари, each with his own head and his trade's props, which give each one his
// silhouette — the кобзар's kobza on his back and staff, the лірник's lira at his hip, the чумак's батіг and wide бриль,
// the коробейник's wicker pack, the гончар's pots on a pole. Props are px masks with their own legend (ramp, shade),
// in ramps the figure already wears, so a frame stays ≤ 6 ramps. 1-px things (staff, strap, whip, cords, the kobza's
// neck) are drawn without an outline. Canvas 32 px (pivot unchanged), light top-left; facing left is a mirror in
// render. The кобзар also has `play` 4@6: seated, the kobza on his knee, strumming.
import { compose, contactShadow } from '../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp } from '../lib/doll.ts';
import { Plot } from '../lib/plot.ts';
import type { RampName } from '../lib/buffer.ts';
import type { SpriteGenerator } from '../lib/types.ts';
import { ARM, ARM_AT, IDLE, KOZAK_GROUND, LEGS, LEGS_AT, MAN_H, MAN_W, WALK, type Pose } from './kozak/index.ts';
import { line, paintArm, type Pt } from './work.ts';

/** Margin each side of the 18-px body (room for props); the canvas is 32 px, the pivot stays at x 9 + PAD. */
export const VISITOR_PAD = 7;
const PAD = VISITOR_PAD;
export const VISITOR_W = MAN_W + 2 * PAD;
export const VISITOR_GROUND = KOZAK_GROUND;

/** A prop mask's legend: char → ramp and shade ('.' = empty). */
export type PropLegend = Readonly<Record<string, readonly [RampName, number]>>;

/** A prop mask placed at body-local (x, y). */
export interface PropStamp {
  readonly mask: Mask;
  readonly legend: PropLegend;
  readonly x: number;
  readonly y: number;
}

/** One px of a 1-px prop (body-local). */
export interface Thin extends Pt {
  readonly ramp: RampName;
  readonly shade: number;
}

/** What a frame needs to place props: the anim, frame, the body's bob and the upper body's lift. */
export interface FrameInfo {
  readonly anim: 'idle' | 'walk' | 'play';
  readonly frame: number;
  /** Shift of the hips and coat (walk passing frames: −1). */
  readonly bob: number;
  /** Shift of the shoulders, head and everything carried on them (bob + idle breath). */
  readonly top: number;
}

/** A traveller: his outfit, head, clothes and props. */
export interface Traveller {
  readonly id: string;
  readonly outfit: Outfit;
  readonly head: Mask;
  readonly headAt: Pt;
  /** A свита to the knee (coat) or a shirt with the пояс over шаровари. */
  readonly dress: 'coat' | 'shirt';
  /** Props behind the body (a pack, a kobza on the back). */
  readonly back?: (f: FrameInfo) => readonly PropStamp[];
  /** Props over the body, under the near arm (a lira, pots). */
  readonly front?: (f: FrameInfo) => readonly PropStamp[];
  /** 1-px props, unoutlined, over everything (a staff, a strap, a whip, cords). */
  readonly thin?: (f: FrameInfo) => readonly Thin[];
  /** The near arm's mask index (kozak ARM: 0 hang, 1 forward, 2 back) when it holds something; absent = the walk table's. */
  readonly arm?: number;
  /** Ground shadow span (body-local x), wider under a pack or a pole. */
  readonly shadow: readonly [number, number];
  /** The кобзар's `play` (seated with the kobza), painted by the caller's own function. */
  readonly play?: (plot: Plot, thin: Plot, f: FrameInfo) => void;
}

/** Свита over the chest (shirt slot), the shirt collar (accent), the sash (belt) and the coat below it (selianyn). */
const COAT_TORSO: Mask = ['.aAwwwv..', 'WWaAwwwv.', 'WwwwwwVvv', 'WwwwwwVvv', 'WwwwwwVvv', 'RRrrrrrtT', 'WwwwwwVvv'];
/** The coat's skirt (пола) over the thighs to the knee, flaring; the lower rows trail on the walk. */
const COAT_SKIRT: Mask = ['WWwwwwVvvv', 'WWwwwwVvvv', 'WwwwwwVvvvv', 'WwwwwwVvvvv', 'WwwwwwVwvvvv', 'WWwwwwVwvvvv'];
/** A shirt with wide shoulders and the пояс (kozak), worn over шаровари. */
const SHIRT_TORSO: Mask = ['.WWwwwv..', 'WWwwwwwv.', 'Wwwwwwwvv', 'Wwwwwwwvv', 'Wwwwwwvvv', 'RRrrrrrtT', 'Rrrrrrrtt'];
const TORSO_AT = { x: 4, y: 10 } as const;
const SKIRT_AT = { x: 4, y: 17 } as const;
/** Seated on a stump or a bench end: the свита over the thighs, shins down to the boots (selianyn). */
export const COAT_SIT: Mask = [
  '.WWwwwwwvvvv...',
  '.WwwwwwwwvvvvV.',
  '..VvvvvvvvvvVV.',
  '........qQpqq..',
  '........qQpqq..',
  '........dDbbd..',
  '.......dDDbbbD.',
];
export const SIT_AT = { x: 3, y: 21 } as const;
/** Rows the upper body drops when seated. */
export const SIT_DROP = 5;
/** Shoulders (body-local, standing). */
export const NEAR_SHOULDER: Pt = { x: 12, y: 11 };
export const FAR_SHOULDER: Pt = { x: 6, y: 11 };

for (const m of [COAT_TORSO, COAT_SKIRT, SHIRT_TORSO, COAT_SIT]) checkMask(m, 'visitor');

/** Paints a prop mask (body-local) into `plot`, shifted right by the pad. */
export function paintProp(plot: Plot, p: PropStamp): void {
  p.mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const entry = p.legend[row.charAt(c)];
      if (entry) plot.set(p.x + c + PAD, p.y + r, entry[0], entry[1]);
    }
  });
}

/** Paints 1-px props (body-local). */
export function paintThin(plot: Plot, inks: readonly Thin[]): void {
  for (const p of inks) plot.set(p.x + PAD, p.y, p.ramp, p.shade);
}

/** A 1-px line of one ramp and shade (body-local). */
export const thinLine = (a: Pt, b: Pt, ramp: RampName, shade: number): Thin[] =>
  line(a, b).map((p) => ({ x: p.x, y: p.y, ramp, shade }));

const pick = <T>(list: readonly T[], i: number): T => {
  const v = list[i] ?? list[0];
  if (v === undefined) throw new Error('visitor: empty table');
  return v;
};

/** The standing / walking body: legs, coat or shirt, head, near arm. */
function bodyStamps(t: Traveller, pose: Pose): Stamp[] {
  const b = pose.bob;
  const top = b + pose.breath;
  const legs = { mask: pick(LEGS, pose.legs), x: LEGS_AT.x, y: LEGS_AT.y };
  const head = { mask: t.head, x: t.headAt.x, y: t.headAt.y + top };
  if (t.dress === 'shirt')
    return [
      legs,
      { mask: SHIRT_TORSO.slice(4), x: TORSO_AT.x, y: TORSO_AT.y + 4 + b },
      { mask: SHIRT_TORSO.slice(0, 5), x: TORSO_AT.x, y: TORSO_AT.y + top },
      head,
    ];
  const trail = pose.belt === 1 ? -1 : 0;
  return [
    legs,
    { mask: COAT_SKIRT.slice(3), x: SKIRT_AT.x + trail, y: SKIRT_AT.y + 3 },
    { mask: COAT_SKIRT.slice(0, 4), x: SKIRT_AT.x, y: SKIRT_AT.y + b },
    { mask: COAT_TORSO.slice(4), x: TORSO_AT.x, y: TORSO_AT.y + 4 + b },
    { mask: COAT_TORSO.slice(0, 5), x: TORSO_AT.x, y: TORSO_AT.y + top },
    head,
  ];
}

/** The seated upper body for `play` (coat only): torso and head dropped by `SIT_DROP`, lifted by `lift`. */
export function seatedStamps(t: Traveller, lift: number): Stamp[] {
  const top = SIT_DROP - lift;
  return [
    { mask: COAT_TORSO.slice(4), x: TORSO_AT.x, y: TORSO_AT.y + 4 + SIT_DROP },
    { mask: COAT_SIT, x: SIT_AT.x, y: SIT_AT.y },
    { mask: COAT_TORSO.slice(0, 5), x: TORSO_AT.x, y: TORSO_AT.y + top },
    { mask: t.head, x: t.headAt.x, y: t.headAt.y + top },
  ];
}

/** Paints the doll's stamps (body-local) shifted by the pad. */
export function paintBody(plot: Plot, outfit: Outfit, stamps: readonly Stamp[]): void {
  paintDoll(
    plot,
    outfit,
    stamps.map((st) => ({ ...st, x: st.x + PAD })),
  );
}

/** A sleeve from a shoulder to a hand (body-local), over `plot`. */
export function paintSleeve(plot: Plot, outfit: Outfit, shoulder: Pt, hand: Pt, far: boolean): void {
  paintArm(plot, outfit, shoulder, hand, far, PAD);
}

/** The generator for traveller `t` (`people` atlas, one outfit `a`): idle 4, walk 6, and `play` 4 if he has it. */
export function travellerGenerator(t: Traveller): SpriteGenerator {
  checkMask(t.head, t.id);
  return {
    atlas: 'people',
    id: t.id,
    size: { w: VISITOR_W, h: MAN_H },
    frames: { idle: IDLE.length, walk: WALK.length, ...(t.play ? { play: 4 } : {}) },
    variants: ['a'],
    layers: ['shadow'],
    anchor: { x: 0.5, y: (VISITOR_GROUND + 1) / MAN_H },
    generate(_rng, { anim, frame, buffer, layers, rampSize }) {
      const plot = new Plot();
      const thin = new Plot();
      if (anim === 'play') {
        if (!t.play) throw new Error(`${t.id}: no play`);
        t.play(plot, thin, { anim: 'play', frame, bob: 0, top: SIT_DROP });
      } else {
        const pose = (anim === 'walk' ? WALK : IDLE)[frame];
        if (!pose) throw new Error(`${t.id}: no pose for ${anim} ${String(frame)}`);
        const f: FrameInfo = {
          anim: anim === 'walk' ? 'walk' : 'idle',
          frame,
          bob: pose.bob,
          top: pose.bob + pose.breath,
        };
        for (const p of t.back?.(f) ?? []) paintProp(plot, p);
        paintBody(plot, t.outfit, bodyStamps(t, pose));
        for (const p of t.front?.(f) ?? []) paintProp(plot, p);
        paintBody(plot, t.outfit, [{ mask: pick(ARM, t.arm ?? pose.arm), x: ARM_AT.x, y: ARM_AT.y + f.top }]);
        paintThin(thin, t.thin?.(f) ?? []);
      }
      compose(buffer, [plot.part(1, 1), thin.part(1, 2)], rampSize, {
        light: false,
        occlusion: false,
        outline: { mode: 'outer', drop: 2, parts: [1] },
        selective: { lit: 'lighter' },
      });
      const shadow = layers.shadow;
      if (shadow)
        contactShadow(shadow, { x0: t.shadow[0] + PAD, x1: t.shadow[1] + PAD, groundY: VISITOR_GROUND, height: 3 });
    },
  };
}
