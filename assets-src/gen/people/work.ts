// Villagers' work, talk, sit and cheer poses (plan M2-17, SPEC §6.4, ART-BIBLE §7). Shared by the two village bodies
// — the woman (selianka) and the man (selianyn): each animation is a choreography in body terms (shoulders, pivot
// column, ground row), so one table drives both dolls. A frame is the body (lower half by kind, upper half dropped and
// leaned), the near arm drawn as a sleeve from the shoulder to the hand, an optional far arm behind the body, outlined
// props that stand on the ground (stool, anvil, wheel, bucket, basket, bellows) and 1-px tools without an outline
// (snath, blade, handle — an outlined 1-px line reads 3 px wide, ART-15 ribbons). Tools use only ramps every outfit
// of the body already has (wood, plaster, + thatch for the man / crimson for the woman), so no frame adds a ramp.
//
// Animation keys (frame names `<entity>.<variant>/<key>/<nn>`): `work-<building>` for the five workplaces
// (field — mow with a scythe / reap with a sickle; apiary — lift honeycombs into a pail; smithy — strike the anvil /
// pump the bellows; potter — throw a pot at the kick wheel; fair — offer a jug over a basket), `talk`, `sit`, `cheer`.
import type { RampName } from '../lib/buffer.ts';
import type { Outfit } from '../lib/doll.ts';
import type { Plot } from '../lib/plot.ts';

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** One px of a tool or prop (body-local coordinates). */
export interface Ink extends Pt {
  readonly ramp: RampName;
  readonly shade: number;
}

/** Lower body: standing, a wide working stance, or seated on a stool (the stool is a prop of the pose). */
export type Lower = 'stand' | 'stance' | 'sit';

export interface WorkPose {
  readonly lower: Lower;
  /** Upper body moved down (bending, sitting), px. */
  readonly drop: number;
  /** Upper body moved forward (right), px. */
  readonly lean: number;
  /** Hips (belt and the top of the skirt / coat) moved forward with the swing, px. */
  readonly hip: number;
  /** Shoulders and head lifted (breath, nod, cheer hop), px up. */
  readonly lift: number;
  /** Near hand (absolute, body-local); `null` = the arm hangs (the body's own idle arm). */
  readonly near: Pt | null;
  /** Far hand, drawn behind the body; `null` = hidden. */
  readonly far: Pt | null;
  /** Outlined props on the ground, painted before the body (behind it). */
  readonly props: readonly Ink[];
  /** Outlined props painted over the body (in front). */
  readonly propsFront: readonly Ink[];
  /** 1-px tools, no outline, over everything. */
  readonly tools: readonly Ink[];
  /** Contact shadow span [x0, x1) on the ground row. */
  readonly shadow: readonly [number, number];
}

/** A body's joints in its standing pose (body-local px; the sprite pads these by its own margin). */
export interface BodyGeom {
  /** Ground row (soles). */
  readonly ground: number;
  /** Pivot column. */
  readonly cx: number;
  /** Near (right) shoulder: where the sleeve starts. */
  readonly near: Pt;
  /** Far (left) shoulder. */
  readonly far: Pt;
  /** Shoulder-to-hand reach of a hanging arm. */
  readonly reach: number;
  /** How far the upper body sinks when seated on the stool. */
  readonly sitDrop: number;
  /** Contact shadow span of the bare standing body [x0, x1). */
  readonly shadow: readonly [number, number];
}

/** Ramps for tool materials, chosen per body from ramps all its outfits share. */
export interface ToolInks {
  /** Handles, stool, pail, stump: dark … light. */
  readonly wood: RampName;
  /** Lightest wood shade a tool may use: the outfits' hair and boots stop there, so wooden tools add no colour. */
  readonly woodTop: number;
  /** Steel (blade, hammer head, anvil): a cool grey ramp, shades dark … light. */
  readonly metal: { readonly ramp: RampName; readonly shades: readonly [number, number, number] };
  /** Honeycomb, wheat, goods: [ramp, base shade, light shade]. */
  readonly honey: { readonly ramp: RampName; readonly shades: readonly [number, number] };
  /** Clay ware (pot, jug): shades dark, base, light. */
  readonly clay: { readonly ramp: RampName; readonly shades: readonly [number, number, number] };
  /** Glowing iron and sparks. */
  readonly hot: { readonly ramp: RampName; readonly shade: number };
}

