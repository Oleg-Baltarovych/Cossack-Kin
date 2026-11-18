// Вітряк, tiers II–VI (plan M2-07, ART-BIBLE §6 «Тіри господарських будівель»): the tier-I post mill (`windmill`,
// M-ART, unchanged) grown on the same frame (`paintMill`): II a lit window and flour sacks by the trestle; III a
// wider, taller cabin with a plank lean-to (прибудова) and a second window; IV a railed gallery and a carved crimson
// bargeboard with a rosette; V a bigger cabin and roof with an embroidered banner on a pole on the back slope; VI gilt — a gold
// hub ring, rosette and banner fringe, a third sack, the gold weathervane on the pole (`gilt.vane`, baked shimmer). The sails are
// add-ons (`windmill-sails`, `mill-sails.m|l`) hung on `millHub`; the hub stays ≤ 55 px up so the top sail clears the
// river band. Windows have an `@emissive` night mask on every tier. Ramps: wood, ink, plaster, crimson (IV+), gold (VI).
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { millHub, millShadow, paintMill, type MillGeometry } from '../windmill/index.ts';

const W = 96;
const H = 104;
export const MILL_GROUND = 100;
export const MILL_PIVOT_X = 44;

interface MillTier {
  readonly cabinW: number;
  /** Hub height above the ground row (tier I: 52); the sails' lift is this + 1. */
  readonly hub: number;
  /** Cabin bottom above the ground row (tier I: 28). */
  readonly floor: number;
  readonly roofH: number;
  readonly leanTo?: boolean;
  readonly gallery?: boolean;
  readonly carving?: boolean;
  /** Ridge pole height (banner from V, the weathervane's at VI). */
  readonly pole?: number;
  readonly gold?: boolean;
}

export const MILL_TIERS: Readonly<Record<string, MillTier>> = {
  t2: { cabinW: 36, hub: 52, floor: 28, roofH: 17 },
  t3: { cabinW: 40, hub: 53, floor: 28, roofH: 18, leanTo: true },
  t4: { cabinW: 40, hub: 53, floor: 28, roofH: 18, leanTo: true, gallery: true, carving: true },
  t5: { cabinW: 44, hub: 54, floor: 27, roofH: 19, leanTo: true, gallery: true, carving: true, pole: 5 },
  t6: { cabinW: 44, hub: 54, floor: 27, roofH: 19, leanTo: true, gallery: true, carving: true, pole: 6, gold: true },
};

export function millGeometry(t: MillTier): MillGeometry {
  const top = MILL_GROUND - t.hub - 6;
  return {
    cx: MILL_PIVOT_X,
    ground: MILL_GROUND,
    cabin: { w: t.cabinW, top, bottom: MILL_GROUND - t.floor },
    roofH: t.roofH,
  };
}

/** Sails lift (px above the mill's ground) for a tier: the hub's row bottom. */
export const millSailLift = (tier: string): number => (MILL_TIERS[tier]?.hub ?? 52) + 1;

/** The ridge pole's top relative to the pivot (dx, lift) — where `gilt.vane` stands at tier VI. */
/** The ridge pole stands on the back (left) slope, clear of the vertical sail's lattice. */
export const MILL_POLE_DX = -9;

/** The pole top relative to the pivot (dx, lift) — where `gilt.vane` stands at tier VI. */
export function millPoleTop(tier: string): { dx: number; lift: number } {
  const t = MILL_TIERS[tier];
  const g = t ? millGeometry(t) : null;
  if (!t || !g) return { dx: 0, lift: 0 };
  const roofTop = g.cabin.top - g.roofH;
  return { dx: MILL_POLE_DX, lift: MILL_GROUND + 1 - (roofTop - 1 - (t.pole ?? 0)) };
}

