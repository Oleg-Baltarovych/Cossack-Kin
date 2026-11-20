// The Sich's poses (plan M2-19, SPEC §6.4, ART-BIBLE §7) for the Cossack body (kozak, vartovyi): each animation is a
// choreography in body terms (shoulders, pivot column, ground row; people/work.ts), the musket, pipe, spear and torch
// drawn as 1-px tools without an outline (an outlined 1-px line reads 3 px wide), the log as an outlined prop.
//
// `drill` — the musket drill in the ranks (order → present → raise → port, the musket ~20 px: a man's height and a
// half span), `sit-smoke` — on a log by the fire with a люлька (pipe at the mouth, ember on the bowl; then lowered to
// the knee, a puff of smoke), `cheer` — both arms up (the «Слава!» after the otaman's word); the guards' `watch` — on the
// spear, breathing — and `torch` — a burning torch held up (flame on the base frame and on the @emissive layer, 4
// frames), the spear behind the body.
import type { RampName } from '../lib/buffer.ts';
import { line, type BodyGeom, type Ink, type Pt } from './work.ts';

/** Lower body: standing, a wide stance, or seated (on a log). */
export type CossackLower = 'stand' | 'stance' | 'sit';

export interface CossackPose {
  readonly lower: CossackLower;
  /** Upper body moved down (sitting), px. */
  readonly drop: number;
  /** Upper body moved forward (right), px. */
  readonly lean: number;
  /** Shoulders and head lifted (breath, cheer hop), px up. */
  readonly lift: number;
  /** Шлик / оселедець: 0 hangs, 1 lifted. */
  readonly drift: number;
  /** Near hand (body-local); `null` = the arm hangs. */
  readonly near: Pt | null;
  /** Far hand, behind the body; `null` = hidden. */
  readonly far: Pt | null;
  /** Outlined props painted before the body (the log). */
  readonly props: readonly Ink[];
  readonly propsFront: readonly Ink[];
  /** 1-px tools over everything (musket, pipe, torch, smoke). */
  readonly tools: readonly Ink[];
  /** 1-px tools behind the body: drawn only where the body is not (the guard's spear in the far hand). */
  readonly behind: readonly Ink[];
  /** Px painted over the gripping hand (the pipe's bowl held in the fist). */
  readonly overGrip: readonly Ink[];
  /** Px of the night mask (@emissive): the torch flame. */
  readonly glow: readonly Ink[];
  /** Contact shadow span [x0, x1) on the ground row. */
  readonly shadow: readonly [number, number];
}

/** Tool inks a body can use without a new ramp (dark … light shades). */
export interface CossackInks {
  /** Stock, log, pipe, spear shaft, torch stick. */
  readonly wood: { readonly ramp: RampName; readonly shades: readonly [number, number, number] };
  /** Barrel, spearhead. */
  readonly metal: { readonly ramp: RampName; readonly shades: readonly [number, number, number] };
  /** Pipe smoke: [far, near]. */
  readonly smoke: { readonly ramp: RampName; readonly shades: readonly [number, number] };
  /** The pipe's ember. */
  readonly ember: { readonly ramp: RampName; readonly shade: number };
}

/** The flame's inks (guards): core, body, tip. */
export interface FlameInks {
  readonly core: { readonly ramp: RampName; readonly shade: number };
  readonly body: { readonly ramp: RampName; readonly shades: readonly [number, number] };
  readonly tip: { readonly ramp: RampName; readonly shade: number };
}

const ink = (p: Pt, ramp: RampName, shade: number): Ink => ({ x: p.x, y: p.y, ramp, shade });
const at = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });

const pose = (g: BodyGeom, p: Partial<CossackPose>): CossackPose => ({
  lower: 'stand',
  drop: 0,
  lean: 0,
  lift: 0,
  drift: 0,
  near: null,
  far: null,
  props: [],
  propsFront: [],
  tools: [],
  behind: [],
  overGrip: [],
  glow: [],
  shadow: g.shadow,
  ...p,
});

/**
 * A musket from its butt to its muzzle, 2 px wide (art-director M2-19: a 1-px barrel vanished at 13:00): the stock
 * (a dark butt plate, 5 px of wood, its back edge a shade darker), then the barrel — a dark core with a 1-px steel
 * highlight on its lit (left) side, a light muzzle px.
 */
function musket(butt: Pt, muzzle: Pt, t: CossackInks): Ink[] {
  const [wd, wm] = t.wood.shades;
  const [md, mm, ml] = t.metal.shades;
  const pts = line(butt, muzzle);
  const edge = pts.map((p, i) =>
    i < 5 ? ink(at(p, -1, 0), t.wood.ramp, wd) : ink(at(p, -1, 0), t.metal.ramp, i === pts.length - 1 ? ml : mm),
  );
  const core = pts.map((p, i) =>
    i === 0 ? ink(p, t.wood.ramp, wd) : i < 6 ? ink(p, t.wood.ramp, wm) : ink(p, t.metal.ramp, md),
  );
  return [...edge, ...core];
}

