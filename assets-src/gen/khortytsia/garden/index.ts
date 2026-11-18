// Город, tiers I–VI (plan M2-06, ART-BIBLE §6): raised beds stacked in depth that multiply and fill with the tier —
// I two beds of seedlings, II three beds (onions, cabbages, beets) with a чорнобривці border, III beans on poles (the
// first tall shape), IV pumpkins and sunflowers, V a grassed погріб (cellar) at the back, VI a gate post with a
// crimson рушник tie and a third sunflower. Footprint 56 → 140 px wide (art-director: the garden is the front-row
// subject of the farm's second screen). The low garden wattle is an add-on (`garden-tyn`) behind the beds from II.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import {
  beanPoles,
  bed,
  beet,
  cabbage,
  cellarMound,
  composeOutlined,
  gardenSunflower,
  marigolds,
  onion,
  post,
  postTie,
  pumpkin,
} from '../../lib/recipes-farm.ts';
import { seedOf } from '../../lib/noise.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 152;
const H = 64;
/** Front furrow row; the pivot is the bottom edge of this row. */
export const GARDEN_GROUND = 58;
export const GARDEN_PIVOT_X = 76;

type Crop = 'seedling' | 'onion' | 'cabbage' | 'beet';

interface Tier {
  readonly w: number;
  /** Beds back to front. */
  readonly beds: readonly Crop[];
  readonly marigolds?: boolean;
  /** Bean teepees at these offsets from the right end. */
  readonly beans?: readonly number[];
  /** Pumpkins at these offsets from the left end, in front of the front bed. */
  readonly pumpkins?: readonly number[];
  /** Sunflowers at these offsets from the left end (behind the beds). */
  readonly sunflowers?: readonly number[];
  readonly cellar?: boolean;
  readonly gate?: boolean;
}

const BEDS3: readonly Crop[] = ['onion', 'cabbage', 'beet'];

export const GARDEN_TIERS: Readonly<Record<string, Tier>> = {
  t1: { w: 56, beds: ['seedling', 'seedling'] },
  t2: { w: 76, beds: BEDS3, marigolds: true },
  t3: { w: 92, beds: BEDS3, marigolds: true, beans: [8, 20] },
  t4: { w: 108, beds: BEDS3, marigolds: true, beans: [8, 20], pumpkins: [14, 34], sunflowers: [6, 14] },
  t5: {
    w: 124,
    beds: BEDS3,
    marigolds: true,
    beans: [8, 20],
    pumpkins: [14, 34, 54],
    sunflowers: [6, 14],
    cellar: true,
  },
  t6: {
    w: 140,
    beds: BEDS3,
    marigolds: true,
    beans: [8, 20, 32],
    pumpkins: [16, 36, 56],
    sunflowers: [6, 14, 22],
    cellar: true,
    gate: true,
  },
};

/** Bed rows (raised earth) and the step between bed fronts: a 1-row gap of grass shows between beds. */
const BED_ROWS = 4;
const BED_STEP = 6;

const garden: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'garden',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(GARDEN_TIERS),
  layers: ['shadow'],
  anchor: { x: GARDEN_PIVOT_X / W, y: (GARDEN_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const tier = GARDEN_TIERS[variant ?? 't1'] ?? { w: 56, beds: ['seedling'] };
    const s = seedOf(`garden.${variant ?? 't1'}`);
    const x = GARDEN_PIVOT_X - tier.w / 2;
    const x1 = x + tier.w;
    const plot = new Plot();
    const n = tier.beds.length;
    const backGround = GARDEN_GROUND - 2 - (n - 1) * BED_STEP - BED_ROWS;
    // Behind everything: the cellar mound at the back right, sunflowers at the back left.
    if (tier.cellar) cellarMound(plot, x1 - 16, backGround, 28, 13);
    for (const off of tier.sunflowers ?? []) gardenSunflower(plot, x + off, backGround, 20 + ((off * 7) % 5));
    // Beds back to front, each a little narrower at the back (depth); the beans' teepees over the back bed's right end.
    tier.beds.forEach((crop, i) => {
      const g = GARDEN_GROUND - 2 - (n - 1 - i) * BED_STEP;
      const inset = (n - 1 - i) * 3;
      const bx = x + inset;
      const bw = tier.w - inset * 2;
      bed(plot, bx, bw, g, BED_ROWS);
      const top = g - BED_ROWS;
      const step = crop === 'cabbage' ? 7 : crop === 'onion' ? 4 : crop === 'beet' ? 5 : 4;
      for (let c = bx + 3; c < bx + bw - 3; c += step) {
        if (crop === 'cabbage') cabbage(plot, c + 1, top + 1);
        else if (crop === 'onion') onion(plot, c, top, s);
        else if (crop === 'beet') beet(plot, c, top);
        else {
          plot.set(c, top, 'grass', 3);
          plot.set(c, top - 1, 'grass', 5);
          plot.set(c + 1, top - 1, 'grass', 4);
        }
      }
      if (i === 0) for (const off of tier.beans ?? []) beanPoles(plot, x1 - off - inset, top, 22, s);
    });
    for (const off of tier.pumpkins ?? []) pumpkin(plot, x + off, GARDEN_GROUND - 1);
    if (tier.marigolds) marigolds(plot, x + 1, x1 - 1, GARDEN_GROUND, s);
    if (tier.gate) {
      post(plot, x - 5, GARDEN_GROUND, 18);
      postTie(plot, x - 5, GARDEN_GROUND - 15);
    }
    composeOutlined(buffer, [plot.part(1, 1)], rampSize, { drop: 1 });
    const shadow = layers.shadow;
    if (!shadow) return;
    const tall = tier.beans !== undefined;
    castShadow(shadow, {
      x0: x + Math.floor(tier.w / 2),
      x1,
      groundY: GARDEN_GROUND,
      reach: tall ? 8 : 3,
      depth: tall ? 4 : 2,
    });
  },
};

export default garden;
