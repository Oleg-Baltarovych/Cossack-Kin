// Ярмарок, tiers I–VI (plan M2-08, ART-BIBLE §6 «ярмарок (ятки, рядна, бочки)»): the goods laid out on the square in
// front of the stalls, growing with the fair. I one рядно (woven mat) with pots and cabbages, two grain sacks; II a
// second mat with onions; III plank crates stacked; IV a back row of sacks and a third mat; V the fair's pennant on a
// pole (ярмаркова корогва: the wind-animated `pennant.a` add-on, `fairPennant`); VI more sacks and a taller pole. The stalls (`stall.a|b|c`), the barrels, the shop
// (`shop`, IV+) and the gilt vane on its roof (VI) are add-ons placed by the layout. Ramps: plaster, crimson, earth,
// grass, thatch, wood. 128×48, pivot at the front edge.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { composeOutlined } from '../../lib/recipes-farm.ts';
import { crate, heads, pennantHoist, pennantPole, ryadno, sack, smallPot } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 128;
const H = 48;
export const FAIR_GROUND = 44;
export const FAIR_PIVOT_X = 64;

interface FairTier {
  /** Mats in front: left x offset and width; what lies on each (`p` pots, `c` cabbages, `o` onions). */
  readonly mats: readonly (readonly [number, number, string])[];
  readonly sacks: readonly number[];
  /** Sacks in a back row (4 rows behind the front). */
  readonly backSacks?: readonly number[];
  readonly crates?: number;
  readonly pole?: readonly [number, number];
}

export const FAIR_TIERS: Readonly<Record<string, FairTier>> = {
  t1: { mats: [[-14, 22, 'pc']], sacks: [12, 17], backSacks: [-22] },
  t2: {
    mats: [
      [-30, 14, 'o'],
      [-14, 22, 'pc'],
    ],
    sacks: [12, 17],
    backSacks: [-22],
  },
  t3: {
    mats: [
      [-30, 14, 'o'],
      [-14, 22, 'pc'],
    ],
    sacks: [12, 17],
    backSacks: [-22],
    crates: 24,
  },
  t4: {
    mats: [
      [-40, 14, 'o'],
      [-24, 22, 'pc'],
      [0, 14, 'c'],
    ],
    sacks: [18, 23],
    backSacks: [-34, -29],
    crates: 30,
  },
  t5: {
    mats: [
      [-40, 14, 'o'],
      [-24, 22, 'pc'],
      [0, 14, 'c'],
    ],
    sacks: [18, 23],
    backSacks: [-34, -29],
    crates: 30,
    pole: [-50, 28],
  },
  t6: {
    mats: [
      [-46, 14, 'o'],
      [-30, 22, 'pc'],
      [-6, 14, 'c'],
      [10, 14, 'p'],
    ],
    sacks: [28, 33, 38],
    backSacks: [-40, -35, -30],
    crates: 40,
    pole: [-56, 34],
  },
};

/** Where the fair's `pennant.a` hangs on tier `variant` (V–VI: the pole), as a layout offset; `null` = no pole. */
export function fairPennant(variant: string): { readonly dx: number; readonly lift: number } | null {
  const pole = FAIR_TIERS[variant]?.pole;
  if (!pole) return null;
  return pennantHoist({ x: FAIR_PIVOT_X + pole[0], ground: FAIR_GROUND - 1, h: pole[1] }, FAIR_PIVOT_X, FAIR_GROUND);
}

const fair: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'fair',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(FAIR_TIERS),
  layers: ['shadow'],
  anchor: { x: FAIR_PIVOT_X / W, y: (FAIR_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const t = FAIR_TIERS[variant ?? 't1'] ?? { mats: [], sacks: [] };
    const cx = FAIR_PIVOT_X;
    const g = FAIR_GROUND;
    const p = new Plot();
    // Back to front: the pole, the back sacks, the crates, the mats and their goods, the front sacks.
    if (t.pole) pennantPole(p, cx + t.pole[0], g - 1, t.pole[1]);
    for (const x of t.backSacks ?? []) sack(p, cx + x, g - 4, 7);
    if (t.crates !== undefined) {
      crate(p, cx + t.crates, g, 9, 7);
      crate(p, cx + t.crates + 2, g - 7, 6, 5);
    }
    for (const [x, w, goods] of t.mats) {
      ryadno(p, cx + x, w, g);
      Array.from(goods, (kind) => kind).forEach((kind, i) => {
        const gx = cx + x + Math.round(((i + 0.5) * w) / goods.length);
        if (kind === 'p') {
          smallPot(p, gx - 3, g - 2);
          smallPot(p, gx + 3, g - 2);
        } else heads(p, gx, g - 2, kind === 'c' ? 'grass' : 'thatch');
      });
    }
    for (const x of t.sacks) sack(p, cx + x, g, 8);
    composeOutlined(buffer, [p.part(1, 1)], rampSize, { drop: 1 });
    if (layers.shadow)
      castShadow(layers.shadow, { x0: cx, x1: cx + (t.crates ?? 18) + 9, groundY: g, reach: 6, depth: 3 });
  },
};

export default fair;
