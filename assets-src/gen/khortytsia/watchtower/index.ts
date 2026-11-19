// Сторожова вежа, tiers II–IV (plan M2-09, ART-BIBLE §6 «частокіл із дерев'яними вежами»): the Sich's own building on
// the wall's left corner. Tier I is the `tower` frame (32×88). II a taller зруб with an open lookout gallery (галерея)
// on a log floor beam and braces — corner posts, a railing of balusters, the dark interior — under a broad overhanging
// шатро; III taller still, a signal beacon (a fire basket of tar logs bracketed off the gallery's right post, its
// flame lit at night: the «фігура» of the Cossack signal towers) and a ladder against the left wall; IV a wider gallery
// with carved crimson trim (a valance under the eave, a gold-studded band on the floor beam), a gilt finial knob and a
// small crimson pennant with a gold cross. Ramps: wood, ink (+ gold at III, crimson at IV). 48×122, pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { logWall, opening, tentRoof } from '../../lib/recipes-sich.ts';
import { line, timberPost } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 48;
const H = 122;
export const WATCHTOWER_GROUND = 120;
export const WATCHTOWER_PIVOT_X = 20;
/** The зруб: 22 px wide, centred on the pivot (as the tier-I tower). */
const WALL = { x: WATCHTOWER_PIVOT_X - 11, w: 22 };

interface WatchtowerTier {
  /** Top row of the gallery's floor beam, above the ground. */
  readonly floor: number;
  /** Open gallery rows between the floor beam and the eave. */
  readonly gallery: number;
  /** Gallery half-width (the floor beam overhangs the зруб). */
  readonly half: number;
  /** Roof eave half-width and rise. */
  readonly roof: number;
  readonly rise: number;
  readonly beacon?: boolean;
  readonly ladder?: boolean;
  readonly carved?: boolean;
}

export const WATCHTOWER_TIERS: Readonly<Record<string, WatchtowerTier>> = {
  t2: { floor: 60, gallery: 11, half: 14, roof: 17, rise: 26 },
  t3: { floor: 62, gallery: 11, half: 14, roof: 17, rise: 27, beacon: true, ladder: true },
  t4: { floor: 64, gallery: 12, half: 16, roof: 19, rise: 28, beacon: true, ladder: true, carved: true },
};

/** The beacon basket's centre column and top row (frame px) for a tier: off the gallery's right post at the eave. */
function beaconAt(t: WatchtowerTier): { bx: number; bTop: number } {
  const eave = WATCHTOWER_GROUND - t.floor - t.gallery;
  return { bx: WATCHTOWER_PIVOT_X + t.half + 3, bTop: eave + 3 };
}
/** Beacon flame centre from the pivot (logical px; dy negative = up): where its warm pool sits (FIRE_LIGHTS). */
export function watchtowerBeacon(variant: 't3' | 't4'): { dx: number; dy: number } {
  const t = WATCHTOWER_TIERS[variant];
  if (!t) throw new Error(`no watchtower tier ${variant}`);
  const { bx, bTop } = beaconAt(t);
  return { dx: bx - WATCHTOWER_PIVOT_X, dy: bTop - 8 - (WATCHTOWER_GROUND + 1) };
}