/**
 * The musket drill (4 frames): order (butt by the boot), present (lifted before the chest), raise (held up, muzzle
 * high over the head), port (across the chest). Positions relative to the near shoulder and the ground.
 */
function drill(g: BodyGeom, t: CossackInks, f: number): CossackPose {
  const k = [
    { hand: [2, 5], butt: [5, 0], muzzle: [5, -19] },
    { hand: [1, 5], butt: [4, -3], muzzle: [4, -22] },
    { hand: [3, 1], butt: [6, -5], muzzle: [6, -24] },
    { hand: [1, 4], butt: [1, -5], muzzle: [8, -23] },
  ][f];
  if (!k) throw new Error(`drill: no frame ${String(f)}`);
  const hand = at(g.near, k.hand[0] ?? 0, k.hand[1] ?? 0);
  const butt = { x: g.cx + (k.butt[0] ?? 0), y: g.ground + (k.butt[1] ?? 0) };
  const muzzle = { x: g.cx + (k.muzzle[0] ?? 0), y: g.ground + (k.muzzle[1] ?? 0) };
  return pose(g, {
    near: hand,
    tools: musket(butt, muzzle, t),
    shadow: [g.shadow[0], Math.max(g.shadow[1], butt.x + 2)],
  });
}

/** A short log under a seated Cossack: lit top, dark bark below, a pale cut end on the left. */
function log(g: BodyGeom, t: CossackInks): Ink[] {
  const [d, m, l] = t.wood.shades;
  const x0 = g.cx - 7;
  const y0 = g.ground - 2;
  const out: Ink[] = [];
  for (let x = x0; x < x0 + 10; x++) {
    out.push(ink({ x, y: y0 }, t.wood.ramp, l));
    out.push(ink({ x, y: y0 + 1 }, t.wood.ramp, m));
    out.push(ink({ x, y: y0 + 2 }, t.wood.ramp, d));
  }
  return out;
}

/**
 * Seated on a log with a люлька (2 frames): the pipe at the mouth, the bowl in the fist and its ember glowing, a thin
 * wisp over it; then the hand lowered to the knee and a puff of smoke drifting up from the mouth.
 */
function smoke(g: BodyGeom, t: CossackInks, f: number): CossackPose {
  const drop = g.sitDrop;
  const mouth = { x: g.cx + 4, y: g.near.y - 4 + drop };
  const [wd, wm] = t.wood.shades;
  const [far, near] = t.smoke.shades;
  if (f === 0) {
    const hand = at(mouth, 3, 3);
    return pose(g, {
      lower: 'sit',
      drop,
      near: hand,
      props: log(g, t),
      tools: [
        ink(at(mouth, 1, 0), t.wood.ramp, wm),
        ink(at(mouth, 2, 0), t.wood.ramp, wm),
        ink(at(mouth, 3, -1), t.smoke.ramp, far),
      ],
      overGrip: [
        ink(at(mouth, 3, 1), t.wood.ramp, wd),
        ink(at(mouth, 3, 0), t.ember.ramp, t.ember.shade),
        ink(at(mouth, 4, 1), t.wood.ramp, wd),
      ],
      shadow: [g.shadow[0] - 2, g.cx + 8],
    });
  }
  const hand = { x: g.cx + 6, y: g.ground - 6 };
  return pose(g, {
    lower: 'sit',
    drop,
    lift: 1,
    near: hand,
    props: log(g, t),
    tools: [
      ink(at(mouth, 2, -1), t.smoke.ramp, near),
      ink(at(mouth, 3, -2), t.smoke.ramp, near),
      ink(at(mouth, 2, -3), t.smoke.ramp, far),
      ink(at(mouth, 3, -4), t.smoke.ramp, far),
    ],
    overGrip: [
      ink(at(hand, 0, -1), t.wood.ramp, wd),
      ink(at(hand, 1, -1), t.wood.ramp, wd),
      ink(at(hand, 0, -2), t.ember.ramp, t.ember.shade),
      ink(at(hand, -1, -1), t.wood.ramp, wm),
    ],
    shadow: [g.shadow[0] - 2, g.cx + 8],
  });
}

/** Cheer: both arms up, a hop of the shoulders, wave, arms half down (4 frames). */
function cheer(g: BodyGeom, f: number): CossackPose {
  const k = [
    { lift: 0, near: [4, -8], far: [-3, -8] },
    { lift: 1, near: [5, -9], far: [-4, -8] },
    { lift: 0, near: [4, -8], far: [-3, -8] },
    { lift: 0, near: [5, -4], far: [-4, -4] },
  ][f];
  if (!k) throw new Error(`cheer: no frame ${String(f)}`);
  return pose(g, {
    lift: k.lift,
    drift: k.lift,
    near: at(g.near, k.near[0] ?? 0, (k.near[1] ?? 0) - k.lift),
    far: at(g.far, k.far[0] ?? 0, (k.far[1] ?? 0) - k.lift),
  });
}