/** Integer line from a to b inclusive (Bresenham), deterministic. */
export function line(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

const at = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });
const ink = (p: Pt, ramp: RampName, shade: number): Ink => ({ x: p.x, y: p.y, ramp, shade });
const rect = (
  x0: number,
  y0: number,
  w: number,
  h: number,
  ramp: RampName,
  shade: (x: number, y: number) => number,
): Ink[] => {
  const out: Ink[] = [];
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) out.push({ x, y, ramp, shade: shade(x - x0, y - y0) });
  return out;
};

/**
 * Paints a sleeve from `shoulder` to `hand` and the hand. A steep arm is 2 px wide (inner column shaded), a flat one
 * 2 px tall (lower row shaded); the hand is 2 px of skin across the sleeve's width. `far` uses the shaded tones.
 */
export function paintArm(
  plot: Plot,
  outfit: Outfit,
  shoulder: Pt,
  hand: Pt,
  far: boolean,
  ox: number,
  /** Also gets the hand px (a grip painted over the tool it holds). */
  grip?: Plot,
): void {
  const pts = line(shoulder, hand);
  const steep = Math.abs(hand.y - shoulder.y) >= Math.abs(hand.x - shoulder.x);
  const { shirt, skin } = outfit;
  const [lit, base] = far ? [1, 1] : [2, 1];
  const set = (p: Pt, ramp: RampName, shade: number): void => {
    plot.set(p.x + ox, p.y, ramp, shade);
  };
  pts.slice(0, -1).forEach((p) => {
    set(p, shirt.ramp, shirt.tones[lit] ?? 0);
    set(steep ? at(p, -1, 0) : at(p, 0, 1), shirt.ramp, shirt.tones[base] ?? 0);
  });
  const palm = steep ? at(hand, -1, 0) : at(hand, 0, 1);
  for (const target of grip ? [plot, grip] : [plot]) {
    // Light skin tones for both hands: darker ones read as gloves (art-director M2-17).
    target.set(hand.x + ox, hand.y, skin.ramp, skin.tones[3]);
    target.set(palm.x + ox, palm.y, skin.ramp, skin.tones[2]);
  }
}

/** Paints inks (body-local) into `plot`, shifted right by `ox`. */
export function paintInks(plot: Plot, inks: readonly Ink[], ox: number): void {
  for (const p of inks) plot.set(p.x + ox, p.y, p.ramp, p.shade);
}

// ── props and tools ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Low stool (дзиґлик) under a seated body: seat and two legs; the seat hides under the hips. Legs 2 px (lit left):
 * an outlined 1-px leg is 3 px wide, which the moon rim treats as a thin strand and dims below its top (M2-29 A5:
 * the stool by the khata keeps its moonlit corner).
 */
function stool(g: BodyGeom, t: ToolInks): Ink[] {
  const seat = g.ground - 4;
  const x0 = g.cx - 5;
  return [
    ...rect(x0, seat, 8, 1, t.wood, (x) => (x === 0 ? 4 : 3)),
    ...rect(x0, seat + 1, 8, 1, t.wood, () => 1),
    ...[x0, x0 + 6].flatMap((x) => rect(x, seat + 2, 2, 3, t.wood, (dx, y) => (y === 0 ? 1 : dx === 0 ? 3 : 2))),
  ];
}

/** Wooden pail (цебрик) on the ground at x0: 5 wide, staves lit left, two iron hoops. */
function pail(x0: number, g: BodyGeom, t: ToolInks, full: boolean): Ink[] {
  const top = g.ground - 3;
  // Staves (alternate shades, lit left) bound by two iron hoops (діжечка, art-director M2-17).
  const body = rect(x0, top, 5, 4, t.wood, (x) => (x === 0 ? 3 : x % 2 === 0 ? 2 : 3));
  const rim = [
    ...rect(x0, top, 5, 1, t.wood, () => 3),
    ...rect(x0, top + 1, 5, 1, t.metal.ramp, () => t.metal.shades[0]),
    ...rect(x0, top + 3, 5, 1, t.metal.ramp, () => t.metal.shades[0]),
  ];
  const honey = full
    ? rect(x0 + 1, top - 1, 3, 1, t.honey.ramp, (x) => (x === 0 ? t.honey.shades[1] : t.honey.shades[0]))
    : [];
  return [...body, ...rim, ...honey];
}

