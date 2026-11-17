// Селянин — a peasant man in a свита, 18×28, facing right (plan ART-15, ART-BIBLE §7). The man's paper doll (kozak:
// legs, arm, idle/walk tables) with his own top: a wide straw бриль (the silhouette mark — no other figure has a
// brim), a brown homespun свита to the knee with a white shirt collar showing and a crimson sash, light linen
// trousers into boots below the hem. The coat's hem trails 1 px on the walk. Variants are palette swaps.
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { ARM, ARM_AT, IDLE, KOZAK_GROUND, LEGS, LEGS_AT, MAN_H, MAN_W, WALK, type Pose } from '../kozak/index.ts';

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

for (const m of [HEAD, TORSO, SKIRT]) checkMask(m, 'selianyn');

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
/** a: brown свита, crimson sash; b: grey свита (stone), green sash, darker skin. */
export const SELIANYN_OUTFITS: Readonly<Record<string, Outfit>> = {
  a: BASE,
  b: {
    ...BASE,
    skin: { ramp: 'skin', tones: [0, 1, 2, 3] },
    shirt: { ramp: 'stone', tones: [1, 2, 3, 4] },
    lower: { ramp: 'stone', tones: [3, 4, 5, 6] },
    belt: { ramp: 'grass', tones: [1, 2, 3, 4] },
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

const selianyn: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'selianyn',
  size: { w: MAN_W, h: MAN_H },
  frames: { idle: IDLE.length, walk: WALK.length },
  variants: Object.keys(SELIANYN_OUTFITS),
  layers: ['shadow'],
  anchor: { x: 0.5, y: (KOZAK_GROUND + 1) / MAN_H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const outfit = SELIANYN_OUTFITS[variant ?? 'a'];
    const pose = (anim === 'walk' ? WALK : IDLE)[frame];
    if (!outfit || !pose) throw new Error(`selianyn: no outfit/pose for ${String(variant)} ${anim} ${String(frame)}`);
    const plot = new Plot();
    paintDoll(plot, outfit, stamps(pose));
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

export default selianyn;