/** A spear: shaft from the ground to `top`, a 3-px leaf head above it. */
function spear(x: number, g: BodyGeom, top: number, t: CossackInks): Ink[] {
  const [, wm, wl] = t.wood.shades;
  const [md, , ml] = t.metal.shades;
  const shaft = Array.from({ length: g.ground - top + 1 }, (_, i) =>
    ink({ x, y: g.ground - i }, t.wood.ramp, i % 4 === 0 ? wl : wm),
  );
  return [
    ...shaft,
    ink({ x, y: top - 1 }, t.metal.ramp, md),
    ink({ x, y: top - 2 }, t.metal.ramp, ml),
    ink({ x, y: top - 3 }, t.metal.ramp, ml),
  ];
}

/** The guard on his spear (2 frames @2): the shaft before him in the near hand, the shoulders breathe. */
function watch(g: BodyGeom, t: CossackInks, f: number): CossackPose {
  const lift = f === 1 ? 1 : 0;
  const x = g.cx + 5;
  return pose(g, {
    lift,
    drift: lift,
    near: { x, y: g.near.y + 4 - lift },
    tools: spear(x, g, -4, t),
    shadow: [g.shadow[0], Math.max(g.shadow[1], x + 2)],
  });
}

/** Flame columns per frame: heights over the torch head [left, middle, right] and the tip's lean. */
const FLAMES = [
  { h: [2, 5, 3], lean: 0 },
  { h: [3, 4, 2], lean: 1 },
  { h: [2, 6, 2], lean: 0 },
  { h: [2, 4, 3], lean: -1 },
] as const;

/** A torch flame over `head` (the tarred top): a 3-px-wide tongue, core low, tips leaning per frame. */
function flame(head: Pt, f: number, fl: FlameInks): Ink[] {
  const k = FLAMES[f % FLAMES.length];
  if (!k) return [];
  const out: Ink[] = [];
  k.h.forEach((h, i) => {
    for (let r = 0; r < h; r++) {
      const frac = r / h;
      const x = head.x - 1 + i + (r >= 3 ? k.lean : 0);
      const y = head.y - 1 - r;
      if (i === 1 && r < 2) out.push(ink({ x, y }, fl.core.ramp, fl.core.shade));
      else if (frac < 0.6) out.push(ink({ x, y }, fl.body.ramp, r === 0 ? fl.body.shades[1] : fl.body.shades[0]));
      else out.push(ink({ x, y }, fl.tip.ramp, fl.tip.shade));
    }
  });
  return out;
}

/**
 * The guard's torch (4 frames @8): the near hand raised before him with the torch — stick, tarred head, a flame that
 * flickers frame to frame (base frame and night mask) — the spear upright behind the body in the far hand.
 */
function torch(g: BodyGeom, t: CossackInks, fl: FlameInks, f: number): CossackPose {
  const hand = at(g.near, 3, -4);
  const [wd, wm] = t.wood.shades;
  const head = at(hand, 0, -3);
  const fire = flame(head, f, fl);
  return pose(g, {
    near: hand,
    tools: [
      ink(at(hand, 0, -1), t.wood.ramp, wm),
      ink(at(hand, 0, -2), t.wood.ramp, wm),
      ink(head, t.wood.ramp, wd),
      ...fire,
    ],
    behind: spear(g.cx - 3, g, -4, t),
    // The flame, and the tarred head it burns on, light at night (post-grade): the warmest px of the frame.
    glow: [...fire, ink(head, fl.tip.ramp, fl.tip.shade)],
  });
}

/** The rank-and-file Cossack's animations beyond walk/idle (content COSSACK_ANIMS: drill 4 @8, sit-smoke 2 @2, cheer 4 @10). */
export const COSSACK_FRAMES = { drill: 4, 'sit-smoke': 2, cheer: 4 } as const;
export type CossackAction = keyof typeof COSSACK_FRAMES;
export const isCossackAction = (anim: string): anim is CossackAction => anim in COSSACK_FRAMES;

/** The guards' (content GUARD_ANIMS: watch 2 @2, torch 4 @8). */
export const GUARD_FRAMES = { watch: 2, torch: 4 } as const;
export type GuardAction = keyof typeof GUARD_FRAMES;
export const isGuardAction = (anim: string): anim is GuardAction => anim in GUARD_FRAMES;

/** The pose of a Cossack's `anim` frame `f`. */
export function cossackPose(anim: CossackAction, f: number, g: BodyGeom, t: CossackInks): CossackPose {
  switch (anim) {
    case 'drill':
      return drill(g, t, f);
    case 'sit-smoke':
      return smoke(g, t, f);
    case 'cheer':
      return cheer(g, f);
  }
}

/** The pose of a guard's `anim` frame `f`. */
export function guardPose(anim: GuardAction, f: number, g: BodyGeom, t: CossackInks, fl: FlameInks): CossackPose {
  return anim === 'watch' ? watch(g, t, f) : torch(g, t, fl, f);
}
