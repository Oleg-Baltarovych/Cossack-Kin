// Кузня, tiers I–VI (plan M2-08, ART-BIBLE §6 «кузня (відкрита, з горном і ковадлом)»): an open smithy, set apart
// toward the Sich like real ones (fire risk). I a reed-thatched shed on four posts over a clay hearth on a stone
// footing, the anvil on its stump in front; II a woven wattle back wall, the clay hood and flue, a quench tub;
// III the smith's clay hut joins on the right (plank door, small dark window) under one long roof; IV a plank
// lean-to past the hut with a cart wheel waiting for its tyre, horseshoes nailed to the bay post; V a shoeing frame
// (станок) for horses on the left, a stone flue; VI wider still, a gilt horseshoe over the hut's door (the gold accent).
// The fire is the `forge` add-on (4 frames @8, `@emissive`, a light pool at night) laid on the hearth's fire bed
// (`smithyForge`). Ramps: thatch, wood, earth, stone, ink (+ gold at VI). 112×72, pivot at the base.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { thatchRoof, wattle } from '../../lib/recipes.ts';
import { composeOutlined } from '../../lib/recipes-farm.ts';
import {
  anvil,
  barrel,
  clayWall,
  hearth,
  hoodAndFlue,
  horseshoe,
  line,
  plankDoor,
  softenThatch,
  timberPost,
  wheel,
} from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 112;
const H = 72;
export const SMITHY_GROUND = 68;
export const SMITHY_PIVOT_X = 56;
/** First row of the 3-row eave lip: the posts and walls stand under it. */
const LIP = SMITHY_GROUND - 20;
const HEARTH_W = 12;

interface SmithyTier {
  /** Roof eave span (offsets from the pivot) and ridge height above the lip. */
  readonly roof: readonly [number, number];
  readonly rise: number;
  readonly hearth: number;
  readonly anvil: number;
  readonly wattle?: boolean;
  /** Flue top above the roof's ridge (px); absent = no hood (tier I). */
  readonly flue?: number;
  readonly stoneFlue?: boolean;
  readonly tub?: number;
  /** The clay hut under the right part of the roof: [x0, x1). */
  readonly hut?: readonly [number, number];
  /** Plank lean-to past the hut: its outer end; the wheel leans under it. */
  readonly leanTo?: number;
  readonly frame?: number;
  readonly horseshoes?: boolean;
  readonly gilt?: boolean;
}

export const SMITHY_TIERS: Readonly<Record<string, SmithyTier>> = {
  t1: { roof: [-20, 20], rise: 12, hearth: -6, anvil: 10 },
  t2: { roof: [-24, 24], rise: 13, hearth: -9, anvil: 9, wattle: true, flue: 3, tub: 18 },
  t3: { roof: [-30, 30], rise: 20, hearth: -15, anvil: -1, wattle: true, flue: 4, tub: -26, hut: [6, 27] },
  t4: {
    roof: [-30, 30],
    rise: 20,
    hearth: -15,
    anvil: -1,
    wattle: true,
    flue: 4,
    tub: -26,
    hut: [6, 27],
    leanTo: 40,
    horseshoes: true,
  },
  t5: {
    roof: [-34, 34],
    rise: 22,
    hearth: -17,
    anvil: -3,
    wattle: true,
    flue: 6,
    stoneFlue: true,
    tub: 12,
    hut: [8, 31],
    leanTo: 44,
    frame: -52,
    horseshoes: true,
  },
  t6: {
    roof: [-36, 36],
    rise: 22,
    hearth: -17,
    anvil: -3,
    wattle: true,
    flue: 7,
    stoneFlue: true,
    tub: 12,
    hut: [8, 33],
    leanTo: 48,
    frame: -54,
    horseshoes: true,
    gilt: true,
  },
};

/**
 * Where the `forge` add-on lies on tier `variant`: its pivot (bottom-centre of the coal bed) at the hearth's fire
 * bed, as a layout offset — `dground` 1 sorts it in front of the smithy, so `lift` counts that row too.
 */
export function smithyForge(variant: string): { readonly dx: number; readonly lift: number } {
  const t = SMITHY_TIERS[variant] ?? SMITHY_TIERS.t1;
  // The hearth stands on the row above the ground (`hearth(…, ground − 1)`), its fire bed 8 rows over that: the coal
  // bed's bottom edge is 9 rows above the smithy's pivot, plus the forge's 1-row `dground`.
  const fireBed = SMITHY_GROUND - 1 - 8;
  return { dx: t?.hearth ?? 0, lift: SMITHY_GROUND - fireBed + 1 };
}

