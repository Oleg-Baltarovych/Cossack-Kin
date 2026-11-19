// Прапорець — a small pennant in the wind (plan M2-11, SPEC §6.5 «прапорці на ярмарку», §16: no state symbols):
// the cloth only, hung off a pole that the frame under it draws (the fair's pole, a stall's post). A sine wave runs
// from the hoist to the tip as whole-column shifts (the top edge steps 1 px at a time, never breaks), the cloth tapers
// and ends in a 2-px swallow-tail; 4 frames (a table, no trig) that render cycles at the wind's rate (`fps: 'wind'`).
// Variants: `a` crimson with a gold hoist band (the fair's pole), `b` green with a crimson tail (a stall's post) — its
// light top edge and dark hem keep it off the grass behind (art-director M2-11). Pivot = the hoist's top px.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { RampName, SpriteGenerator } from '../../lib/types.ts';

/** Cloth length and its height at the hoist. */
export const PENNANT_CLOTH = { w: 10, h: 5 } as const;
const PAD = 2;
const W = PENNANT_CLOTH.w;
const H = PENNANT_CLOTH.h + PAD * 2;
export const PENNANT_FRAMES = 4;
/** One wave period (8 columns) sampled per column; each frame moves it 2 columns. Neighbours differ by ≤ 1 row. */
const WAVE = [0, 0, 1, 1, 0, 0, -1, -1] as const;

/** Row shift of cloth column `c` in frame `f`: still at the hoist, ±1 row along the rest of the cloth. */
export function pennantOffset(c: number, f: number): number {
  return c < 2 ? 0 : (WAVE[(((c - 2 * f) % 8) + 8) % 8] ?? 0);
}

/** Rows of column `c` (taper from the hoist) — the last 2 columns are the swallow-tail's two prongs. */
function columnRows(c: number, h: number, w: number): readonly number[] {
  const n = h - Math.floor(c / 4);
  const rows = Array.from({ length: n }, (_, r) => r);
  return c >= w - 2 ? rows.filter((r) => r === 0 || r === n - 1) : rows;
}

interface Look {
  readonly cloth: RampName;
  readonly band: RampName;
  /** Shades: top edge (lit), body, hem (dark). */
  readonly shades: readonly [number, number, number];
  readonly bandShades: readonly [number, number, number];
}

const LOOKS: Readonly<Record<string, Look>> = {
  a: { cloth: 'crimson', band: 'gold', shades: [4, 3, 1], bandShades: [4, 3, 1] },
  b: { cloth: 'grass', band: 'crimson', shades: [6, 4, 1], bandShades: [4, 3, 1] },
};

const pennant: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'pennant',
  size: { w: W, h: H },
  frames: { idle: PENNANT_FRAMES },
  variants: Object.keys(LOOKS),
  anchor: { x: 0, y: PAD / H },
  generate(_rng, { variant, frame, buffer, rampSize }) {
    const look = LOOKS[variant ?? 'a'] ?? LOOKS.a;
    if (!look) return;
    const cloth = new Plot();
    const { w, h } = PENNANT_CLOTH;
    for (let c = 0; c < w; c++) {
      const dy = pennantOffset(c, frame);
      // A column turning down toward the tip lies in the fold's shade.
      const fold = pennantOffset(c + 1, frame) > dy ? 1 : 0;
      const band = variant === 'b' ? c >= w - 3 : c < 2;
      const [top, body, hem] = band ? look.bandShades : look.shades;
      const rows = columnRows(c, h, w);
      const last = rows[rows.length - 1] ?? 0;
      for (const r of rows) {
        const shade = r === 0 ? top : r === last ? hem : body - fold;
        cloth.set(c, PAD + r + dy, band ? look.band : look.cloth, shade);
      }
    }
    compose(buffer, [cloth.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default pennant;