/** First roof row at column `x` (the left slope's edge). */
function roofRowAt(g: MillGeometry, x: number): number {
  const roofTop = g.cabin.top - g.roofH;
  for (let r = 0; r < g.roofH; r++) {
    const half = Math.round(2 + (r * (g.cabin.w / 2 + 1)) / g.roofH);
    if (g.cx - half <= x) return roofTop + r;
  }
  return g.cabin.top;
}

/** A 3×4 cabin window: ink 1 glass (the night mask) in a wood 2 frame with a wood 5 sill. */
function millWindow(p: Plot, glow: Plot, x: number, y: number): void {
  for (let r = -1; r <= 4; r++) for (let c = -1; c <= 3; c++) p.set(x + c, y + r, 'wood', r === 4 ? 5 : 2);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      p.set(x + c, y + r, 'ink', 1);
      glow.set(x + c, y + r, 'gold', r === 0 ? 3 : 4);
    }
  }
}

/** Linen flour sack: plaster, lit left, a wood 2 tie at the neck. */
function sack(p: Plot, x: number, ground: number, w: number, h: number): void {
  for (let r = 0; r < h; r++) {
    const inset = r === 0 ? 1 : 0;
    for (let c = inset; c < w - inset; c++) {
      const shade = c === inset ? 5 : c >= w - 1 - inset ? 2 : r === h - 1 ? 2 : 4;
      p.set(x + c, ground - h + 1 + r, 'plaster', shade);
    }
  }
  p.set(x + Math.floor(w / 2), ground - h, 'wood', 2);
}