const smithy: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'smithy',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(SMITHY_TIERS),
  layers: ['shadow'],
  anchor: { x: SMITHY_PIVOT_X / W, y: (SMITHY_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const seed = `smithy.${variant ?? 't1'}`;
    const t = SMITHY_TIERS[variant ?? 't1'] ?? { roof: [-20, 20], rise: 12, hearth: -6, anvil: 10 };
    const cx = SMITHY_PIVOT_X;
    const g = SMITHY_GROUND;
    const [r0, r1] = [cx + t.roof[0], cx + t.roof[1]];
    const roofTop = LIP - t.rise;
    const hx = cx + t.hearth;

    // Back: the wattle wall across the bay, the hearth, the hood and flue.
    const back = new Plot();
    const bayEnd = t.hut ? cx + t.hut[0] : r1 - 3;
    if (t.wattle) wattle(back, { seed, x: r0 + 4, w: bayEnd - r0 - 4, ground: g - 2, top: LIP + 6, courses: 3 });
    const fireBed = hearth(back, hx, g - 1, HEARTH_W);
    if (t.flue !== undefined) hoodAndFlue(back, hx, fireBed, HEARTH_W, 6, roofTop - t.flue, t.stoneFlue === true);

    // The clay hut on the right, its door and a small dark window.
    if (t.hut) {
      const [h0, h1] = [cx + t.hut[0], cx + t.hut[1]];
      clayWall(back, h0, LIP + 3, h1 - h0, g - LIP - 3, 6, seed);
      plankDoor(back, h0 + 4, g - 12, 6, 12);
      for (let y = LIP + 6; y < LIP + 10; y++) for (let x = h0 + 12; x < h0 + 15; x++) back.set(x, y, 'ink', 1);
    }
    // Posts: the bay's outer corners (and the bay's inner corner against the hut).
    const posts = [r0 + 3, t.hut ? cx + t.hut[0] - 2 : r1 - 5];
    for (const px of posts) timberPost(back, px, LIP + 3, g, 2);
    if (t.horseshoes) {
      horseshoe(back, (posts[0] ?? 0) - 1, LIP + 9, 'stone');
      horseshoe(back, (posts[0] ?? 0) - 1, LIP + 15, 'stone');
    }

    // Plank lean-to past the hut: a sloped board roof on one post, a wheel under it.
    const front = new Plot();
    if (t.leanTo !== undefined && t.hut) {
      const [x0, x1] = [cx + t.hut[1] - 1, cx + t.leanTo];
      for (let x = x0; x <= x1; x++) {
        const y = LIP + 4 + Math.floor(((x - x0) * 6) / (x1 - x0));
        front.set(x, y, 'wood', (x - x0) % 4 === 0 ? 2 : 4);
        front.set(x, y + 1, 'wood', 1);
      }
      timberPost(front, x1 - 2, LIP + 11, g, 2);
      wheel(front, x0 + Math.floor((x1 - x0) / 2), g - 7, 7);
    }

    // Roof over the bay and the hut.
    const roof = new Plot();
    thatchRoof(roof, { seed, x: r0, w: r1 - r0, top: roofTop, lip: LIP, hipFoot: { left: 0.45, right: 0.7 } });
    softenThatch(roof);
    if (t.flue !== undefined) hoodAndFlue(roof, hx, roofTop + 4, 4, 0, roofTop - t.flue, t.stoneFlue === true);

    // Front: the anvil, the quench tub, the shoeing frame, the gilt horseshoe over the bay.
    anvil(front, cx + t.anvil, g);
    if (t.tub !== undefined) barrel(front, cx + t.tub, g, 6);
    if (t.frame !== undefined) {
      const fx = cx + t.frame;
      timberPost(front, fx, g - 15, g, 2);
      timberPost(front, fx + 14, g - 15, g, 2);
      line(front, fx - 1, g - 13, fx + 16, g - 13, 'wood', 4, 2);
      line(front, fx + 1, g - 7, fx + 14, g - 7, 'wood', 3);
    }
    // The gilt horseshoe nailed over the hut's door (for luck); no outline round it (gold stays 2 steps: the budget).
    const gilt = new Plot();
    if (t.gilt && t.hut) horseshoe(gilt, cx + t.hut[0] + 5, g - 18, 'gold');

    composeOutlined(
      buffer,
      [back.part(1, 1), roof.part(2, 2), front.part(3, 3), ...(t.gilt ? [gilt.part(4, 4)] : [])],
      rampSize,
      { drop: 1, outlineParts: [1, 2, 3] },
    );
    if (layers.shadow) castShadow(layers.shadow, { x0: cx, x1: r1 + 1, groundY: g, reach: 12, depth: 5 });
  },
};

export default smithy;
