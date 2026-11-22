// Спалах — the flash of a new tier by day (plan M2-12, SPEC §6.7; M2-29 art-director: the old ring + 4 ticks read as
// a crosshair): a twinkle star, no ring. 3 frames — a small 4-ray star, the full 8-ray star (long orthogonal rays,
// short diagonals), its rays breaking off outward as it fades. Cream (plaster 6) at the heart, gold 2 toward the tips
// and as a 1-px rim round the core, so it reads on whitewash as well as on sky. Drawn after the grade like the coins;
// at night render/fx/build.ts lights the building's own rim instead. Pivot = centre px.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const S = 25;
const C = 12;

/** Per frame: orthogonal ray length, diagonal ray length, core radius (manhattan; −1 = none), first lit ray px. */
const FRAMES = [
  { ray: 4, diagonal: 0, core: 1, from: 1 },
  { ray: 10, diagonal: 5, core: 2, from: 1 },
  { ray: 9, diagonal: 4, core: -1, from: 5 },
] as const;

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const DIAG = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

const flash: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'flash',
  size: { w: S, h: S },
  frames: { idle: 3 },
  anchor: { x: C / S, y: C / S },
  generate(_rng, { frame, buffer, rampSize }) {
    const f = FRAMES[frame] ?? FRAMES[0];
    const p = new Plot();
    // Rays: cream for the inner half, gold 2 for the outer half (the fading frame is all gold 2).
    const ray = (dirs: readonly (readonly [number, number])[], len: number, from: number): void => {
      for (let k = from; k <= len; k++) {
        const cream = f.core >= 0 && k <= Math.ceil(len / 2);
        for (const [dx, dy] of dirs) p.set(C + dx * k, C + dy * k, cream ? 'plaster' : 'gold', cream ? 6 : 2);
      }
    };
    ray(ORTHO, f.ray, f.from);
    // The fading frame keeps only the diagonals' tips.
    ray(DIAG, f.diagonal, f.core >= 0 ? 1 : f.diagonal - 1);
    if (f.core >= 0) {
      // A cream diamond core with a gold 2 rim where it meets open air (not along the rays).
      for (let dy = -f.core - 1; dy <= f.core + 1; dy++) {
        for (let dx = -f.core - 1; dx <= f.core + 1; dx++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d <= f.core) p.set(C + dx, C + dy, 'plaster', 6);
          else if (d === f.core + 1 && dx !== 0 && dy !== 0) p.set(C + dx, C + dy, 'gold', 2);
        }
      }
    }
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default flash;
