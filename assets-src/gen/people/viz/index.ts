// Віз з харчем — a food cart drawn by a pair of grey steppe oxen (сіра українська худоба) under one yoke, the farm's
// kharch on its way to the Sich gate (plan M2-20, SPEC §3.0, §6.4; ART-BIBLE §6 «вози»). A plank bed with ladder sides
// (драбини), a big rear and a smaller front wheel (dark iron rim, light hub, four spokes turning + / ×), the pole
// (дишло) up to the yoke (ярмо) right behind the horns; the near ox in front, the far one 2 px up and 4 px on, a tone
// darker, its back line and horns showing over the near one. Warm silver-grey oxen with darker forequarters and neck,
// a dewlap, long cream lyre horns with dark tips, a darker muzzle, a tufted tail.
// Two variants, each drawn in its own direction so the light stays top-left (no mirroring, ART-BIBLE §3): `full` goes
// east to the gate with four lumpy burlap sacks (tied necks, a gold grain tuft) — no brighter than the cart's light
// wood (art-director M2-20: pale sacks were the brightest thing on the night road); `empty` comes back west on a low
// straw bed with wisps through the rails, the far ladder side showing through the rungs. The same wood for both.
// Frames: idle 4@6 (the oxen stand: tail swish, an ear, a nod; wheels still), walk 6@10 (a four-beat ox walk, the
// backs rock 1 px, the spokes alternate + and × a frame). Ramps: plaster (oxen, horns), stone (forequarters, muzzle),
// wood (cart, yoke, horn tips), thatch (sacks, straw), gold (grain), ink (eyes, hooves). 64×32, pivot at the middle of the ground
// row under the wheels and hooves.
import { contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { composeOutlined } from '../../lib/recipes-farm.ts';
import type { RampName, SpriteGenerator } from '../../lib/types.ts';

export const VIZ_W = 64;
const H = 32;
/** The ground row: the outline under the wheel rims and hooves (the pivot row, as for people). */
export const VIZ_GROUND = 29;
/** The last row of the rims and hooves themselves, just above their outline. */
const FOOT_ROW = VIZ_GROUND - 1;
/** Px from the pivot (the canvas middle) to the leading ox's nose: the cart stops this far before the gate. */
export const VIZ_REACH = 32;
export const VIZ_VARIANTS = ['full', 'empty'] as const;
export type VizVariant = (typeof VIZ_VARIANTS)[number];
/** Which way each variant is drawn: full to the Sich (east), empty back to the farm (west). */
export const VIZ_DIRECTION: Readonly<Record<VizVariant, 1 | -1>> = { full: 1, empty: -1 };
export const VIZ_FRAMES = { idle: 4, walk: 6 } as const;

/** Draws in object space: `u` along the cart from its tail (0) to the oxen's noses, mapped to the canvas by direction. */
class Side {
  readonly plot: Plot;
  readonly dir: 1 | -1;

  constructor(plot: Plot, dir: 1 | -1) {
    this.plot = plot;
    this.dir = dir;
  }

  x(u: number): number {
    return this.dir > 0 ? u : VIZ_W - 1 - u;
  }

  set(u: number, y: number, ramp: RampName, shade: number): void {
    this.plot.set(this.x(u), y, ramp, shade);
  }

  /** Whether offset `c` from an object's middle is on the lit (screen-left) side. */
  lit(c: number): boolean {
    return this.dir > 0 ? c < 0 : c > 0;
  }
}

/** Wheel at canvas (cx, cy), radius r: a dark 1-px iron rim, a lighter felloe inside it, four spokes (+ or ×), a light hub. */
function wheel(p: Plot, cx: number, cy: number, r: number, cross: boolean): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r + r) continue;
      if (d2 >= r * r - r) p.set(cx + dx, cy + dy, 'wood', 1);
      else if (d2 >= (r - 1) * (r - 1) - (r - 1)) p.set(cx + dx, cy + dy, 'wood', dx + dy < 0 ? 4 : 3);
    }
  }
  for (let q = 1; q < r - 1; q++) {
    for (const [ax, ay] of cross
      ? ([
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ] as const)
      : ([
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const)) {
      if (cross && q === r - 2) continue;
      p.set(cx + ax * q, cy + ay * q, 'wood', 3);
    }
  }
  p.set(cx, cy, 'wood', 5);
}

/**
 * A lumpy burlap sack standing on the bed: `w` wide, `h` tall, a rounded shoulder, a tied neck 1 px darker and a
 * puckered top; warm mid thatch, the highlight only at its top-left, shade down the right.
 */
