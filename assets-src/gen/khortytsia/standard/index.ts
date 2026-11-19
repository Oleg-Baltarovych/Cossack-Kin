// Стяг, що здіймається — the standard hoisted beside a building that reached a new tier (plan M2-12, SPEC §6.5/§6.7;
// §16: crimson with gold, no state symbols): a wooden pole with a gold finial; 6 frames — the furled cloth climbs the
// pole (0–3), opens at the top (4) and flies (5, held while the celebration lasts). The flying cloth is 12×8 crimson
// with a gold hoist band and a 2-px swallow-tail, lit top edge; shades kept high (crimson ≥ 2, gold 4–5) so it holds
// under the night grade (art-director M2-12), and the finial is in the `@emissive` set (it catches the light at
// night). Pivot = the pole's foot.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 16;
const H = 42;
const POLE = 1;
const FOOT = H - 1;
/** The pole's top row; the finial sits on the 2 rows above it. */
const POLE_TOP = 2;
/** Per frame: the cloth's top row and its open width (furled = narrow). */
const STEPS = [
  { top: 30, w: 3 },
  { top: 22, w: 3 },
  { top: 15, w: 4 },
  { top: 8, w: 7 },
  { top: 4, w: 10 },
  { top: 4, w: 12 },
] as const;
const CLOTH_H = 8;
/** Row shift of a flying cloth's column (the last frame only): one whole-px wave in the middle of the cloth. */
const WAVE = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0] as const;

const standard: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'standard',
  size: { w: W, h: H },
  frames: { idle: STEPS.length },
  layers: ['emissive'],
  anchor: { x: POLE / W, y: FOOT / H },
  generate(_rng, { frame, buffer, layers, rampSize }) {
    const step = STEPS[frame] ?? STEPS[0];
    const p = new Plot();
    const glow = new Plot();
    for (let y = POLE_TOP; y <= FOOT; y++) {
      p.set(POLE, y, 'wood', 4);
      p.set(POLE + 1, y, 'wood', 1);
    }
    // Gold finial over the pole (also its night glint).
    for (const [x, y, shade] of [
      [POLE, POLE_TOP - 1, 4],
      [POLE + 1, POLE_TOP - 1, 4],
      [POLE, POLE_TOP - 2, 5],
    ] as const) {
      p.set(x, y, 'gold', shade);
      glow.set(x, y, 'gold', shade);
    }
    const x0 = POLE + 2;
    const flying = frame === STEPS.length - 1;
    const furled = step.w <= 4;
    for (let c = 0; c < step.w; c++) {
      const dy = flying ? (WAVE[c] ?? 0) : 0;
      // Furled cloth hangs straight down from the hoist rope, longer than it is wide; open cloth is CLOTH_H rows.
      const rows = furled ? CLOTH_H + 2 - c : CLOTH_H;
      const tail = step.w >= 10 && c >= step.w - 2;
      for (let r = 0; r < rows; r++) {
        // The swallow-tail: a V cut into the free end, widest at the last column.
        const cut = step.w - 1 - c;
        if (tail && r >= 2 + cut && r < rows - 2 - cut) continue;
        const band = c < 2;
        const fold = furled && c % 2 === 1;
        if (band) p.set(x0 + c, step.top + r + dy, 'gold', r === 0 ? 5 : 4);
        else p.set(x0 + c, step.top + r + dy, 'crimson', r === 0 ? 4 : r === rows - 1 ? 2 : fold ? 2 : 3);
      }
    }
    compose(buffer, [p.part(1, 1, glow)], rampSize, {
      light: false,
      occlusion: false,
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
  },
};

export default standard;
