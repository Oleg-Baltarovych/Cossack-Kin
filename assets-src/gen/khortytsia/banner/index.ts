// Корогва in the wind (plan M2-09, ART-BIBLE §6 «малинова корогва», SPEC §16: crimson with a gold cross, no state
// symbols): the cloth only, hung from a pole that the gate / flagpole frame draws. 4 frames of a wave running from the
// hoist to the free end (whole-px row offsets from a table, no trig), swallowtail cut, folds lit where the cloth turns
// toward the sun (top-left). Render cycles the frames at the wind's rate (`fps: 'wind'`, like the windmill sails).
// Pivot = the hoist's top px (the cloth's top-left), so a part's `lift` hangs it right off the pole top.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

/** Cloth size (the gate's static корогва is 11 × 10). */
export const BANNER_CLOTH = { w: 13, h: 10 } as const;
const PAD = 2;
/** The cross's centre in the cloth (column, row): the crossbar is the row above it. */
export const BANNER_CROSS = { x: Math.floor((BANNER_CLOTH.w - 3) / 2), y: Math.floor(BANNER_CLOTH.h / 2) - 1 } as const;
export const BANNER_PAD = PAD;
const W = BANNER_CLOTH.w + 1;
const H = BANNER_CLOTH.h + PAD * 2;
/** One wave period in columns; the 4 frames move it a quarter period each. */
const WAVE = [0, 1, 1, 1, 0, -1, -1, -1] as const;

/** Row offset of column `c` in frame `f`: still at the hoist, up to ±1 mid-cloth, ±2 at the free end. */
export function bannerOffset(c: number, f: number): number {
  const amp = c < 3 ? 0 : c < 9 ? 1 : 2;
  const w = WAVE[(((c - 2 * f) % 8) + 8) % 8] ?? 0;
  return amp === 2 ? w * 2 - Math.sign(w) * (c % 2) : amp * w;
}

const banner: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'banner',
  size: { w: W, h: H },
  frames: { idle: 4 },
  anchor: { x: 0, y: PAD / H },
  generate(_rng, { frame, buffer, rampSize }) {
    const cloth = new Plot();
    const { w, h } = BANNER_CLOTH;
    for (let c = 0; c < w; c++) {
      const dy = bannerOffset(c, frame);
      const slope = bannerOffset(c + 1, frame) - dy;
      for (let r = 0; r < h; r++) {
        // Swallowtail: a V notch in the free end's lower half.
        if (c >= w - 3 && r > h / 2 - 1 && Math.abs(r - h * 0.75) < c - (w - 3) + 0.5) continue;
        // A fold turning up toward the light is lit, one turning down is in shade; the hoist edge lit, the hem dark.
        const fold = slope < 0 ? 4 : slope > 0 ? 2 : 3;
        const shade = r === h - 1 ? 2 : c === 0 ? 4 : fold;
        cloth.set(c, PAD + r + dy, 'crimson', shade);
      }
    }
    // Gold cross in cloth-local space riding ONE wave offset (its centre column's), so the 3-px crossbar stays a
    // straight row in every frame (art-director M2-09: a broken cross read as damage on the Host's banner).
    const { x: mx, y: my } = BANNER_CROSS;
    const lift = bannerOffset(mx, frame);
    for (let k = -2; k <= 2; k++) cloth.set(mx, PAD + my + k + lift, 'gold', k < 0 ? 4 : 3);
    for (let k = -1; k <= 1; k++) cloth.set(mx + k, PAD + my - 1 + lift, 'gold', 4);
    compose(buffer, [cloth.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default banner;