function sack(side: Side, cu: number, bottom: number, w: number, h: number, tuft: boolean): void {
  const half = Math.floor(w / 2);
  const shoulder = bottom - h + 3;
  for (let y = shoulder; y <= bottom; y++) {
    const inset = y === shoulder ? 1 : 0;
    for (let c = -half + inset; c <= half - inset; c++) {
      const edgeLit = side.lit(c) && Math.abs(c) === half - inset;
      const edgeDark = !side.lit(c) && Math.abs(c) === half - inset;
      const top = y === shoulder;
      const shade = top && side.lit(c) ? 4 : edgeLit && y <= shoulder + 2 ? 4 : edgeDark || y === bottom ? 2 : 3;
      side.set(cu + c, y, 'thatch', shade);
    }
  }
  // A lump: one px of the side bulges at mid-height.
  side.set(cu + (side.dir > 0 ? half + 1 : -half - 1) * -1, shoulder + 3, 'thatch', 3);
  // Tied neck (darker) and the puckered top above it.
  side.set(cu, shoulder - 1, 'thatch', 2);
  side.set(cu - 1, shoulder - 2, 'thatch', side.lit(-1) ? 3 : 2);
  side.set(cu, shoulder - 2, 'thatch', 3);
  side.set(cu + 1, shoulder - 2, 'thatch', side.lit(1) ? 3 : 2);
  if (tuft) {
    side.set(cu, shoulder - 3, 'gold', 3);
    side.set(cu + 1, shoulder - 4, 'gold', 2);
  }
}

const BED: Readonly<Record<'u0' | 'u1' | 'rail' | 'top' | 'beam', number>> = {
  u0: 0,
  u1: 30,
  rail: 12,
  top: 19,
  beam: 20,
};
const REAR = { u: 6, r: 5 } as const;
const FRONT = { u: 25, r: 4 } as const;

/** The cart: far ladder rail (seen through the rungs when empty), bed, near ladder side, pole. */
function cart(side: Side, variant: VizVariant): void {
  if (variant === 'empty') {
    // The far ladder side through the rungs, and a low straw bed with wisps poking through the near rails.
    for (let u = BED.u0 + 1; u <= BED.u1 - 1; u++) side.set(u, BED.rail + 1, 'wood', 2);
    for (let u = BED.u0 + 1; u <= BED.u1 - 1; u++) {
      side.set(u, BED.top - 1, 'thatch', (u * 7) % 5 === 0 ? 4 : 3);
      if (u % 3 !== 0) side.set(u, BED.top - 2, 'thatch', (u * 3) % 4 === 0 ? 3 : 2);
      if (u % 5 === 2) side.set(u, BED.top - 3, 'thatch', 2);
    }
  }
  // Full: the ladder's rungs and the stakes (стояки) in front of the sacks in dark brown, a rung every 3 px and a
  // middle rail, so the box reads as wood over the load, not one gold block (art-director M2-20).
  const full = variant === 'full';
  for (let u = BED.u0; u <= BED.u1; u++) {
    side.set(u, BED.rail, 'wood', 4);
    if (full) {
      if ((u - BED.u0) % 3 === 1) for (let y = BED.rail + 1; y < BED.top; y++) side.set(u, y, 'wood', 2);
      side.set(u, BED.rail + 3, 'wood', 3);
    } else if ((u - BED.u0) % 4 === 1) for (let y = BED.rail + 1; y < BED.top; y++) side.set(u, y, 'wood', 3);
    side.set(u, BED.top, 'wood', 3);
    side.set(u, BED.beam, 'wood', 2);
  }
  side.set(BED.u0 + 1, BED.rail - 1, 'wood', 4);
  side.set(BED.u1, BED.rail - 1, 'wood', 4);
  if (variant === 'empty') {
    // Stray straw over the top rail.
    for (const u of [7, 16, 23]) side.set(u, BED.rail - 1, 'thatch', 3);
  }
  // Pole (дишло): from under the bed's front up toward the yoke (only its first stretch shows between the oxen).
  for (let k = 0; k <= 8; k++) side.set(BED.u1 + k, BED.beam - Math.floor(k / 3), 'wood', 2);
}

/** The full cart's load: four lumpy sacks standing behind the ladder side, one with a grain tuft. */
function load(side: Side): void {
  sack(side, 5, BED.top - 1, 7, 12, false);
  sack(side, 12, BED.top - 1, 7, 13, true);
  sack(side, 19, BED.top - 1, 7, 12, false);
  sack(side, 26, BED.top - 1, 6, 11, true);
}

