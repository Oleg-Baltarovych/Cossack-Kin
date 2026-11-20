// Селянин — a peasant man in a свита, 18×28, facing right (plan ART-15, ART-BIBLE §7). The man's paper doll (kozak:
// legs, arm, idle/walk tables) with his own top: a wide straw бриль (the silhouette mark — no other figure has a
// brim), a brown homespun свита to the knee with a white shirt collar showing and a crimson sash, light linen
// trousers into boots below the hem. The coat's hem trails 1 px on the walk. Variants are palette swaps.
// M2-17: work, talk, sit and cheer poses from the shared choreography (people/work.ts); the canvas is padded to 32 px
// so tools and props fit beside the body (the pivot column is unchanged).
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { ARM, ARM_AT, IDLE, KOZAK_GROUND, LEGS, LEGS_AT, MAN_H, MAN_W, WALK, type Pose } from '../kozak/index.ts';
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

/** Margin each side of the 18-px body (room for tools and props); the canvas is 32 px, the pivot stays at x 9 + PAD. */
const PAD = 7;
const W = MAN_W + 2 * PAD;

/** Бриль (hat = straw) with a lit brim 12 px wide, its shadow over the brow; face and moustache as the Cossack's. */
const HEAD: Mask = [
  '....cCCcg...',
  '...cCccccg..',
  'cCCCCCCCCccg',
  '..zzSzzzz...',
  '..zsjssjs...',
  '..zssssSss..',
  '...zsHhhh...',
  '...zhsssh...',
];
const HEAD_AT = { x: 4, y: 2 } as const;

/** Свита over the chest (shirt slot = the coat), the shirt collar (accent), the sash (belt), the coat below it. */
/** A 2-px shirt collar (the night anchor, art-director ART-15) and the front edge of the coat (V) down to the hem. */
const TORSO: Mask = ['.aAwwwv..', 'WWaAwwwv.', 'WwwwwwVvv', 'WwwwwwVvv', 'WwwwwwVvv', 'RRrrrrrtT', 'WwwwwwVvv'];
const TORSO_AT = { x: 4, y: 10 } as const;

/** The coat's skirt (пола) over the thighs to the knee, flaring; the lower 3 rows trail on the walk. */
const SKIRT: Mask = ['WWwwwwVvvv', 'WWwwwwVvvv', 'WwwwwwVvvvv', 'WwwwwwVvvvv', 'WwwwwwVwvvvv', 'WWwwwwVwvvvv'];
const SKIRT_AT = { x: 4, y: 17 } as const;

/**
 * Seated (stool, potter's wheel, the fire at night): the свита over the thighs to the knee, shins down to the boots,
 * the far leg a shade darker behind the near one.
 */
const SIT: Mask = [
  '.WWwwwwwvvvv...',
  '.WwwwwwwwvvvvV.',
  '..VvvvvvvvvvVV.',
  '........qQpqq..',
  '........qQpqq..',
  '........dDbbd..',
  '.......dDDbbbD.',
];
const SIT_AT = { x: 3, y: 21 } as const;

for (const m of [HEAD, TORSO, SKIRT, SIT]) checkMask(m, 'selianyn');

/** The man's joints for the shared choreography. */
export const MAN_GEOM: BodyGeom = {
  ground: KOZAK_GROUND,
  cx: 9,
  near: { x: 12, y: 11 },
  far: { x: 6, y: 11 },
  reach: 5,
  sitDrop: 5,
  shadow: [4, 15],
};
/** Tools in ramps every man's outfit has: wood (hair, boots), plaster (collar) as steel, thatch (the бриль) as
 * honey, skin tones as clay. */
const MAN_TOOLS: ToolInks = {
  wood: 'wood',
  woodTop: 3,
  metal: { ramp: 'plaster', shades: [2, 3, 5] },
  honey: { ramp: 'thatch', shades: [4, 5] },
  clay: { ramp: 'skin', shades: [1, 2, 3] },
  hot: { ramp: 'thatch', shade: 5 },
};

const BASE: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'wood', tones: [0, 1, 2, 3] },
  shirt: { ramp: 'earth', tones: [1, 2, 3, 4] },
  // Light linen: the band above the boots keeps a light value under the night grade.
  lower: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  accent: { ramp: 'plaster', tones: [3, 4, 5, 6] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'wood', tones: [0, 1, 2, 3] },
  hat: { ramp: 'thatch', tones: [2, 3, 4, 5] },
};
/**
 * a: brown свита, crimson sash; b: grey свита (stone), green sash, darker skin; c: off-white undyed-wool свита (біла
 * свита, greyed), crimson sash, grey trousers; d: near-black свита (чорна свита), crimson sash, light skin, pale straw.
 */
export const SELIANYN_OUTFITS: Readonly<Record<string, Outfit>> = {
  a: BASE,
  b: {
    ...BASE,
    skin: { ramp: 'skin', tones: [0, 1, 2, 3] },
    shirt: { ramp: 'stone', tones: [1, 2, 3, 4] },
    lower: { ramp: 'stone', tones: [3, 4, 5, 6] },
    belt: { ramp: 'grass', tones: [1, 2, 3, 4] },
  },
  c: {
    ...BASE,
    // Undyed wool, greyer than the shirt collar: a pure white coat was the brightest thing at night (art-director).
    shirt: { ramp: 'plaster', tones: [1, 2, 3, 4] },
    // The sash's lit tone stays off: it was the 29th colour of the walk.
    belt: { ramp: 'crimson', tones: [1, 2, 3, 3] },
    // The shirt collar one step above the coat, inside its shades: no extra plaster colours.
    accent: { ramp: 'plaster', tones: [2, 3, 4, 5] },
    lower: { ramp: 'stone', tones: [3, 4, 5, 6] },
  },
  d: {
    ...BASE,
    skin: { ramp: 'skin', tones: [2, 3, 4, 5] },
    shirt: { ramp: 'stone', tones: [0, 1, 2, 3] },
    hat: { ramp: 'thatch', tones: [3, 4, 5, 6] },
  },
};

