// Двір — the trodden yard under a khata (art-director ART-05 review: houses must not stand on a uniform lawn). A
// ground decal 80×20: sun-dried packed earth, lighter than a hole would be (art-director re-review: darker than the
// path it read as a mud pit) — `#9f7a48` base, `#bd9a63` at 50 % on the lit top-left third, a 1-px `#805d35` rim on
// the bottom and right edges only, a few `#634629` foot and wheel marks — inside a ragged ellipse whose edge dithers
// into the grass (50 %, then 25 %), a few pebbles. The khata's cast shadow does the darkening where it falls.
// Drawn by Ground.ts on top of the tiles and under the shadows; the pivot is the centre of the ellipse.
import { valueNoise, seedOf } from '../../lib/noise.ts';
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { pebbles } from '../../lib/recipes.ts';
import { seededRng } from '../../lib/rng.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 80;
const H = 20;

const yard: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'yard',
  size: { w: W, h: H },
  frames: { idle: 1 },
  anchor: { x: 0.5, y: 0.5 },
  generate(_rng, { buffer, rampSize }) {
    const seed = 'yard';
    const plot = new Plot();
    const s = seedOf(seed);
    const cx = (W - 1) / 2;
    const cy = (H - 1) / 2;
    const inYard = (x: number, y: number): boolean => {
      const u = (x - cx) / (W / 2);
      const v = (y - cy) / (H / 2);
      // Ragged edge: the radius wanders with low-frequency noise; the outer rings dither into the grass.
      const d = Math.sqrt(u * u + v * v) + 0.12 * valueNoise(x, y, 7, 3, s);
      return d < 0.78 || (d < 0.9 && (x + y) % 2 === 0) || (d < 1 && x % 2 === 0 && y % 2 === 0);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inYard(x, y)) continue;
        // earth: 2 #634629, 3 #805d35, 4 #9f7a48, 5 #bd9a63
        const litThird = x < W / 3 + (H - y) && y < H * 0.6;
        let shade = litThird && (x + y) % 2 === 0 ? 5 : 4;
        // Rim on the shaded sides only: the last yard px going right or down.
        if ((x >= cx && !inYard(x + 1, y)) || (y >= cy && !inYard(x, y + 1))) shade = 3;
        plot.set(x, y, 'earth', shade);
      }
    }
    // Foot and wheel marks: short 1–2 px dashes.
    const rng = seededRng('yard:marks');
    for (let k = 0; k < 7; k++) {
      const x = 14 + Math.floor(rng() * (W - 30));
      const y = 5 + Math.floor(rng() * (H - 10));
      const len = rng() < 0.5 ? 1 : 2;
      for (let i = 0; i < len; i++) if (plot.has(x + i, y)) plot.set(x + i, y, 'earth', 2);
    }
    pebbles(plot, { x: 16, y: 5, w: W - 32, h: H - 10 }, seed, 3, (x, y) => plot.has(x, y));
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default yard;
