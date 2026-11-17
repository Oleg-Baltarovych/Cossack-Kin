// Частокіл — a 16-px palisade section (plan ART-11, ART-BIBLE §5–6): four 4-px stakes of different heights (±6 px —
// ±3 did not survive at phone size), pointed, lit on their left faces, one leaning stake per variant except h0, bound
// by two rows of 2-px lashing; tiles side by side along the
// rampart. Four height variants (h0 tallest … h3 lowest) mixed by the layout. Pivot bottom-left (the ground row).
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { lashing, palisadeStake } from '../../lib/recipes-sich.ts';
import { seededRng } from '../../lib/rng.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 16;
const H = 40;
/** Ground row (stake feet); the pivot is the bottom edge of this row. */
export const PALISADE_GROUND = 39;
/** Base height above the ground per variant (the stakes vary ±6 px around it). */
const HEIGHTS: Readonly<Record<string, number>> = { h0: 32, h1: 29, h2: 26, h3: 23 };

const palisade: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'palisade',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(HEIGHTS),
  layers: ['shadow'],
  anchor: { x: 0, y: (PALISADE_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const base = HEIGHTS[variant ?? 'h0'] ?? 34;
    const rng = seededRng(`palisade.${variant ?? 'h0'}`);
    const plot = new Plot();
    const tops = [0, 4, 8, 12].map((x) => ({ x, top: PALISADE_GROUND - base + (Math.floor(rng() * 13) - 6) }));
    const leaning = variant === 'h0' ? -1 : Math.floor(rng() * 3) + 1; // one settled stake in most sections
    tops.forEach((s, i) => {
      palisadeStake(plot, s.x, Math.max(1, s.top), PALISADE_GROUND, rng, i === leaning ? (i % 2 === 0 ? 1 : -1) : 0);
    });
    // Two rows of lashing, at a third and two thirds of the lowest stake.
    const low = Math.max(...tops.map((s) => s.top));
    const span = PALISADE_GROUND - low;
    const stakeAt = (x: number): boolean => x % 4 !== 3;
    for (const k of [0.3, 0.65]) lashing(plot, 0, W, Math.round(low + span * k), stakeAt);
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
    // Contact shadow: a 2-row band at the feet, solid, then 50 % (tiles join into one line along the rampart).
    const shadow = layers.shadow;
    if (shadow) {
      for (let x = 0; x < W; x++) {
        shadow.set(x, PALISADE_GROUND, { ramp: 'ink', shade: 1 });
        if (x % 2 === 0) shadow.set(x, PALISADE_GROUND - 1, { ramp: 'ink', shade: 1 });
      }
    }
  },
};

export default palisade;