const watchtower: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'watchtower',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(WATCHTOWER_TIERS),
  layers: ['emissive', 'shadow'],
  anchor: { x: WATCHTOWER_PIVOT_X / W, y: (WATCHTOWER_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const t = WATCHTOWER_TIERS[variant ?? 't2'] ?? { floor: 60, gallery: 11, half: 14, roof: 17, rise: 26 };
    const cx = WATCHTOWER_PIVOT_X;
    const g = WATCHTOWER_GROUND;
    const floorTop = g - t.floor;
    const eave = floorTop - t.gallery;
    const [gx0, gx1] = [cx - t.half, cx + t.half];

    // The зруб from the ground up to the floor beam, two lit slits under the gallery.
    const body = new Plot();
    const glow = new Plot();
    logWall(body, {
      seed: `watchtower.${variant ?? 't2'}`,
      x: WALL.x,
      y: floorTop + 4,
      w: WALL.w,
      h: g - floorTop - 3,
      ends: true,
    });
    opening(body, glow, { x: WALL.x + 5, y: floorTop + 10, w: 3, h: 5 }, 1);
    opening(body, glow, { x: WALL.x + 14, y: floorTop + 10, w: 3, h: 5 }, 1);
    // Braces from the зруб out to the floor beam's ends.
    line(body, WALL.x, floorTop + 9, gx0 + 1, floorTop + 4, 'wood', 3, 2);
    line(body, WALL.x + WALL.w - 1, floorTop + 9, gx1 - 2, floorTop + 4, 'wood', 1, 2);

    // Gallery: the dark interior, the floor beam (one log course with round ends), posts, the railing.
    const gal = new Plot();
    for (let y = eave; y < floorTop; y++) {
      for (let x = gx0; x < gx1; x++) gal.set(x, y, 'ink', y < eave + 2 ? 1 : 2);
    }
    logWall(gal, { seed: `watchtower.${variant ?? 't2'}:floor`, x: gx0, y: floorTop, w: gx1 - gx0, h: 4, ends: true });
    const rail = floorTop - 5;
    for (let x = gx0; x < gx1; x++) {
      gal.set(x, rail, 'wood', x < cx ? 4 : 3);
      gal.set(x, rail + 1, 'wood', 1);
      if ((x - gx0) % 3 === 1) for (let y = rail + 2; y < floorTop; y++) gal.set(x, y, 'wood', x < cx ? 3 : 2);
    }
    for (const px of [gx0, cx - 1, gx1 - 2]) timberPost(gal, px, eave, floorTop - 1, 2);

    // Roof: a broad шатро overhanging the gallery.
    const roof = new Plot();
    tentRoof(roof, cx, eave - t.rise, eave, 2 * t.roof);
    const top = eave - t.rise;

    // Ladder against the left wall, from the ground up to the floor beam.
    const front = new Plot();
    if (t.ladder) {
      const [lx0, lx1] = [WALL.x - 6, gx0 - 1];
      line(front, lx0, g, lx1, floorTop + 2, 'wood', 4);
      line(front, lx0 + 3, g, lx1 + 3, floorTop + 2, 'wood', 2);
      for (let y = floorTop + 5; y < g; y += 4) {
        const dx = Math.round(((g - y) * (lx1 - lx0)) / (g - floorTop - 2));
        front.set(lx0 + dx + 1, y, 'wood', 3);
        front.set(lx0 + dx + 2, y, 'wood', 3);
      }
    }

    // Beacon (art-director M2-09): an iron fire basket of tar logs bracketed off the gallery's right post at the eave,
    // the flame over it (lit at night; its warm pool is a FIRE_LIGHTS entry at `watchtowerBeacon`).
    const fire = new Plot();
    if (t.beacon) {
      const { bx, bTop } = beaconAt(t);
      // The bracket: a 2-px iron arm from the post out under the basket, a strut down to the post.
      for (let x = gx1 - 1; x <= bx; x++) front.set(x, bTop, 'ink', 2);
      line(front, gx1 - 1, bTop + 5, bx - 1, bTop + 1, 'ink', 2);
      for (let r = 0; r < 5; r++) {
        const half = 2 + (r < 2 ? 1 : 0);
        for (let c = -half; c <= half; c++) {
          const bar = r === 0 || r === 4 || Math.abs(c) === half || (c + r) % 3 === 0;
          front.set(bx + c, bTop - 5 + r, bar ? 'ink' : 'wood', bar ? (r === 0 ? 3 : 2) : r < 2 ? 1 : 0);
        }
      }
      // Flame tongues over the basket: gold core, crimson tips; brighter in the night mask.
      const tongues: readonly (readonly [number, number])[] = [
        [-2, 2],
        [-1, 4],
        [0, 6],
        [1, 5],
        [2, 3],
      ];
      for (const [c, h] of tongues) {
        for (let k = 0; k < h; k++) {
          const y = bTop - 6 - k;
          const tip = k >= h - 2;
          fire.set(bx + c, y, tip ? 'crimson' : 'gold', tip ? 4 : k === 0 ? 3 : 4);
          glow.set(bx + c, y, tip ? 'crimson' : 'gold', tip ? 5 : 5 - (k === 0 ? 1 : 0));
        }
      }
      for (let c = -2; c <= 2; c++) glow.set(bx + c, bTop - 5, 'gold', 4);
    }

    // Carved trim: a crimson valance under the eave (teeth every other px), a gold-studded crimson band on the beam;
    // the finial pole lengthened with a gilt knob and a crimson pennant with a gold cross.
    const trim = new Plot();
    if (t.carved) {
      for (let x = gx0 - 1; x <= gx1; x++) {
        trim.set(x, eave, 'crimson', x < cx ? 4 : 3);
        if ((x & 1) === 0) trim.set(x, eave + 1, 'crimson', 2);
        trim.set(x, floorTop + 3, (x - gx0) % 4 === 2 ? 'gold' : 'crimson', (x - gx0) % 4 === 2 ? 4 : 2);
      }
      const poleTop = top - 11;
      for (let y = poleTop; y < top - 1; y++) trim.set(cx, y, 'wood', 2);
      // A 3 × 3 gilt orb on the pole top, lit top-left.
      for (const [dx, dy, shade] of [
        [0, -3, 5],
        [-1, -2, 5],
        [0, -2, 4],
        [1, -2, 3],
        [0, -1, 3],
      ] as const) {
        trim.set(cx + dx, poleTop + dy, 'gold', shade);
      }
      // Pennant: 10 px long, tapering from 6 rows to 2, a lit top edge.
      for (let c = 0; c < 10; c++) {
        const rows = 6 - Math.floor((c * 4) / 10);
        const off = Math.floor((6 - rows) / 2);
        for (let r = 0; r < rows; r++) {
          trim.set(cx + 1 + c, poleTop + 1 + off + r, 'crimson', r === 0 ? 4 : r === rows - 1 ? 2 : 3);
        }
      }
      for (let k = 0; k < 5; k++) trim.set(cx + 4, poleTop + 2 + k, 'gold', 4);
      for (let k = -1; k <= 1; k++) trim.set(cx + 4 + k, poleTop + 3, 'gold', 4);
    }

    compose(
      buffer,
      [
        body.part(1, 1, glow),
        gal.part(2, 2),
        roof.part(3, 3),
        front.part(4, 4, glow),
        fire.part(5, 5, glow),
        trim.part(6, 6),
      ],
      rampSize,
      {
        light: false,
        occlusion: false,
        outline: { mode: 'outer', parts: [2, 3, 4] },
        selective: { lit: 'vanish' },
        ...(layers.emissive ? { emissive: layers.emissive } : {}),
      },
    );
    if (layers.shadow) castShadow(layers.shadow, { x0: cx, x1: WALL.x + WALL.w + 1, groundY: g });
  },
};

export default watchtower;