/** Honeycomb slab 2×3 under/beside the hand: lit cells and darker cells in a checker. */
function comb(p: Pt, t: ToolInks): Ink[] {
  return rect(p.x, p.y, 2, 3, t.honey.ramp, (x, y) => ((x + y) % 2 === 0 ? t.honey.shades[1] : t.honey.shades[0]));
}

/** Wicker basket at x0 with goods heaped on top (loaves / pots). */
function basket(x0: number, g: BodyGeom, t: ToolInks): Ink[] {
  const top = g.ground - 2;
  return [
    ...rect(x0, top, 6, 3, t.wood, (x, y) => (y === 0 ? 4 : (x + y) % 2 === 0 ? 3 : 2)),
    ...rect(x0 + 1, top - 1, 4, 1, t.honey.ramp, (x) => (x === 0 ? t.honey.shades[1] : t.honey.shades[0])),
    ...rect(x0 + 2, top - 2, 2, 1, t.honey.ramp, (x) => (x === 0 ? t.honey.shades[1] : t.honey.shades[0])),
  ];
}

/** Clay jug (глечик) 3 wide hanging from the hand: neck, belly lit left, dark base. */
function jug(hand: Pt, t: ToolInks): Ink[] {
  const [d, m, l] = t.clay.shades;
  const x = hand.x - 1;
  const y = hand.y + 1;
  return [
    ink({ x: x + 1, y }, t.clay.ramp, m),
    ink({ x: x + 2, y }, t.clay.ramp, d),
    ...rect(x, y + 1, 4, 3, t.clay.ramp, (dx, dy) => (dx === 0 ? l : dx === 3 || dy === 2 ? d : m)),
    ...rect(x + 1, y + 4, 2, 1, t.clay.ramp, () => d),
  ];
}

/** Anvil on a stump: stump from the ground, anvil block with a lit face and a horn toward the front. */
function anvil(x0: number, top: number, g: BodyGeom, t: ToolInks): Ink[] {
  const [d, m, l] = t.metal.shades;
  return [
    ...rect(x0 + 1, top + 3, 5, g.ground - top - 2, t.wood, (x) => (x === 0 ? 3 : x === 4 ? 1 : 2)),
    ...rect(x0, top, 7, 1, t.metal.ramp, (x) => (x < 2 ? l : m)),
    ...rect(x0 + 7, top, 1, 1, t.metal.ramp, () => m),
    ...rect(x0, top + 1, 7, 1, t.metal.ramp, (x) => (x === 0 ? m : d)),
    ...rect(x0 + 2, top + 2, 3, 1, t.metal.ramp, () => d),
  ];
}

/** Hammer: handle from the hand to the head, a 2×2 head. */
function hammer(hand: Pt, head: Pt, t: ToolInks): Ink[] {
  const [d, , l] = t.metal.shades;
  return [
    ...line(hand, head)
      .slice(1)
      .map((p) => ink(p, t.wood, 3)),
    ink(head, t.metal.ramp, l),
    ink(at(head, 1, 0), t.metal.ramp, l),
    ink(at(head, 0, 1), t.metal.ramp, d),
    ink(at(head, 1, 1), t.metal.ramp, d),
  ];
}

/**
 * Scythe (коса): the snath runs from the blade's heel through the hand and 3 px past it; the blade lies along the
 * heel's row back toward the mower (left), its tip lifted a row.
 */
function scythe(hand: Pt, heel: Pt, t: ToolInks): Ink[] {
  const [d, m, l] = t.metal.shades;
  const dx = hand.x - heel.x;
  const dy = hand.y - heel.y;
  const len = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  // A snath is nearly the mower's height: it runs on past the hand to ~16 px in all.
  const more = Math.max(3, 16 - len);
  const past = { x: hand.x + Math.round((dx * more) / len), y: hand.y + Math.round((dy * more) / len) };
  const snath = line(heel, past).map((p, i) => ink(p, t.wood, i % 3 === 0 ? 3 : 2));
  // Two rows so it survives at phone size: a light spine over a dark cutting edge; the tip lifts a row.
  const edge = [1, 2, 3, 4, 5, 6, 7].map((i) => ink({ x: heel.x - i, y: heel.y - (i >= 6 ? 1 : 0) }, t.metal.ramp, d));
  const spine = [1, 2, 3, 4, 5].map((i) =>
    ink({ x: heel.x - i, y: heel.y - 1 - (i >= 5 ? 1 : 0) }, t.metal.ramp, i <= 2 ? l : m),
  );
  return [...edge, ...spine, ...snath];
}

