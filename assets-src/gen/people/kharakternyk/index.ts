// Характерник — the hero of the Sich (plan M4-11, SPEC §16, Q10): a seasoned old Cossack, a warrior-sage, not a
// wizard — no glow, no sparks; he is told by age and bearing alone, after the folk picture of Козак Мамай and the
// дума old men: the Cossack body (kozak masks) with the old man's bare head (`elder`: shaved skull, the long grey
// оселедець wound behind the ear, the grey moustache falling in two strands onto the chest), a dark charcoal жупан to
// the knee over crimson шаровари, a crimson sash, brown чоботи, the шабля at the left hip (its hilt before the belt,
// the scabbard slanting out behind him) and the люлька in his teeth. idle 4 @6 (breath, the lock drifts), walk 6 @10
// (the kozak's legs, the coat's skirt swinging open on the stride), `sit-smoke` 2 @2 (the kozak's pose on a log, the
// coat's lap over the knees). One outfit (`kharakternyk.a`). Five ramps: skin, plaster (white hair, smoke), stone
// (coat, steel), crimson (шаровари, sash, ember), earth (boots, eyes, pipe, scabbard).
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp, PEOPLE_SELECTIVE } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { cossackPose, type CossackInks, type CossackPose } from '../cossack.ts';
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
  type Pose,
} from '../kozak/index.ts';
import { line, paintInks, type Ink, type Pt } from '../work.ts';

const W = MAN_W + 2 * KOZAK_PAD;
const H = MAN_H;

export const KHARAKTERNYK_OUTFIT: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  // White-grey hair and moustache: the lightest px of the figure, against the dark coat.
  hair: { ramp: 'plaster', tones: [2, 3, 4, 5] },
  // The dark жупан (charcoal wool, сукно): the darkest coat of the Sich.
  shirt: { ramp: 'stone', tones: [0, 1, 2, 3] },
  lower: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  accent: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  belt: { ramp: 'crimson', tones: [2, 3, 4, 5] },
  boots: { ramp: 'earth', tones: [1, 2, 3, 4] },
  // No шапка: the slot paints only the eyes.
  hat: { ramp: 'earth', tones: [0, 0, 1, 2] },
};

/** The pipe, the log and the scabbard in earth; the hilt in stone; smoke in plaster; the ember crimson. */
const INKS: CossackInks = {
  wood: { ramp: 'earth', shades: [0, 1, 3] },
  metal: { ramp: 'stone', shades: [2, 4, 5] },
  // [far, near]: the puff's upper px plaster 4, its lower (fresh) px plaster 3 (art-director M4-11).
  smoke: { ramp: 'plaster', shades: [4, 3] },
  ember: { ramp: 'crimson', shade: 5 },
};

/**
 * The жупан's skirt under the sash, to the knee (rows 17–21); the front edge shaded. 0 the legs together (stand,
 * recoil, passing): hangs straight, flush with the back; 1 the stride: the skirt flares and swings open at the front.
 */
const SKIRT: readonly Mask[] = [
  ['.WWwwwwwwvvv', '.Wwwwwwwwvvv', '.Wwwwwwwwvvv', '.Wwwwwwwwvvv', '.vvvvvvvvvVV'],
  ['.WWwwwwwwvvv.', '.Wwwwwwwwwvvv', 'WWwwwwwwwwvvv', 'Wwwwwwww.wvvv', 'vvvvvvv...vvV'],
];
const SKIRT_AT = { x: 2, y: 17 } as const;
SKIRT.forEach((m, i) => {
  checkMask(m, `kharakternyk skirt #${String(i)}`);
});

/** The seated lap (sit-smoke): the coat over the thighs, its hem hanging behind the log. */
function lap(): Ink[] {
  // The seated thighs' top row (kozak SIT at ground − 6).
  const y = KOZAK_GEOM.ground - 6;
  const out: Ink[] = [];
  for (let x = 4; x <= 11; x++) out.push({ x, y, ramp: 'stone', shade: x < 6 ? 3 : 2 });
  for (let x = 3; x <= 11; x++) out.push({ x, y: y + 1, ramp: 'stone', shade: 1 });
  for (let r = 2; r <= 4; r++) out.push({ x: 3, y: y + r, ramp: 'stone', shade: r === 4 ? 0 : 1 });
  return out;
}

/**
 * The шабля on the left hip (art-director M4-11): a grey grip and crossguard px just under the sash before the hip, the
 * scabbard (earth 0: a step darker than the boots, never the pipe's brown) slanting down-back out of the coat to a
 * steel chape — drawn only where the body is not.
 */
