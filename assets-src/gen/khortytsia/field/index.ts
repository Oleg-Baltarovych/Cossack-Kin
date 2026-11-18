// Пшеничне поле, tiers I–VI (plan M2-06, ART-BIBLE §6): ploughed land that grows with the tier, wider and deeper
// (more furrows = more receding rows of ears = taller) — I three furrows of sprouts, II green wheat with poppies and
// cornflowers, III ripe wheat, IV–V the right part reaped (stubble beside a shaded cut face), VI the widest, gold
// glints on the ears and «борода» (the last tuft left uncut, tied with a ribbon) in the stubble. Add-ons (scarecrow,
// stooks, cart) are separate sprites placed by the layout.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { boroda, composeOutlined, wheatField, type Crop } from '../../lib/recipes-farm.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 112;
const H = 44;
/** Front soil row; the pivot is the bottom edge of this row. */
export const FIELD_GROUND = 38;
export const FIELD_PIVOT_X = 56;

interface Tier {
  readonly w: number;
  readonly depth: number;
  readonly crop: Crop;
  readonly height: number;
  readonly mown?: number;
  readonly flowers?: boolean;
  readonly gold?: boolean;
}

export const FIELD_TIERS: Readonly<Record<string, Tier>> = {
  t1: { w: 48, depth: 10, crop: 'sprout', height: 0 },
  t2: { w: 64, depth: 10, crop: 'green', height: 5, flowers: true },
  t3: { w: 80, depth: 13, crop: 'ripe', height: 6, flowers: true },
  t4: { w: 88, depth: 13, crop: 'ripe', height: 7, mown: 0.3, flowers: true },
  t5: { w: 96, depth: 16, crop: 'ripe', height: 7, mown: 0.4, flowers: true },
  t6: { w: 104, depth: 16, crop: 'ripe', height: 8, mown: 0.4, flowers: true, gold: true },
};

const field: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'field',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(FIELD_TIERS),
  layers: ['shadow'],
  anchor: { x: FIELD_PIVOT_X / W, y: (FIELD_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const tier = FIELD_TIERS[variant ?? 't1'] ?? { w: 48, depth: 10, crop: 'sprout', height: 0 };
    const x = FIELD_PIVOT_X - tier.w / 2;
    const plot = new Plot();
    const { standX1 } = wheatField(plot, { seed: `field.${variant ?? 't1'}`, x, ground: FIELD_GROUND, ...tier });
    if (tier.gold) boroda(plot, standX1 + 5, FIELD_GROUND - 2);
    composeOutlined(buffer, [plot.part(1, 1)], rampSize);
    const shadow = layers.shadow;
    if (!shadow) return;
    const crop = tier.crop !== 'sprout';
    // The standing crop throws a low shadow onto the stubble / grass to its right; a sprouting patch only a contact line.
    castShadow(shadow, {
      x0: crop ? Math.round((x + standX1) / 2) : x,
      x1: crop ? standX1 : x + tier.w,
      groundY: FIELD_GROUND,
      reach: crop ? 6 : 0,
      depth: crop ? 3 : 1,
    });
  },
};

export default field;
