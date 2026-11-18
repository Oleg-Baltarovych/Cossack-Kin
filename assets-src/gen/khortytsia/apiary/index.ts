// Пасіка, tiers I–VI (plan M2-06, ART-BIBLE §6 «вулики-колоди на пасіці»): the ground of the apiary — a flower
// meadow for the bees that widens with the tier — and its furniture: II mallows, III a bench, from IV on a reed курінь
// (shelter) that stays, VI a голубець with the beekeepers' icon (the gold accent). The hives (`hive.stump` at I,
// `hive.log` ×2…6 after), the bees (`bees`) and the beekeeper's hut (`apiary-hut`, tiers V–VI, a lit window at night)
// are add-ons placed by the layout; the apiary's height only grows from tier to tier.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { mallow } from '../../lib/recipes.ts';
import { bench, composeOutlined, flowerPatch, holubets, shelter } from '../../lib/recipes-farm.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 104;
const H = 44;
/** Front row of the meadow; the pivot is the bottom edge of this row. */
export const APIARY_GROUND = 38;
export const APIARY_PIVOT_X = 52;

interface Tier {
  readonly w: number;
  readonly depth: number;
  /** Offsets from the pivot. */
  readonly bench?: number;
  readonly shelter?: number;
  readonly mallows?: readonly number[];
  readonly holubets?: number;
}

export const APIARY_TIERS: Readonly<Record<string, Tier>> = {
  t1: { w: 28, depth: 6 },
  t2: { w: 40, depth: 7, mallows: [-17] },
  t3: { w: 52, depth: 8, bench: -12, mallows: [-23, 22] },
  t4: { w: 64, depth: 9, bench: -2, shelter: -22, mallows: [28] },
  t5: { w: 80, depth: 10, shelter: 30, mallows: [37, -38] },
  t6: { w: 92, depth: 10, shelter: 24, mallows: [-44], holubets: 41 },
};

const apiary: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'apiary',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(APIARY_TIERS),
  layers: ['shadow'],
  anchor: { x: APIARY_PIVOT_X / W, y: (APIARY_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const tier = APIARY_TIERS[variant ?? 't1'] ?? { w: 28, depth: 6 };
    const cx = APIARY_PIVOT_X;
    const back = APIARY_GROUND - tier.depth + 2;
    const plot = new Plot();
    // Back to front: the shelter, the shrine and the bench stand at the back of the meadow, flowers over the patch.
    if (tier.shelter !== undefined) shelter(plot, cx + tier.shelter, back + 1, 18, 15);
    if (tier.holubets !== undefined) holubets(plot, cx + tier.holubets, back + 2, 22);
    if (tier.bench !== undefined) bench(plot, cx + tier.bench - 9, back + 1, 18);
    flowerPatch(plot, cx - tier.w / 2, tier.w, APIARY_GROUND, tier.depth, `apiary.${variant ?? 't1'}`);
    for (const m of tier.mallows ?? []) mallow(plot, cx + m, APIARY_GROUND - 1, 11);
    composeOutlined(buffer, [plot.part(1, 1)], rampSize, { drop: 1 });
    const shadow = layers.shadow;
    if (!shadow) return;
    const tallX = tier.shelter ?? tier.bench ?? 0;
    castShadow(shadow, { x0: cx + tallX - 2, x1: cx + tallX + 6, groundY: back + 1, reach: 6, depth: 3 });
  },
};

export default apiary;