const mill: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'mill',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(MILL_TIERS),
  layers: ['emissive', 'shadow'],
  anchor: { x: MILL_PIVOT_X / W, y: (MILL_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const t = MILL_TIERS[variant ?? 't2'] ?? { cabinW: 36, hub: 52, floor: 28, roofH: 16 };
    const g = millGeometry(t);
    const { cx } = g;
    const { top, bottom, w } = g.cabin;
    const x0 = cx - w / 2;
    const x1 = cx + w / 2; // exclusive
    const roofTop = top - g.roofH;
    const p = new Plot();
    const glow = new Plot();
    paintMill(p, g);
    // Eave boards: a 2-px wood lip past the cabin under the roof (a step up from tier I's bare eave).
    for (let x = x0 - 2; x < x1 + 2; x++) {
      p.set(x, top, 'wood', x < cx ? 5 : 2);
      if (x < x0 || x >= x1) p.set(x, top + 1, 'wood', 1);
    }

    // Lean-to on the back (left) wall: plank boards under a mono-pitch roof falling to the left.
    if (t.leanTo) {
      const lx = x0 - 9;
      for (let y = top + 8; y < bottom; y++) {
        for (let x = lx; x < x0; x++) {
          const seam = (x - lx) % 3 === 2;
          p.set(x, y, 'wood', x === lx ? 5 : seam ? 2 : y >= bottom - 2 ? 2 : 3);
        }
      }
      for (let k = 0; k < 11; k++) {
        const x = x0 - k;
        const y = top + 5 + Math.floor(k * 0.4);
        p.set(x, y, 'wood', 5);
        p.set(x, y + 1, 'wood', 4);
        p.set(x, y + 2, 'wood', 1);
      }
    }
    // Windows (night masks): the original one under the hub, a second on the lit side from III.
    millWindow(p, glow, cx + 8, top + 12);
    if (t.leanTo) millWindow(p, glow, cx - 11, top + 12);
    // Flour sacks right of the trestle.
    sack(p, cx + 17, MILL_GROUND, 5, 7);
    sack(p, cx + 21, MILL_GROUND, 5, 5);
    if (t.leanTo) sack(p, cx + 16, MILL_GROUND - 7, 4, 4);
    if (t.gold) sack(p, cx + 26, MILL_GROUND, 4, 4);

    // Gallery: a plank floor round the cabin foot on brackets, a railing (posts every 4 px, a lit top rail).
    if (t.gallery) {
      const gx0 = x0 - 1;
      const gx1 = x1 + 7;
      for (let x = gx0; x < gx1; x++) {
        p.set(x, bottom, 'wood', 4);
        p.set(x, bottom + 1, 'wood', 1);
        if (x >= x1) {
          p.set(x, bottom - 5, 'wood', 5);
          if ((x - gx0) % 4 === 0) for (let y = bottom - 4; y < bottom; y++) p.set(x, y, 'wood', 3);
        } else if ((x - gx0) % 4 === 0) {
          for (let y = bottom - 4; y < bottom; y++) p.set(x, y, 'wood', 1);
        }
      }
      for (let k = 0; k < 6; k++) p.set(x1 + 5 - k, bottom + 2 + k, 'wood', 2); // bracket under the overhang
      for (let x = x0; x < x1; x++) p.set(x, bottom - 5, 'wood', 5);
    }

    // Carved bargeboard along both gable edges (crimson notches) and a rosette in the gable over the hub.
    if (t.carving) {
      for (let y = roofTop + 1; y < top; y++) {
        const r = y - roofTop;
        const half = Math.round(2 + (r * (w / 2 + 1)) / g.roofH);
        const notch = y % 2 === 0;
        p.set(cx - half + 1, y, 'crimson', notch ? 3 : 2);
        p.set(cx + half - 1, y, 'crimson', 2);
      }
      for (let x = x0 - 1; x < x1 + 1; x += 2) p.set(x, top, 'crimson', x < cx ? 3 : 2); // підзор under the eaves
      // On the lit gable face, off the hub column (the vertical sail would hide it).
      const ry = top - 4;
      const rx = cx - 10;
      const rosette = t.gold ? 'gold' : 'crimson';
      for (const [dx, dy, s] of [
        [-1, -1, 3],
        [0, -1, 3],
        [-2, 0, 3],
        [1, 0, 2],
        [-1, 1, 2],
        [0, 1, 2],
      ] as const) {
        p.set(rx + dx, ry + dy, rosette, s);
      }
      p.set(rx - 1, ry, t.gold ? 'gold' : 'wood', t.gold ? 4 : 6);
      p.set(rx, ry, t.gold ? 'gold' : 'wood', t.gold ? 3 : 2);
    }

    // A pole on the back slope with an embroidered banner (корогва) streaming left; gold fringe at VI. Its top is
    // as high as a ridge pole of `t.pole` would be (the river band caps the height).
    if (t.pole !== undefined) {
      const px = cx + MILL_POLE_DX;
      const topY = roofTop - 1 - t.pole;
      for (let y = topY + 1; y < roofRowAt(g, px); y++) {
        p.set(px, y, 'wood', 4);
        p.set(px + 1, y, 'wood', 2);
      }
      const by = topY + 1;
      for (let r = 0; r < 4; r++) {
        for (let c = 1; c <= 6 - (r === 3 ? 1 : 0); c++) {
          const stitch = r === 1 && c % 2 === 0;
          p.set(px - c, by + r, stitch ? 'plaster' : 'crimson', stitch ? 5 : r === 0 ? 3 : 2);
        }
      }
      if (t.gold) for (let c = 1; c <= 5; c++) p.set(px - c, by + 4, 'gold', c % 2 === 0 ? 4 : 3);
    }

    // Gilt hub boss at VI.
    if (t.gold) {
      const hub = millHub(g);
      // A 1-px ring just outside the sails' hub cap (which covers the boss), lit upper left.
      for (let dy = -4; dy <= 3; dy++) {
        for (let dx = -4; dx <= 3; dx++) {
          const ring = Math.max(Math.abs(dx + 0.5), Math.abs(dy + 0.5)) === 3.5;
          const corner = Math.abs(dx + 0.5) === 3.5 && Math.abs(dy + 0.5) === 3.5;
          if (ring && !corner) p.set(hub.x + dx, hub.y + dy, 'gold', dx + dy < 0 ? 4 : 2);
        }
      }
    }

    compose(buffer, [p.part(1, 1, glow)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) millShadow(layers.shadow, g);
  },
};

export default mill;