function stamps(pose: Pose): Stamp[] {
  const pick = <T>(list: readonly T[], i: number): T => {
    const v = list[i] ?? list[0];
    if (v === undefined) throw new Error('empty pose table');
    return v;
  };
  const b = pose.bob;
  const top = b + pose.breath;
  const trail = pose.belt === 1 ? -1 : 0;
  return [
    { mask: pick(LEGS, pose.legs), x: LEGS_AT.x, y: LEGS_AT.y },
    { mask: SKIRT.slice(3), x: SKIRT_AT.x + trail, y: SKIRT_AT.y + 3 },
    { mask: SKIRT.slice(0, 4), x: SKIRT_AT.x, y: SKIRT_AT.y + b },
    { mask: TORSO.slice(4), x: TORSO_AT.x, y: TORSO_AT.y + 4 + b },
    { mask: TORSO.slice(0, 5), x: TORSO_AT.x, y: TORSO_AT.y + top },
    { mask: HEAD, x: HEAD_AT.x, y: HEAD_AT.y + top },
    { mask: pick(ARM, pose.arm), x: ARM_AT.x, y: ARM_AT.y + top },
  ];
}

/** A work / talk / sit / cheer frame: lower body by kind, upper body dropped, leaned and lifted; arm by the pose. */
function workStamps(p: WorkPose): Stamp[] {
  const b = p.drop;
  const top = p.drop - p.lift;
  const lx = p.lean;
  const sit = p.lower === 'sit';
  const lower: Stamp[] = sit
    ? [{ mask: SIT, x: SIT_AT.x, y: SIT_AT.y }]
    : [
        { mask: LEGS[p.lower === 'stance' ? 2 : 0] ?? [], x: LEGS_AT.x, y: LEGS_AT.y },
        { mask: SKIRT.slice(3), x: SKIRT_AT.x, y: SKIRT_AT.y + 3 },
        // A hip shift keeps the unshifted coat under it, so no gap opens at the back.
        { mask: SKIRT.slice(0, 4), x: SKIRT_AT.x, y: SKIRT_AT.y + b },
        { mask: SKIRT.slice(0, 4), x: SKIRT_AT.x + p.hip, y: SKIRT_AT.y + b },
      ];
  return [
    ...(sit ? [] : lower),
    { mask: TORSO.slice(4), x: TORSO_AT.x, y: TORSO_AT.y + 4 + b },
    { mask: TORSO.slice(4), x: TORSO_AT.x + p.hip, y: TORSO_AT.y + 4 + b },
    ...(sit ? lower : []),
    { mask: TORSO.slice(0, 5), x: TORSO_AT.x + lx, y: TORSO_AT.y + top },
    { mask: HEAD, x: HEAD_AT.x + lx, y: HEAD_AT.y + top },
  ];
}

function paintWork(plot: Plot, tools: Plot, grip: Plot, outfit: Outfit, p: WorkPose): void {
  const top = p.drop - p.lift;
  paintInks(plot, p.props, PAD);
  if (p.far) paintArm(plot, outfit, { x: MAN_GEOM.far.x + p.lean, y: MAN_GEOM.far.y + top }, p.far, true, PAD);
  paintDoll(
    plot,
    outfit,
    workStamps(p).map((st) => ({ ...st, x: st.x + PAD })),
  );
  paintInks(plot, p.propsFront, PAD);
  if (p.near)
    paintArm(plot, outfit, { x: MAN_GEOM.near.x + p.lean, y: MAN_GEOM.near.y + top }, p.near, false, PAD, grip);
  else paintDoll(plot, outfit, [{ mask: ARM[0] ?? [], x: ARM_AT.x + p.lean + PAD, y: ARM_AT.y + top }]);
  paintInks(tools, p.tools, PAD);
}

const selianyn: SpriteGenerator = {
  atlas: 'people',
  id: 'selianyn',
  size: { w: W, h: MAN_H },
  frames: { idle: IDLE.length, walk: WALK.length, ...WORK_FRAMES },
  variants: Object.keys(SELIANYN_OUTFITS),
  layers: ['shadow'],
  anchor: { x: 0.5, y: (KOZAK_GROUND + 1) / MAN_H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const outfit = SELIANYN_OUTFITS[variant ?? 'a'];
    if (!outfit) throw new Error(`selianyn: no outfit ${String(variant)}`);
    const plot = new Plot();
    const tools = new Plot();
    const grip = new Plot();
    let span: readonly [number, number] = MAN_GEOM.shadow;
    if (isWorkAnim(anim)) {
      const p = workPose(anim, frame, MAN_GEOM, MAN_TOOLS, 'man');
      paintWork(plot, tools, grip, outfit, p);
      span = p.shadow;
    } else {
      const pose = (anim === 'walk' ? WALK : IDLE)[frame];
      if (!pose) throw new Error(`selianyn: no pose for ${anim} ${String(frame)}`);
      paintDoll(
        plot,
        outfit,
        stamps(pose).map((st) => ({ ...st, x: st.x + PAD })),
      );
    }
    // Tools over the body without an outline (1 px stays 1 px); the gripping hand is painted again over its tool.
    compose(buffer, [plot.part(1, 1), tools.part(1, 2), grip.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
      selective: { lit: 'lighter' },
    });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: span[0] + PAD, x1: span[1] + PAD, groundY: KOZAK_GROUND, height: 3 });
  },
};

export default selianyn;
