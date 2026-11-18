// Вулики (plan M2-06, ART-BIBLE §6 «вулики-колоди на пасіці»): the apiary's add-on, placed by tier — `stump` a low
// дуплянка (8×10, tier I), `log` an upright log hive under a straw cap (16 px, tiers II–VI, 2 → 6 of them), so the
// apiary only ever grows taller. Ramps: wood, thatch, ink (the entrance). 12×18, pivot at the foot; contact + short
// cast shadow.
import { castShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { composeOutlined, logHive, stumpHive } from '../../lib/recipes-farm.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 12;
const H = 18;
export const HIVE_GROUND = 15;
const CX = 5;

const hive: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'hive',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: ['log', 'stump'],
  layers: ['shadow'],
  // Pivot on a whole px (the left edge of column CX): a half-px anchor lands sprites on a texel tie that
  // the atlas packing decides (M2-07: a 1-px hive shift when the atlas grew).
  anchor: { x: CX / W, y: (HIVE_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const p = new Plot();
    if (variant === 'stump') stumpHive(p, CX + 1, HIVE_GROUND);
    else logHive(p, CX, HIVE_GROUND, 'hive');
    composeOutlined(buffer, [p.part(1, 1)], rampSize);
    if (layers.shadow) castShadow(layers.shadow, { x0: CX, x1: CX + 4, groundY: HIVE_GROUND, reach: 4, depth: 2 });
  },
};

export default hive;
