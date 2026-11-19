// Дим із димаря — a chimney smoke puff (plan M2-11, SPEC §6.5 «дим із димарів», §6.3 wind): 3 frames by age, young →
// old: a small dense warm puff fresh from the flue, a wider billow with rounded lobes on top, a large thin cool one
// that frays from below. Young smoke is warm and light (plaster, its brightest px one step under a cloud's
// highlight), old smoke cools and darkens into the air (stone) — art-director M2-11. Lit from the top-left. Binary
// alpha thinned by a fixed scatter of holes instead of soft alpha: the puffs live in the graded world (the night
// grade darkens them like the roofs), and the grade filter does not re-premultiply a half-transparent px — a soft
// puff over the sky would glow at night (CONTEXT §6 «Building life»). Pivot = bottom centre.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { RampName, SpriteGenerator } from '../../lib/types.ts';

/** A round lobe of a puff: centre (frame px), radii. */
interface Lobe {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

interface PuffLook {
  readonly lobes: readonly Lobe[];
  /** Share of px kept in the core / at the rim; `fray` thins the lower part more (an old puff fraying from below). */
  readonly density: number;
  readonly fray: number;
  /** Lit / body / under: ramp and shade. */
  readonly lit: readonly [RampName, number];
  readonly body: readonly [RampName, number];
  readonly under: readonly [RampName, number];
}

const W = 9;
const H = 7;
/** Puff frames by age (odd width, centred on column 4 = the chimney's mouth column). */
export const SMOKE_PUFFS: readonly PuffLook[] = [
  {
    lobes: [{ cx: 4, cy: 4.6, rx: 2.6, ry: 2.1 }],
    density: 1,
    fray: 0,
    lit: ['plaster', 5],
    body: ['plaster', 4],
    under: ['plaster', 3],
  },
  {
    // A body with two rounded lobes on top: the notch between them reads as a billow, not a blob.
    lobes: [
      { cx: 4, cy: 4.4, rx: 3.6, ry: 2.2 },
      { cx: 2.6, cy: 2.6, rx: 1.9, ry: 1.7 },
      { cx: 5.6, cy: 2.3, rx: 1.9, ry: 1.8 },
    ],
    density: 0.85,
    fray: 0.2,
    lit: ['plaster', 4],
    body: ['stone', 5],
    under: ['stone', 4],
  },
  {
    lobes: [
      { cx: 4, cy: 3.6, rx: 4.6, ry: 2.6 },
      { cx: 2.4, cy: 1.8, rx: 2.2, ry: 1.6 },
      { cx: 6, cy: 1.6, rx: 2.4, ry: 1.6 },
    ],
    density: 0.62,
    fray: 0.55,
    lit: ['stone', 5],
    body: ['stone', 4],
    under: ['stone', 3],
  },
];

/** Integer hash → 0..1 (a fixed scatter of holes: a Bayer grid read as a mesh, art review M2-11). */
function scatter(x: number, y: number, f: number): number {
  let h = Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(f + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Normalised distance² of (x, y) to the nearest lobe (< 1 = inside) and that lobe's offsets. */
function nearest(lobes: readonly Lobe[], x: number, y: number): { d: number; nx: number; ny: number } {
  let best = { d: Number.POSITIVE_INFINITY, nx: 0, ny: 0 };
  for (const l of lobes) {
    const nx = (x - l.cx) / l.rx;
    const ny = (y - l.cy) / l.ry;
    const d = nx * nx + ny * ny;
    if (d < best.d) best = { d, nx, ny };
  }
  return best;
}

const smoke: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'smoke',
  size: { w: W, h: H },
  frames: { idle: SMOKE_PUFFS.length },
  anchor: { x: (W - 1) / 2 / W, y: 1 },
  generate(_rng, { buffer, frame, rampSize }) {
    const puff = SMOKE_PUFFS[frame] ?? SMOKE_PUFFS[0];
    if (!puff) return;
    const plot = new Plot();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const { d, nx, ny } = nearest(puff.lobes, x, y);
        if (d > 1) continue;
        // Thinner toward the rim, with age, and (old puffs) toward the bottom.
        const low = y / (H - 1);
        const local = puff.density * (d < 0.35 ? 1 : 1.25 - d * 0.75) * (1 - puff.fray * low * low);
        if (scatter(x, y, frame) > local) continue;
        const [ramp, shade] = nx + ny < -0.3 ? puff.lit : ny > 0.35 ? puff.under : puff.body;
        plot.set(x, y, ramp, shade);
      }
    }
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default smoke;
