// Вартовий — a Sich guard (plan M2-19, ART-BIBLE §7): the Cossack body (kozak masks, шапка with шлик) in a brown
// свита over the сорочка, with a спис (spear). Canvas 32×36: the spear and the raised torch rise above the head (8 rows
// over the 28-px body). idle 4 @6, walk 6 @10 (the kozak's), `watch` 2 @2 (on the spear, breathing), `torch` 4 @8
// (the torch held up, the spear behind in the far hand): the flame is on the base frame (dusk) and on the @emissive
// layer (night, post-grade, like the campfire). Variants are palette swaps.
import { compose, contactShadow } from '../../lib/passes.ts';
import { paintDoll, type Outfit, PEOPLE_SELECTIVE } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { guardPose, GUARD_FRAMES, isGuardAction, type CossackInks, type FlameInks } from '../cossack.ts';
import {
  IDLE,
  KOZAK_GEOM,
  KOZAK_GROUND,
  KOZAK_PAD,
  MAN_H,
  MAN_W,
  WALK,
  kozakStamps,
  paintCossackAction,
} from '../kozak/index.ts';

/** Rows over the body for the spear head and the torch flame. */
const TOP = 8;
const W = MAN_W + 2 * KOZAK_PAD;
const H = MAN_H + TOP;
export const VARTOVYI_GROUND = KOZAK_GROUND + TOP;

const BASE: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'stone', tones: [1, 2, 3, 4] },
  // A brown свита (earth) over the shirt: the guard's coat, darker than the ranks' white shirts.
  shirt: { ramp: 'earth', tones: [1, 2, 3, 4] },
  lower: { ramp: 'cloth', tones: [0, 1, 2, 3] },
  accent: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'crimson', tones: [0, 1, 2, 3] },
  hat: { ramp: 'earth', tones: [0, 0, 1, 2] },
};
/** a: brown свита, blue sharovary; b: grey свита (stone), green sharovary, darker skin. */
export const VARTOVYI_OUTFITS: Readonly<Record<string, Outfit>> = {
  a: BASE,
  b: {
    ...BASE,
    skin: { ramp: 'skin', tones: [0, 1, 2, 3] },
    shirt: { ramp: 'stone', tones: [1, 2, 3, 4] },
    lower: { ramp: 'grass', tones: [1, 2, 3, 4] },
  },
};

/** Spear shaft and torch stick in earth (the шапка's ramp), the spearhead in stone (the moustache's). */
const INKS: CossackInks = {
  wood: { ramp: 'earth', shades: [0, 2, 3] },
  metal: { ramp: 'stone', shades: [2, 4, 5] },
  smoke: { ramp: 'stone', shades: [4, 5] },
  ember: { ramp: 'crimson', shade: 5 },
};
/** The flame: gold core and body, crimson tips (the campfire's inks). */
const FLAME: FlameInks = {
  core: { ramp: 'gold', shade: 5 },
  body: { ramp: 'gold', shades: [3, 4] },
  tip: { ramp: 'crimson', shade: 4 },
};

const vartovyi: SpriteGenerator = {
  atlas: 'people',
  id: 'vartovyi',
  size: { w: W, h: H },
  frames: { idle: IDLE.length, walk: WALK.length, ...GUARD_FRAMES },
  variants: Object.keys(VARTOVYI_OUTFITS),
  layers: ['emissive', 'shadow'],
  anchor: { x: 0.5, y: (VARTOVYI_GROUND + 1) / H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const outfit = VARTOVYI_OUTFITS[variant ?? 'a'];
    if (!outfit) throw new Error(`vartovyi: no outfit ${String(variant)}`);
    const plot = new Plot();
    const tools = new Plot();
    const grip = new Plot();
    let span: readonly [number, number] = KOZAK_GEOM.shadow;
    if (isGuardAction(anim)) {
      const p = guardPose(anim, frame, KOZAK_GEOM, INKS, FLAME);
      paintCossackAction(plot, tools, grip, outfit, 'hat', p, KOZAK_PAD, TOP);
      span = p.shadow;
      const glow = layers.emissive;
      if (glow)
        for (const i of p.glow) {
          const x = i.x + KOZAK_PAD;
          const y = i.y + TOP;
          if (glow.inBounds(x, y)) glow.set(x, y, { ramp: i.ramp, shade: i.shade });
        }
    } else {
      const pose = (anim === 'walk' ? WALK : IDLE)[frame];
      if (!pose) throw new Error(`vartovyi: no pose for ${anim} ${String(frame)}`);
      paintDoll(
        plot,
        outfit,
        kozakStamps(pose, 'hat').map((st) => ({ ...st, x: st.x + KOZAK_PAD, y: st.y + TOP })),
      );
    }
    compose(buffer, [plot.part(1, 1), tools.part(1, 2), grip.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
      selective: PEOPLE_SELECTIVE,
    });
    const shadow = layers.shadow;
    if (shadow)
      contactShadow(shadow, { x0: span[0] + KOZAK_PAD, x1: span[1] + KOZAK_PAD, groundY: VARTOVYI_GROUND, height: 3 });
  },
};

export default vartovyi;
