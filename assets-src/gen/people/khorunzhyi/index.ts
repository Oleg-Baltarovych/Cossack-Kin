// Хорунжий — the корогвоносець who carries the Sich's корогва on a raid (plan M3-13, SPEC §6.6, ART-BIBLE §7): the
// Cossack body (kozak masks, шапка with a crimson шлик) in a green жупан, crimson шаровари, an ochre sash and brown
// чоботи, with the корогва's pole (earth) and its gilt spear-point. idle 4 @6 (the pole grounded by the near boot,
// breathing), march 6 @10 (the pole lifted, the butt at the belt, the near fist high on the shaft). The cloth is its
// own sprite (`korohva`, the Sich's crimson banner with the gold cross, 4 frames at the wind's rate) that render
// hangs at the pole top (content `BEARER_BANNER`, the same hoist as `bearerHoist` here — tested).
// Canvas 32 × (28 + 24): the lifted pole and its finial rise 24 rows over the body.
import { compose, contactShadow } from '../../lib/passes.ts';
import { type Outfit, PEOPLE_SELECTIVE } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import {
  BEARER_FRAMES,
  bearerPole,
  bearerPose,
  type BearerAction,
  type CossackInks,
  type FinialInks,
} from '../cossack.ts';
import { KOZAK_GEOM, KOZAK_GROUND, KOZAK_PAD, MAN_H, MAN_W, paintCossackAction } from '../kozak/index.ts';

/** Rows over the body: the lifted pole's top (march, on the rise) and the 3-px finial over it. */
const TOP = 24;
const W = MAN_W + 2 * KOZAK_PAD;
const H = MAN_H + TOP;
export const KHORUNZHYI_GROUND = KOZAK_GROUND + TOP;

/**
 * A green жупан over the shirt (grass), crimson шаровари, an ochre sash (gold: crimson on crimson loses the belt, and
 * the bands read dark / green / ochre / red — no state flag), brown boots and the dark шапка with a crimson шлик.
 * Six ramps: skin, stone (moustache), grass, crimson, gold, earth — the pole is earth, the finial gold.
 */
export const KHORUNZHYI_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'stone', tones: [1, 2, 3, 4] },
  shirt: { ramp: 'grass', tones: [1, 2, 3, 4] },
  lower: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  accent: { ramp: 'crimson', tones: [2, 3, 4, 5] },
  belt: { ramp: 'gold', tones: [1, 2, 3, 3] },
  boots: { ramp: 'earth', tones: [1, 2, 3, 4] },
  hat: { ramp: 'earth', tones: [0, 0, 1, 2] },
};

const INKS: CossackInks = {
  wood: { ramp: 'earth', shades: [1, 3, 4] },
  metal: { ramp: 'stone', shades: [2, 4, 5] },
  smoke: { ramp: 'stone', shades: [4, 5] },
  ember: { ramp: 'crimson', shade: 5 },
};
const FINIAL: FinialInks = { ramp: 'gold', shades: [2, 4, 5] };

const isBearerAction = (anim: string): anim is BearerAction => anim in BEARER_FRAMES;

/**
 * The cloth's pivot (its hoist: the top-left px right of the pole's top row) relative to the sprite's pivot (the
 * bottom edge of the ground row, at the pivot column), facing right.
 */
export function bearerHoist(anim: BearerAction, frame: number): { readonly dx: number; readonly dy: number } {
  const p = bearerPole(KOZAK_GEOM, anim, frame);
  return { dx: p.x + 1 - KOZAK_GEOM.cx, dy: p.top - (KOZAK_GROUND + 1) };
}

const khorunzhyi: SpriteGenerator = {
  atlas: 'people',
  id: 'khorunzhyi',
  size: { w: W, h: H },
  frames: BEARER_FRAMES,
  variants: ['a'],
  layers: ['shadow'],
  anchor: { x: 0.5, y: (KHORUNZHYI_GROUND + 1) / H },
  generate(_rng, { anim, frame, buffer, layers, rampSize }) {
    if (!isBearerAction(anim)) throw new Error(`khorunzhyi: no animation ${anim}`);
    const plot = new Plot();
    const tools = new Plot();
    const grip = new Plot();
    const p = bearerPose(anim, frame, KOZAK_GEOM, INKS, FINIAL);
    paintCossackAction(plot, tools, grip, KHORUNZHYI_OUTFIT, 'hat', p, KOZAK_PAD, TOP);
    compose(buffer, [plot.part(1, 1), tools.part(1, 2), grip.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
      selective: PEOPLE_SELECTIVE,
    });
    const shadow = layers.shadow;
    if (shadow)
      contactShadow(shadow, {
        x0: p.shadow[0] + KOZAK_PAD,
        x1: p.shadow[1] + KOZAK_PAD,
        groundY: KHORUNZHYI_GROUND,
        height: 3,
      });
  },
};

export default khorunzhyi;