/** Sickle (серп): a short handle down from the hand, the hooked blade curving forward and up. */
function sickle(hand: Pt, t: ToolInks): Ink[] {
  const [, m, l] = t.metal.shades;
  const h = at(hand, 0, 1);
  return [
    ink(h, t.wood, 2),
    ink(at(h, 1, 1), t.metal.ramp, m),
    ink(at(h, 2, 1), t.metal.ramp, l),
    ink(at(h, 3, 0), t.metal.ramp, l),
    ink(at(h, 3, -1), t.metal.ramp, m),
    ink(at(h, 2, -2), t.metal.ramp, m),
  ];
}

/** A tuft of standing wheat at x0 (3 stalks, ears lit) of `height` rows; `cut` leaves stubble. */
function wheat(x0: number, g: BodyGeom, t: ToolInks, height: number): Ink[] {
  const [base, light] = t.honey.shades;
  return [0, 2, 4].flatMap((dx, i) => {
    const h = height - (i === 1 ? 0 : 1);
    return Array.from({ length: h }, (_, k) =>
      ink({ x: x0 + dx, y: g.ground - k }, t.honey.ramp, k >= h - 2 ? light : base),
    );
  });
}

/** Kick wheel (гончарний круг): the head disc at `headY`, the shaft, the kick wheel on the ground with a turning spoke. */
function wheel(g: BodyGeom, t: ToolInks, headY: number, turn: number): Ink[] {
  const x0 = g.cx + 4;
  const spoke = (x: number): boolean => x === (turn * 3) % 11 || x === (turn * 3 + 5) % 11;
  return [
    ...rect(x0 - 1, g.ground - 2, 11, 3, t.wood, (x, y) =>
      y === 0 ? (spoke(x) ? 1 : x === 0 ? 4 : 3) : y === 1 ? 2 : 1,
    ),
    ...rect(x0 + 4, headY + 1, 1, g.ground - headY - 3, t.wood, () => 1),
    ...rect(x0 + 1, headY, 7, 2, t.wood, (x, y) => (y === 1 ? 1 : x === 0 ? 4 : 3)),
  ];
}

/** The pot on the wheel head growing as it is thrown: 0 lump … 3 tall pot with a rim. */
function pot(g: BodyGeom, t: ToolInks, headY: number, stage: number): Ink[] {
  const cx = g.cx + 8;
  const shapes: readonly (readonly [number, number])[][] = [
    [[-1, 3]],
    [
      [-1, 3],
      [-1, 3],
    ],
    [
      [-1, 3],
      [-2, 5],
      [-1, 3],
    ],
    [
      [-1, 3],
      [-2, 5],
      [-2, 5],
      [-1, 3],
    ],
  ];
  const rows = shapes[stage] ?? shapes[0] ?? [];
  const [d, m, l] = t.clay.shades;
  return rows.flatMap(([dx, w], i) =>
    rect(cx + dx, headY - rows.length + i, w, 1, t.clay.ramp, (x) => (x === 0 ? l : x === w - 1 ? d : m)),
  );
}

/** Bellows top edge row at column x for an opening of `open` px (the boards meet at the nozzle). */
const bellowsGeom = (g: BodyGeom, open: number) => {
  const x0 = g.cx + 5;
  const x1 = g.cx + 13;
  const base = g.ground - 5;
  const lift = 2 + open;
  const topAt = (x: number): number => base - 1 - Math.round((lift * (x1 - x)) / (x1 - x0));
  return { x0, x1, base, topAt };
};

/**
 * Bellows (міх) on a low trestle: a leather wedge with dark pleats between a lit top board and the bottom board,
 * narrowing to an iron nozzle at the hearth side; a handle rises from the wide end. `open` 0–2 squashes / stretches it.
 */