/** Foot offset along the body (px) and lift for each step of the six-frame walk (stance 0–3, swing 4–5). */
const FOOT = [2, 1, 0, -1, 0, 2] as const;
const LIFT = [0, 0, 0, 0, 1, 1] as const;

interface OxPose {
  /** Walk step of each leg (near hind, near front, far hind, far front), or null = standing straight. */
  readonly steps: readonly [number, number, number, number] | null;
  /** Rows the back rides up (the walk's rock). */
  readonly bob: number;
  readonly tail: number;
  readonly nod: number;
  readonly ear: boolean;
}

/** A leg from the hip (u, `hip`) to the foot: 2 px wide, the hoof on the ground row. */
function leg(side: Side, u: number, hip: number, step: number | null, ramp: RampName, tone: number): void {
  const du = step === null ? 0 : (FOOT[step % 6] ?? 0);
  const lift = step === null ? 0 : (LIFT[step % 6] ?? 0);
  const foot = FOOT_ROW - lift;
  for (let y = hip; y <= foot; y++) {
    const t = foot === hip ? 1 : (y - hip) / (foot - hip);
    const at = u + Math.round(du * t);
    const hoof = y === foot;
    side.set(at, y, hoof ? 'ink' : ramp, hoof ? 1 : tone);
    side.set(at + 1, y, hoof ? 'ink' : ramp, hoof ? 2 : Math.max(0, tone - 1));
  }
}

/**
 * One ox, its rump at `u0`, back at row `y0`; `tone` 0 = the near one, −1 = the far one (one step darker). Body warm
 * silver-grey (plaster), neck and forequarters darker (stone), head 6 long × 8 tall with a darker muzzle, the lyre horns
 * out of the poll 4 px each way, a dewlap under the throat.
 */
function ox(side: Side, u0: number, y0: number, pose: OxPose, tone: number): void {
  const back = y0 - pose.bob;
  const s = (base: number): number => Math.max(0, base + tone);
  const steps = pose.steps;
  // Legs first: the body covers their tops. The far pair of each ox in shade.
  leg(side, u0 + 5, back + 8, steps ? steps[2] : null, 'stone', s(2));
  leg(side, u0 + 16, back + 8, steps ? steps[3] : null, 'stone', s(2));
  leg(side, u0 + 2, back + 8, steps ? steps[0] : null, 'stone', s(4));
  leg(side, u0 + 13, back + 8, steps ? steps[1] : null, 'stone', s(4));
  // Body: rump to withers, the hump over the forelegs; light back, darker belly; the forequarters in stone.
  for (let u = u0; u <= u0 + 17; u++) {
    const top = back + (u === u0 ? 2 : u === u0 + 1 ? 1 : u >= u0 + 12 && u <= u0 + 15 ? -1 : 0);
    const bottom = back + (u <= u0 + 1 ? 7 : u >= u0 + 15 ? 7 : 8);
    const fore = u >= u0 + 12;
    for (let y = top; y <= bottom; y++) {
      const row = y - top;
      // The back line keeps the near ox's tone on the far one (one step over its darker body), so the far back
      // reads over the cart's shadow (art-director M2-20).
      const back0 = (base: number): number => (row === 0 ? base : s(base));
      if (fore) side.set(u, y, 'stone', row === 0 ? back0(5) : s(y === bottom ? 3 : 4));
      else side.set(u, y, 'plaster', row === 0 ? back0(4) : s(row <= 2 ? 3 : y === bottom ? 1 : 2));
    }
  }
  // Neck (dark stone) down to the lowered head; the dewlap hangs under the throat.
  const head = back + pose.nod;
  for (let u = u0 + 18; u <= u0 + 20; u++)
    for (let y = head; y <= head + 6; y++) side.set(u, y, 'stone', s(y === head ? 4 : 3));
  for (let u = u0 + 16; u <= u0 + 21; u++) side.set(u, back + 8 + (u >= u0 + 19 ? 0 : 1), 'stone', s(2));
  side.set(u0 + 19, back + 9, 'stone', s(2));
  // Head: 5 wide (u0+21…25), 8 tall from the poll down to the muzzle; forehead lighter, muzzle dark.
  for (let u = u0 + 21; u <= u0 + 25; u++) {
    for (let y = head + 1; y <= head + 8; y++) {
      if (u === u0 + 25 && y <= head + 2) continue;
      const muzzle = y >= head + 6 && u >= u0 + 23;
      side.set(u, y, 'stone', s(muzzle ? 1 : y <= head + 2 ? 5 : 4));
    }
  }
  side.set(u0 + 23, head + 3, 'ink', 0);
  // Ear flat back over the neck (it flicks up in an idle frame).
  side.set(u0 + 20, head + (pose.ear ? 0 : 1), 'stone', s(3));
  // Lyre horns from the poll: one back, one forward, each 4 px out and curving up, cream with a dark tip.
  const horn: readonly (readonly [number, number, 'bone' | 'tip'])[] = [
    [21, 0, 'bone'],
    [20, -1, 'bone'],
    [19, -2, 'bone'],
    [19, -3, 'tip'],
    [23, 0, 'bone'],
    [24, -1, 'bone'],
    [25, -2, 'bone'],
    [25, -3, 'tip'],
  ];
  for (const [du, dy, part] of horn) {
    // A dark-brown wood tip, not ink: an ink tip merged with the outline and the horn read short at 360.
    if (part === 'tip') side.set(u0 + du, head + dy, 'wood', 1);
    else side.set(u0 + du, head + dy, 'plaster', s(dy === 0 ? 5 : 6));
  }
  // Tail from the rump down to a dark tuft; it swishes in the idle.
  for (let y = back + 2; y <= back + 7; y++) side.set(u0 - 1 + (y >= back + 6 ? pose.tail : 0), y, 'plaster', s(1));
  side.set(u0 - 1 + pose.tail, back + 8, 'stone', s(1));
  side.set(u0 - 2 + pose.tail, back + 8, 'stone', s(1));
}

