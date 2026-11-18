// Gilt accents of tier VI (plan M2-07, ART-BIBLE §6 «золотий акцент, легке мерехтіння»): `vane` — the windmill's
// gold weathervane (a cockerel on a rod over an arrow), `jug` — the potter's gold-glazed глечик upside down on a
// stake. The shimmer is baked: 8 frames, a glint (gold 5) sweeps diagonally over the gold in the last three and the
// rest are still — no runtime shader. Ramps: gold, crimson, wood. 11×17, pivot at the base.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 11;
const H = 17;
export const GILT_FRAMES = 8;
const GROUND = 16;

/** Cockerel mask over the rod top (rows top → bottom), '#' gold body, 'c' crimson comb, 't' tail. */
const COCKEREL = ['..c......', '.###...t.', '####..tt.', '..######.', '...####..', '....#....'];
/** Upside-down jug rows (foot on top), widths. */
const JUG = [3, 5, 5, 7, 7, 7, 3, 3, 5];

const gilt: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'gilt',
  size: { w: W, h: H },
  frames: { idle: GILT_FRAMES },
  variants: ['vane', 'jug'],
  anchor: { x: 5 / W, y: (GROUND + 1) / H },
  generate(_rng, { variant, frame, buffer, rampSize }) {
    const p = new Plot();
    const gold: [number, number][] = [];
    const cx = 5;
    if (variant === 'vane') {
      // Short (11 px) so the vane on the mill's pole stays below the river band.
      for (let y = 12; y <= GROUND; y++) p.set(cx, y, 'gold', y > 13 ? 2 : 3);
      for (let x = 2; x <= 8; x++) p.set(x, 13, 'gold', x < cx ? 4 : 2); // the arrow
      p.set(1, 13, 'gold', 3);
      p.set(2, 12, 'gold', 3);
      p.set(2, 14, 'gold', 3);
      COCKEREL.forEach((row, r) => {
        Array.from(row, (ch) => ch).forEach((ch, c) => {
          const x = c + 1;
          const y = r + 6;
          if (ch === 'c') p.set(x, y, 'crimson', 4);
          else if (ch === '#' || ch === 't') {
            const shade = ch === 't' ? 2 : r <= 1 || c <= 2 ? 4 : 3;
            p.set(x, y, 'gold', shade);
            gold.push([x, y]);
          }
        });
      });
    } else {
      for (let y = 10; y <= GROUND; y++) {
        p.set(cx, y, 'wood', 4);
        p.set(cx + 1, y, 'wood', 2);
      }
      JUG.forEach((width, r) => {
        const half = (width - 1) / 2;
        for (let c = cx - half; c <= cx + half; c++) {
          const edge = c === cx - half || c === cx + half;
          const y = 1 + r;
          if (r === 4 && !edge) {
            p.set(c, y, 'crimson', c > cx ? 2 : 3); // painted band
            continue;
          }
          // The rim (bottom row, on the stake) one ring darker: reads as a pot hung upside down.
          const rim = r === JUG.length - 1;
          const shade = rim ? 1 : edge ? (c < cx ? 3 : 1) : c > cx + 1 ? 2 : r >= 1 && r <= 3 && c < cx ? 4 : 3;
          p.set(c, y, 'gold', shade);
          gold.push([c, y]);
        }
      });
    }
    // One gold 5 px that survives the night grade (the cockerel's head / the jug's shoulder).
    p.set(variant === 'vane' ? 3 : cx - 1, variant === 'vane' ? 7 : 3, 'gold', 5);
    // Baked shimmer: in frames 5–7 a 2-px diagonal glint crosses the gold, top-left to bottom-right.
    const sweep = frame - (GILT_FRAMES - 3);
    if (sweep >= 0) {
      const d = 7 + sweep * 5;
      for (const [x, y] of gold) if (x + y === d || x + y === d + 1) p.set(x, y, 'gold', 5);
    }
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
  },
};

export default gilt;