function bellows(g: BodyGeom, t: ToolInks, open: number): Ink[] {
  const { x0, x1, base, topAt } = bellowsGeom(g, open);
  const out: Ink[] = [];
  for (const x of [x0 + 1, x1 - 1]) out.push(...rect(x, base + 1, 1, g.ground - base, t.wood, () => 1));
  for (let x = x0; x <= x1; x++) {
    const top = topAt(x);
    out.push(ink({ x, y: base }, t.wood, 2));
    for (let y = top + 1; y < base; y++) out.push(ink({ x, y }, t.wood, x % 2 === 0 ? 0 : 1));
    out.push(ink({ x, y: top }, t.wood, 3));
  }
  out.push(ink({ x: x1 + 1, y: base - 1 }, t.metal.ramp, t.metal.shades[2]));
  out.push(ink({ x: x1 + 2, y: base - 1 }, t.metal.ramp, t.metal.shades[0]));
  out.push(ink({ x: x1 + 1, y: base }, t.metal.ramp, t.metal.shades[0]));
  return out;
}

/** The handle on the bellows' wide end: an upright stick of 2 px on the top board's corner, gripped on top. */
function bellowsHandle(g: BodyGeom, t: ToolInks, open: number): { readonly grip: Pt; readonly inks: Ink[] } {
  const { x0, topAt } = bellowsGeom(g, open);
  const corner = { x: x0, y: topAt(x0) };
  return { grip: at(corner, 0, -3), inks: [ink(at(corner, 0, -1), t.wood, 3), ink(at(corner, 0, -2), t.wood, 2)] };
}

// ── choreography ───────────────────────────────────────────────────────────────────────────────────────────────────

const pose = (g: BodyGeom, p: Partial<WorkPose>): WorkPose => ({
  lower: 'stand',
  drop: 0,
  lean: 0,
  hip: 0,
  lift: 0,
  near: null,
  far: null,
  props: [],
  propsFront: [],
  tools: [],
  shadow: g.shadow,
  ...p,
});
/** The near shoulder after the upper body moved. */
const shoulder = (g: BodyGeom, drop: number, lean: number, lift = 0): Pt => at(g.near, lean, drop - lift);
const farShoulder = (g: BodyGeom, drop: number, lean: number, lift = 0): Pt => at(g.far, lean, drop - lift);
const wide = (g: BodyGeom, x1: number): readonly [number, number] => [g.shadow[0], Math.max(g.shadow[1], x1)];

/** Which tool set the body uses at a workplace whose work differs by body (scythe / sickle, anvil / bellows). */
export type Hands = 'man' | 'woman';

/** Mowing with a scythe: wind back, sweep along the ground in front, follow through, carry back (6 frames). */
function mow(g: BodyGeom, t: ToolInks, f: number): WorkPose {
  const k = [
    { lean: 0, hip: 0, hand: [-3, 5], heel: [-8, -1] },
    { lean: 0, hip: 0, hand: [-1, 6], heel: [-3, 0] },
    { lean: 1, hip: 0, hand: [1, 6], heel: [5, 0] },
    { lean: 2, hip: 1, hand: [3, 5], heel: [11, -1] },
    { lean: 1, hip: 1, hand: [3, 3], heel: [12, -4] },
    { lean: 0, hip: 0, hand: [0, 3], heel: [2, -4] },
  ][f];
  if (!k) throw new Error(`mow: no frame ${String(f)}`);
  const s = shoulder(g, 0, k.lean);
  const hand = at(s, k.hand[0] ?? 0, k.hand[1] ?? 0);
  const heel = { x: g.cx + (k.heel[0] ?? 0), y: g.ground + (k.heel[1] ?? 0) };
  return pose(g, {
    lower: 'stance',
    lean: k.lean,
    hip: k.hip,
    near: hand,
    tools: scythe(hand, heel, t),
    shadow: [g.shadow[0] - 2, g.shadow[1] + 2],
  });
}

/** Reaping with a sickle, bent over a tuft of wheat: raise, reach, hook, cut, draw back, rise (6 frames). */
function reap(g: BodyGeom, t: ToolInks, f: number): WorkPose {
  const k = [
    { hand: [1, 1], tall: 7 },
    { hand: [4, 3], tall: 7 },
    { hand: [5, 5], tall: 7 },
    { hand: [3, 6], tall: 3 },
    { hand: [1, 5], tall: 3 },
    { hand: [1, 3], tall: 7 },
  ][f];
  if (!k) throw new Error(`reap: no frame ${String(f)}`);
  const drop = 2;
  const lean = 1;
  const hand = at(shoulder(g, drop, lean), k.hand[0] ?? 0, k.hand[1] ?? 0);
  return pose(g, {
    lower: 'stance',
    drop,
    lean,
    near: hand,
    props: [],
    tools: [...wheat(g.cx + 8, g, t, k.tall), ...sickle(hand, t)],
    shadow: wide(g, g.cx + 13),
  });
}

