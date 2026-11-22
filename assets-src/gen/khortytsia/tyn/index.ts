// Тин (wattle fence) segment with a глечик hung upside down on a stake (plan ART-05, ART-BIBLE §5–6, recipes
// docs/art/recipes/materials-1.md). Pivot at the base; contact shadow on the `shadow` layer. `tyn-end` (M2-29 A2,
// art-director): a lone fragment (the farm's near corner) — the same stakes, the weave cut to end on a stake at both
// sides instead of running off the frame.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { glechyk, POT_HEIGHT, wattle, WATTLE_COURSE } from '../../lib/recipes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 40;
const H = 32;
/** Ground row (stakes stand on it); the sprite's pivot is the bottom edge of this row. */
export const TYN_GROUND = 27;
/** First weave row: three 4-row courses end 2 rows above the ground, so the stake feet show. */
const WEAVE_TOP = TYN_GROUND - 3 * WATTLE_COURSE - 1;
const POT_STAKE = 2;
const POT_RISE = 5;

/** The fence segment (`tyn`, tiles side by side) or the lone fragment ending on a stake at both sides (`tyn-end`). */
export const tynGenerator = (id: 'tyn' | 'tyn-end'): SpriteGenerator => ({
  atlas: 'khortytsia',
  id,
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (TYN_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const end = id === 'tyn-end';
    const plot = new Plot();
    const spec = {
      seed: 'tyn',
      x: 0,
      w: W,
      ground: TYN_GROUND + 1,
      top: WEAVE_TOP,
      courses: 3,
      rise: { [POT_STAKE]: POT_RISE },
    };
    // The end piece: the same stake sequence (a prefix of the run's), the weave stopping on the last stake.
    const all = wattle(new Plot(), spec);
    const first = end ? (all[0]?.x ?? 0) : 0;
    const last = end ? (all.at(-1)?.x ?? W - 2) + 2 : W;
    const stakes = wattle(plot, {
      ...spec,
      w: last,
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < first; x++) plot.delete(x, y);
    const st = stakes[POT_STAKE];
    if (st) glechyk(plot, st.x, st.top - (POT_HEIGHT - 1));
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
    const shadow = layers.shadow;
    if (shadow) {
      contactShadow(shadow, { x0: first, x1: last, groundY: TYN_GROUND, height: 4 });
      // The fragment's shadow stops at its end posts' outer edges (the run's tiles on into the next segment).
      if (end) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < first || x >= last) shadow.clear(x, y);
    }
  },
});

export default tynGenerator('tyn');