/** The yoke: a 1-px bar down the near ox's neck right behind the horns, and the bow under the throat. */
function yoke(side: Side, u: number, top: number): void {
  for (let y = top; y <= top + 6; y++) side.set(u, y, 'wood', y === top ? 4 : 3);
  side.set(u + 1, top + 7, 'wood', 2);
  side.set(u + 2, top + 8, 'wood', 2);
}

const OX = { u: 34, back: 15 } as const;
/** The far ox: 4 px on and 2 px up, so its horns and back line show over the near one. */
const FAR = { du: 4, dy: -2 } as const;

const viz: SpriteGenerator = {
  atlas: 'people',
  id: 'viz',
  size: { w: VIZ_W, h: H },
  frames: VIZ_FRAMES,
  variants: VIZ_VARIANTS,
  layers: ['shadow'],
  anchor: { x: 0.5, y: (VIZ_GROUND + 1) / H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const v: VizVariant = variant === 'empty' ? 'empty' : 'full';
    const side = new Side(new Plot(), VIZ_DIRECTION[v]);
    const walking = anim === 'walk';
    const f = frame;
    const steps = (offset: number): readonly [number, number, number, number] => [
      f + offset,
      f + offset + 2,
      f + offset + 3,
      f + offset + 5,
    ];
    const idleTail = [0, 0, 1, 0][f % 4] ?? 0;
    const near: OxPose = walking
      ? { steps: steps(0), bob: f % 3 === 1 ? 1 : 0, tail: f % 6 < 3 ? 0 : 1, nod: f % 3 === 1 ? 0 : 1, ear: false }
      : { steps: null, bob: 0, tail: idleTail, nod: f === 3 ? 1 : 0, ear: f === 1 };
    const far: OxPose = walking
      ? { steps: steps(3), bob: f % 3 === 2 ? 1 : 0, tail: f % 6 < 3 ? 1 : 0, nod: f % 3 === 2 ? 0 : 1, ear: false }
      : { steps: null, bob: 0, tail: 0, nod: f === 1 ? 1 : 0, ear: f === 2 };
    // Back to front: far ox, the load and the cart, the near ox, its yoke, the wheels.
    ox(side, OX.u + FAR.du, OX.back + FAR.dy, far, -1);
    if (v === 'full') load(side);
    cart(side, v);
    ox(side, OX.u, OX.back, near, 0);
    yoke(side, OX.u + 19, OX.back - 1 + near.nod - near.bob);
    const cross = walking && f % 2 === 1;
    wheel(side.plot, side.x(REAR.u), FOOT_ROW - REAR.r, REAR.r, cross);
    wheel(side.plot, side.x(FRONT.u), FOOT_ROW - FRONT.r, FRONT.r, cross);
    composeOutlined(buffer, [side.plot.part(1, 1)], rampSize);
    if (layers.shadow) {
      const a = side.x(REAR.u - REAR.r);
      const b = side.x(OX.u + 25);
      contactShadow(layers.shadow, { x0: Math.min(a, b), x1: Math.max(a, b) + 1, groundY: VIZ_GROUND, height: 4 });
    }
  },
};

export default viz;