/** Honey: lift a comb, lower it, lay it in the pail (bending), straighten with an empty hand (4 frames). */
function honey(g: BodyGeom, t: ToolInks, f: number): WorkPose {
  const k = [
    { drop: 0, hand: [3, 1], comb: true },
    { drop: 0, hand: [4, 3], comb: true },
    { drop: 2, hand: [4, 5], comb: true },
    { drop: 1, hand: [3, 4], comb: false },
  ][f];
  if (!k) throw new Error(`honey: no frame ${String(f)}`);
  const lean = 1;
  const hand = at(shoulder(g, k.drop, lean), k.hand[0] ?? 0, k.hand[1] ?? 0);
  return pose(g, {
    drop: k.drop,
    lean,
    near: hand,
    propsFront: pail(g.cx + 6, g, t, true),
    tools: k.comb ? comb(at(hand, 1, -2), t) : [],
    shadow: wide(g, g.cx + 12),
  });
}

/** Smith at the anvil: hammer raised, coming down, strike (sparks), rebound (4 frames). */
function forge(g: BodyGeom, t: ToolInks, f: number): WorkPose {
  const top = g.ground - 9;
  const k = [
    { lean: 0, hand: [1, -4], head: [-2, -3] },
    { lean: 1, hand: [4, -1], head: [3, -2] },
    { lean: 1, hand: [5, 3], head: [3, 1] },
    { lean: 1, hand: [4, 1], head: [2, -2] },
  ][f];
  if (!k) throw new Error(`forge: no frame ${String(f)}`);
  const hand = at(shoulder(g, 0, k.lean), k.hand[0] ?? 0, k.hand[1] ?? 0);
  const head = at(hand, k.head[0] ?? 0, k.head[1] ?? 0);
  const iron = [
    ink({ x: g.cx + 9, y: top - 1 }, t.hot.ramp, t.hot.shade),
    ink({ x: g.cx + 10, y: top - 1 }, t.hot.ramp, t.hot.shade),
  ];
  const sparks =
    f === 2
      ? [
          ink({ x: g.cx + 12, y: top - 3 }, t.hot.ramp, t.hot.shade),
          ink({ x: g.cx + 7, y: top - 4 }, t.hot.ramp, t.hot.shade),
        ]
      : [];
  return pose(g, {
    lower: 'stance',
    lean: k.lean,
    near: hand,
    propsFront: anvil(g.cx + 5, top, g, t),
    tools: [...iron, ...sparks, ...hammer(hand, head, t)],
    shadow: wide(g, g.cx + 13),
  });
}

/** At the bellows: the hand rides the top board's handle down and up (4 frames). */
function pump(g: BodyGeom, t: ToolInks, f: number): WorkPose {
  const open = [2, 1, 0, 1][f];
  if (open === undefined) throw new Error(`pump: no frame ${String(f)}`);
  const handle = bellowsHandle(g, t, open);
  return pose(g, {
    lean: 1,
    drop: open === 0 ? 1 : 0,
    near: handle.grip,
    propsFront: bellows(g, t, open),
    tools: handle.inks,
    shadow: wide(g, g.cx + 15),
  });
}

/** Potter seated at the kick wheel, hands on the pot as it rises; the kick wheel turns (4 frames). */
function throwPot(g: BodyGeom, t: ToolInks, f: number): WorkPose {
  const drop = g.sitDrop;
  const lean = 1;
  const s = shoulder(g, drop, lean);
  const headY = s.y + g.reach - 1;
  const stage = [0, 1, 2, 3][f] ?? 0;
  const hand = { x: g.cx + 7, y: headY - 1 - Math.min(stage, 2) };
  return pose(g, {
    lower: 'sit',
    drop,
    lean,
    near: hand,
    props: stool(g, t),
    propsFront: [...wheel(g, t, headY, f), ...pot(g, t, headY, stage)],
    shadow: wide(g, g.cx + 14),
  });
}