function sabre(dy: number): Ink[] {
  const pts = line({ x: 6, y: 16 + dy }, { x: -3, y: 21 + dy });
  return [
    { x: 15, y: 17 + dy, ramp: 'stone', shade: 4 },
    { x: 14, y: 18 + dy, ramp: 'stone', shade: 2 },
    ...pts.map((p: Pt, i): Ink => ({
      ...p,
      ramp: i === pts.length - 1 ? 'stone' : 'earth',
      shade: i === pts.length - 1 ? 4 : 0,
    })),
  ];
}

/** The люлька in his teeth (idle, walk): the stem drooping down-right from the mouth, a dark bowl at its end. */
function pipe(dy: number): Ink[] {
  const [d, m, l] = INKS.wood.shades;
  return [
    { x: 13, y: 9 + dy, ramp: 'earth', shade: l },
    { x: 14, y: 10 + dy, ramp: 'earth', shade: m },
    { x: 15, y: 11 + dy, ramp: 'earth', shade: d },
  ];
}

/** Paints `inks` only where neither the body nor a tool is (the sabre behind the hip). */
function paintBehind(plot: Plot, tools: Plot, inks: readonly Ink[], pad: number): void {
  for (const i of inks)
    if (!plot.has(i.x + pad, i.y) && !tools.has(i.x + pad, i.y)) tools.set(i.x + pad, i.y, i.ramp, i.shade);
}

/** The idle / walk body: the kozak's stamps with the coat's skirt over the legs and under the sash ends. */
function bodyStamps(pose: Pose): Stamp[] {
  const [beltEnds, legs, ...upper] = kozakStamps(pose, 'elder');
  if (!beltEnds || !legs) throw new Error('kharakternyk: kozak stamps changed shape');
  const skirt: Stamp = { mask: SKIRT[pose.legs === 1 ? 1 : 0] ?? [], x: SKIRT_AT.x, y: SKIRT_AT.y + pose.bob };
  return [legs, skirt, beltEnds, ...upper];
}

/** The kozak's walk with the weight put down: the whole body 1 px lower on the two contact (stride) frames. */
const WALK_WEIGHTED: readonly Pose[] = WALK.map((p) => (p.legs === 1 ? { ...p, bob: 1 } : p));

export const KHARAKTERNYK_FRAMES = { idle: IDLE.length, walk: WALK.length, 'sit-smoke': 2 } as const;

const kharakternyk: SpriteGenerator = {
  atlas: 'people',
  id: 'kharakternyk',
  size: { w: W, h: H },
  frames: KHARAKTERNYK_FRAMES,
  variants: ['a'],
  layers: ['shadow'],
  anchor: { x: 0.5, y: (KOZAK_GROUND + 1) / H },
  generate(_rng, { anim, frame, buffer, layers, rampSize }) {
    const o = KHARAKTERNYK_OUTFIT;
    const plot = new Plot();
    const tools = new Plot();
    const grip = new Plot();
    let span: readonly [number, number] = KOZAK_GEOM.shadow;
    if (anim === 'sit-smoke') {
      const base = cossackPose('sit-smoke', frame, KOZAK_GEOM, INKS);
      const p: CossackPose = { ...base, propsFront: [...base.propsFront, ...lap()] };
      paintCossackAction(plot, tools, grip, o, 'elder', p, KOZAK_PAD);
      paintBehind(plot, tools, sabre(p.drop - p.lift), KOZAK_PAD);
      span = p.shadow;
    } else {
      const pose = (anim === 'walk' ? WALK_WEIGHTED : IDLE)[frame];
      if (!pose) throw new Error(`kharakternyk: no pose for ${anim} ${String(frame)}`);
      paintDoll(
        plot,
        o,
        bodyStamps(pose).map((st) => ({ ...st, x: st.x + KOZAK_PAD })),
      );
      const top = pose.bob + pose.breath;
      paintInks(tools, pipe(top), KOZAK_PAD);
      paintBehind(plot, tools, sabre(pose.bob), KOZAK_PAD);
    }
    compose(buffer, [plot.part(1, 1), tools.part(1, 2), grip.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
      selective: PEOPLE_SELECTIVE,
    });
    const shadow = layers.shadow;
    if (shadow)
      contactShadow(shadow, { x0: span[0] + KOZAK_PAD - 2, x1: span[1] + KOZAK_PAD, groundY: KOZAK_GROUND, height: 3 });
  },
};

export default kharakternyk;
