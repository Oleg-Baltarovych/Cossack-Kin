// Курган — a Scythian burial mound in the steppe band (plan M2-29 A5, Q13 item 5; SPEC §3.7 «степ із курганами»).
// A low, wide, grass-grown dome — no stone «баба» on it (none in the ART-BIBLE references for Khortytsia): the steppe
// sward of the ground tiles (recipes-steppe.ts) shaped into a mound and lit from the top-left — the sun-side slope and
// crest a step lighter (thatch 3, a 1-px thatch 4 rim on the crest), the far slope a step darker and cooler (thatch 1,
// earth 1), a dark foot on the shaded side; dry blades break the skyline so the top is never a smooth arc. Outline only on the shaded side; cast shadow down-right. 150×38, pivot at the base centre.
import type { RampName } from '../../lib/buffer.ts';
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { seededRng } from '../../lib/rng.ts';
import { dryBlade, steppeField } from '../../lib/recipes-steppe.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 150;
const H = 38;
export const KURGAN_GROUND = 35;
/** The mound: centre column, half-width at the foot, height at the crest (px). */
export const KURGAN_MOUND = { cx: 68, rx: 64, h: 26 } as const;
const { cx: CX, rx: RX, h: TOP_H } = KURGAN_MOUND;

/** Height of the mound's surface above the ground row at column x (0 outside it): a flattened dome. */
export function kurganHeight(x: number): number {
  const u = (x + 0.5 - CX) / RX;
  if (Math.abs(u) >= 1) return 0;
  return Math.round(TOP_H * Math.pow(1 - u * u, 0.65));
}

const kurgan: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'kurgan',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: CX / W, y: (KURGAN_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const sward = new Plot();
    steppeField(sward, { w: W, h: H }, 'kurgan:sward');
    const p = new Plot();
    const rng = seededRng('kurgan');
    for (let x = 0; x < W; x++) {
      const h = kurganHeight(x);
      if (h <= 0) continue;
      const top = KURGAN_GROUND - h;
      const u = (x + 0.5 - CX) / RX;
      for (let y = top; y <= KURGAN_GROUND; y++) {
        const src = sward.get(x, y);
        if (!src) continue;
        // The form reads from the light, not the sward's grain: a dome lit from the top-left — brightest on the
        // sun-side shoulder, darkest low on the far side — in four dithered tones (shade: thatch 1 over earth 1, the
        // sward itself, thatch 3, thatch 3/4 on the lit shoulder).
        const depth = (y - top) / (h + 1);
        const light = Math.min(1, Math.max(0, 0.62 - 0.55 * u - 0.45 * depth));
        const level = Math.min(3, Math.floor(light * 3 + ((x * 5 + y * 3) % 4) / 4 - 0.1));
        const dither = (x + y) % 2 === 0;
        let ramp: RampName = src.ramp === 'earth' ? 'thatch' : src.ramp;
        let s = src.shade;
        if (level <= 0) {
          ramp = dither ? 'thatch' : 'earth';
          s = 1;
        } else if (level === 2) {
          ramp = 'thatch';
          s = 3;
        } else if (level >= 3) {
          ramp = 'thatch';
          s = dither ? 4 : 3;
        }
        if (y === KURGAN_GROUND && u > -0.2) s = 1;
        p.set(x, y, ramp, s);
      }
      // The crest rim on the lit half: thatch 4 on the skyline px.
      if (u < 0.3 && u > -0.75) p.set(x, top, 'thatch', 4);
    }
    // Dry blades breaking the skyline every 2–5 px, lit tips on the sun side.
    for (let x = CX - RX + 4; x < CX + RX - 4; x += 2 + Math.floor(rng() * 4)) {
      const h = kurganHeight(x);
      if (h < 3) continue;
      dryBlade(p, x, KURGAN_GROUND - h, 2 + Math.floor(rng() * 3), x < CX ? -1 : 1, x < CX + 8);
    }
    // A few rust sorrel heads in the grass of the near slope.
    for (const [x, y] of [
      [CX - 22, KURGAN_GROUND - 6],
      [CX - 20, KURGAN_GROUND - 5],
      [CX + 18, KURGAN_GROUND - 4],
    ] as const) {
      p.set(x, y - 1, 'gold', 1);
      p.set(x, y, 'crimson', 2);
      p.set(x, y + 1, 'thatch', 2);
    }
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow)
      castShadow(layers.shadow, { x0: CX - 6, x1: CX + RX + 2, groundY: KURGAN_GROUND + 1, reach: 8, depth: 2 });
  },
};

export default kurgan;