/** Trader over a basket: hold the jug, offer it forward, nod, draw back (4 frames). */
function trade(g: BodyGeom, t: ToolInks, f: number): WorkPose {
  const k = [
    { hand: [2, 4], lift: 0 },
    { hand: [4, 2], lift: 0 },
    { hand: [5, 1], lift: 1 },
    { hand: [3, 3], lift: 0 },
  ][f];
  if (!k) throw new Error(`trade: no frame ${String(f)}`);
  const hand = at(shoulder(g, 0, 0, k.lift), k.hand[0] ?? 0, k.hand[1] ?? 0);
  return pose(g, {
    lift: k.lift,
    near: hand,
    propsFront: basket(g.cx + 8, g, t),
    tools: jug(hand, t),
    shadow: wide(g, g.cx + 15),
  });
}

/** Talking: a hand gesture at the chest, then raised with a nod (2 frames). */
function talk(g: BodyGeom, f: number): WorkPose {
  const lift = f === 1 ? 1 : 0;
  const hand = at(shoulder(g, 0, 0, lift), f === 1 ? 4 : 3, f === 1 ? 1 : 3);
  return pose(g, { lift, near: hand });
}

/** Seated on the stool (by the fire at night), hands on the knees; the shoulders breathe (2 frames). */
function sit(g: BodyGeom, t: ToolInks, f: number): WorkPose {
  const drop = g.sitDrop;
  const lift = f === 1 ? 1 : 0;
  const hand = at(shoulder(g, drop, 0, lift), 2, g.reach - 1 + lift);
  return pose(g, { lower: 'sit', drop, lift, near: hand, props: stool(g, t), shadow: wide(g, g.cx + 7) });
}

/** Cheer: both arms up, a hop of the shoulders, wave, arms half down (4 frames). */
function cheer(g: BodyGeom, f: number): WorkPose {
  const k = [
    { lift: 0, near: [4, -8], far: [-3, -8] },
    { lift: 1, near: [5, -9], far: [-4, -8] },
    { lift: 0, near: [4, -8], far: [-3, -8] },
    { lift: 0, near: [5, -4], far: [-4, -4] },
  ][f];
  if (!k) throw new Error(`cheer: no frame ${String(f)}`);
  return pose(g, {
    lift: k.lift,
    near: at(shoulder(g, 0, 0, k.lift), k.near[0] ?? 0, k.near[1] ?? 0),
    far: at(farShoulder(g, 0, 0, k.lift), k.far[0] ?? 0, k.far[1] ?? 0),
  });
}

/** Frame counts of the villagers' new animations (SPEC §6.4: work 4–6 @8, talk 2 @4, sit 2 @2, cheer 4 @10). */
export const WORK_FRAMES = {
  'work-field': 6,
  'work-apiary': 4,
  'work-smithy': 4,
  'work-potter': 4,
  'work-fair': 4,
  talk: 2,
  sit: 2,
  cheer: 4,
} as const;
export type WorkAnim = keyof typeof WORK_FRAMES;

export const isWorkAnim = (anim: string): anim is WorkAnim => anim in WORK_FRAMES;

function choreograph(anim: WorkAnim, f: number, g: BodyGeom, t: ToolInks, hands: Hands): WorkPose {
  switch (anim) {
    case 'work-field':
      return hands === 'man' ? mow(g, t, f) : reap(g, t, f);
    case 'work-apiary':
      return honey(g, t, f);
    case 'work-smithy':
      return hands === 'man' ? forge(g, t, f) : pump(g, t, f);
    case 'work-potter':
      return throwPot(g, t, f);
    case 'work-fair':
      return trade(g, t, f);
    case 'talk':
      return talk(g, f);
    case 'sit':
      return sit(g, t, f);
    case 'cheer':
      return cheer(g, f);
  }
}

/**
 * The pose of `anim` frame `f` for a body. The field and the smithy differ by hands: the man mows with a scythe and
 * strikes the anvil; the woman reaps with a sickle and works the bellows (who did which work, ART-BIBLE §7). Wooden
 * props and tools are capped at `t.woodTop`, so they reuse the wood shades the outfit already has.
 */
export function workPose(anim: WorkAnim, f: number, g: BodyGeom, t: ToolInks, hands: Hands): WorkPose {
  const p = choreograph(anim, f, g, t, hands);
  const cap = (list: readonly Ink[]): Ink[] =>
    list.map((i) => (i.ramp === t.wood && i.shade > t.woodTop ? { ...i, shade: t.woodTop } : i));
  return { ...p, props: cap(p.props), propsFront: cap(p.propsFront), tools: cap(p.tools) };
}
