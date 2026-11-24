// Носії — two Cossacks carrying the raid's chest home (plan M3-13, SPEC §6.6 «повертається зі скринею»): one sprite,
// both facing right, the chest (`skrynia`, the same object) slung between them by its iron end brackets — the rear man
// (shaved head with a short оселедець, white сорочка, crimson шаровари, a tan sash) grips it forward with his near hand, the
// front man (`kozak.a`: шапка with a crimson шлик, blue шаровари) reaches back with his far hand. On the march (6 @10)
// they walk out of step (the front man half a cycle on), as two men do under a shared load so it does not pitch; the
// chest rides the shoulders' rise. idle 4 @6: standing with the chest held, breathing. Six ramps a frame: skin, stone,
// plaster, crimson, earth, cloth — the chest is oak (earth) and iron (stone), so it adds none.
// Canvas 44 × 28, the pivot under the middle of the chest (x 22): render places the pair like one walker.
import { compose, contactShadow } from '../../lib/passes.ts';
import { type Outfit, PEOPLE_SELECTIVE } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { cossackFrame, MARCH_STEPS, type CossackPose } from '../cossack.ts';
import { KOZAK_GEOM, KOZAK_GROUND, KOZAK_OUTFITS, MAN_H, paintCossackAction } from '../kozak/index.ts';
import { CHEST, CHEST_GRIP_ROW, paintChest } from '../skrynia/index.ts';

const W = 44;
const H = MAN_H;
/** Each man's body-local x 0 on the canvas (pivot columns 10 and 36). */
const REAR = 1;
const FRONT = 27;
/** The chest's left column on the canvas: the rear man's near fist is on its left bracket. */
const CHEST_X = 17;
/** The fists' row (body-local, standing): the chest's brackets hang there. */
const GRIP_Y = 17;

/** The rear man: bare-headed, white shirt, crimson sharovary, a tan sash (no blue belt: tricolour, ART-19). */
export const REAR_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'stone', tones: [0, 1, 2, 2] },
  shirt: { ramp: 'plaster', tones: [2, 3, 5, 6] },
  lower: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  accent: { ramp: 'cloth', tones: [0, 1, 2, 3] },
  belt: { ramp: 'earth', tones: [2, 3, 4, 5] },
  boots: { ramp: 'earth', tones: [0, 1, 2, 3] },
  hat: { ramp: 'earth', tones: [0, 0, 1, 2] },
};
const FRONT_OUTFIT: Outfit = (() => {
  const o = KOZAK_OUTFITS.a;
  if (!o) throw new Error('nosii: no kozak.a outfit');
  return o;
})();

const CARRY_FRAMES = { idle: 4, march: 6 } as const;
type CarryAnim = keyof typeof CARRY_FRAMES;
const isCarryAnim = (anim: string): anim is CarryAnim => anim in CARRY_FRAMES;

/** One man's step (rise, legs) in frame `f`: the march cycle, or the idle's breath on a still stance. */
function stepOf(anim: CarryAnim, f: number): { bob: number; lift: number; legs: number; drift: number; belt: number } {
  if (anim === 'idle') {
    const lift = f === 1 || f === 2 ? 1 : 0;
    return { bob: 0, lift, legs: 0, drift: f >= 2 ? 1 : 0, belt: 0 };
  }
  const k = MARCH_STEPS[f % MARCH_STEPS.length];
  if (!k) throw new Error(`nosii: no frame ${String(f)}`);
  return { bob: k.bob, lift: 0, legs: k.legs, drift: k.drift, belt: k.belt };
}

/** The chest rises when either man rises (the load hangs from both fists). */
function chestRise(anim: CarryAnim, f: number): number {
  return Math.min(stepOf(anim, f).bob, stepOf(anim, (f + 3) % 6).bob);
}

function manPose(anim: CarryAnim, f: number, role: 'rear' | 'front'): CossackPose {
  const g = KOZAK_GEOM;
  const k = stepOf(anim, role === 'rear' ? f : anim === 'march' ? (f + 3) % 6 : f);
  const y = GRIP_Y + chestRise(anim, f);
  const base = { legs: k.legs, belt: k.belt, drop: k.bob, lift: k.lift, drift: k.drift };
  return role === 'rear'
    ? cossackFrame(g, { ...base, near: { x: CHEST_X - REAR, y } })
    : cossackFrame(g, { ...base, far: { x: CHEST_X + CHEST.w - FRONT, y } });
}

const nosii: SpriteGenerator = {
  atlas: 'people',
  id: 'nosii',
  size: { w: W, h: H },
  frames: CARRY_FRAMES,
  variants: ['a'],
  layers: ['shadow'],
  anchor: { x: 0.5, y: (KOZAK_GROUND + 1) / H },
  generate(_rng, { anim, frame, buffer, layers, rampSize }) {
    if (!isCarryAnim(anim)) throw new Error(`nosii: no animation ${anim}`);
    const plot = new Plot();
    const tools = new Plot();
    const grip = new Plot();
    const rear = manPose(anim, frame, 'rear');
    const front = manPose(anim, frame, 'front');
    paintCossackAction(plot, tools, grip, FRONT_OUTFIT, 'hat', front, FRONT);
    paintCossackAction(plot, tools, grip, REAR_OUTFIT, 'lock', rear, REAR);
    // The chest over the front man's far fist (behind it) and under the rear man's near fist (the grip, on top).
    paintChest(plot, CHEST_X, GRIP_Y + chestRise(anim, frame) - CHEST_GRIP_ROW);
    compose(buffer, [plot.part(1, 1), tools.part(1, 2), grip.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
      selective: PEOPLE_SELECTIVE,
    });
    const shadow = layers.shadow;
    if (shadow) {
      for (const [p, ox] of [
        [rear, REAR],
        [front, FRONT],
      ] as const)
        contactShadow(shadow, { x0: p.shadow[0] + ox, x1: p.shadow[1] + ox, groundY: KOZAK_GROUND, height: 3 });
      // The chest's own soft shadow on the ground between them.
      contactShadow(shadow, { x0: CHEST_X + 2, x1: CHEST_X + CHEST.w - 2, groundY: KOZAK_GROUND, height: 2 });
    }
  },
};

export default nosii;
