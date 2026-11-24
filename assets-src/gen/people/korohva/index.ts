// Корогва on the march (plan M3-13, SPEC §6.6 «під малиновою корогвою», §16: crimson with a gold cross, no state
// symbols): the Sich banner's cloth (khortytsia `banner`: 13 × 10, the same wave table `bannerOffset`, fold lighting
// and the straight gold cross riding one wave offset) with a clean swallowtail — a V notch 2 px deep centred on the fly
// end in every frame (art-director M3-13: the gate banner's lower-half notch read as a ragged edge on the march).
// 4 frames; packed in the shared `people` atlas next to its bearer (`khorunzhyi`), so every land has it. Pivot = the
// hoist's top px; render hangs it at the pole top (content `BEARER_BANNER`) and cycles it at the wind's rate
// (`fps: 'wind'`), never mirrored: like every banner of the world it flies downwind, whichever way the bearer walks.
import { BANNER_CLOTH, BANNER_CROSS, BANNER_PAD, bannerOffset } from '../../khortytsia/banner/index.ts';
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const PAD = BANNER_PAD;
const W = BANNER_CLOTH.w + 1;
const H = BANNER_CLOTH.h + PAD * 2;

/** Whether cloth px (c, r) is cut away by the swallowtail: rows 3–6 of the last column, 4–5 of the one before. */
export function inNotch(c: number, r: number): boolean {
  const { w, h } = BANNER_CLOTH;
  const depth = c - (w - 3);
  return depth > 0 && Math.abs(r - (h - 1) / 2) < depth;
}

const korohva: SpriteGenerator = {
  atlas: 'people',
  id: 'korohva',
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
        if (inNotch(c, r)) continue;
        // A fold turning up toward the light is lit, one turning down is in shade; the hoist edge lit, the hem dark.
        const fold = slope < 0 ? 4 : slope > 0 ? 2 : 3;
        const shade = r === h - 1 ? 2 : c === 0 ? 4 : fold;
        cloth.set(c, PAD + r + dy, 'crimson', shade);
      }
    }
    const { x: mx, y: my } = BANNER_CROSS;
    const lift = bannerOffset(mx, frame);
    for (let k = -2; k <= 2; k++) cloth.set(mx, PAD + my + k + lift, 'gold', k < 0 ? 4 : 3);
    for (let k = -1; k <= 1; k++) cloth.set(mx + k, PAD + my - 1 + lift, 'gold', 4);
    compose(buffer, [cloth.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default korohva;
