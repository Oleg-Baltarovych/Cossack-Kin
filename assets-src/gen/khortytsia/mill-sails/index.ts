// Longer sails for the grown mill (plan M2-07): the tier-I sails (`windmill-sails`, reach 33) redrawn at reach 36
// (`m`, tiers III–IV) and 39 (`l`, tiers V–VI) — same 8-frame quarter turn, laths and canvas. One canvas for both
// (2 × 39 + 6 px), pivot at the hub (centre), so a tier only swaps the frame stem and its lift.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { paintSails, SAIL_FRAMES } from '../windmill-sails/index.ts';

/** Sail reach (px from the hub) per variant. */
export const MILL_SAIL_REACH: Readonly<Record<string, number>> = { m: 36, l: 39 };
const S = 2 * 39 + 6;

const millSails: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'mill-sails',
  size: { w: S, h: S },
  frames: { idle: SAIL_FRAMES },
  variants: Object.keys(MILL_SAIL_REACH),
  anchor: { x: 0.5, y: 0.5 },
  generate(_rng, { variant, frame, buffer, rampSize }) {
    const p = new Plot();
    paintSails(p, frame, S, MILL_SAIL_REACH[variant ?? 'm'] ?? 36);
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default millSails;
