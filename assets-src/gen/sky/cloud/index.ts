// Хмари — volumetric cumulus (plan ART-07, ART-BIBLE §8): a height field of spherical puffs merged with a smooth
// max (no seams where puffs meet) on a base that steps ±1 px, lit from the top-left (normal·L), mapped onto the
// `plaster` ramp (lavender belly → cream-white tops). Dither only in the narrow band between two ramp steps.
// The clouds layer is LUT-graded; per-key brightness (render) turns them into dark masses at dusk and night.
// Two frames per variant:
// - `idle`: the cloud;
// - `rim`: a 1–2 px band along the underside and the sun-facing (left) silhouette, white, binary alpha. Render tints
//   it per key (gold at golden hour, rose at dawn, mauve at dusk) and draws it over the cloud — the glow from below
//   of a low sun (Kuindzhi), which a top-left baked light cannot give.
// Variants are seeds and sizes; the pivot is the middle of the base.
import { Plot } from '../../lib/plot.ts';
import { compose } from '../../lib/passes.ts';
import { seededRng } from '../../lib/rng.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 128;
const H = 44;
/** Variant → cloud footprint (width, puff count). Heights follow from the puffs. */
export const CLOUD_VARIANTS: Readonly<Record<string, { readonly w: number; readonly puffs: number }>> = {
  c1: { w: 120, puffs: 7 },
  c2: { w: 92, puffs: 6 },
  c3: { w: 70, puffs: 5 },
  c4: { w: 52, puffs: 4 },
  c5: { w: 104, puffs: 6 },
};
/** Nominal base row (the cloud's underside); the real base steps ±1 px along x. */
const BASE = H - 5;
/** Largest puff radius: a tower of puff + cap still fits in the frame height. */
const MAX_R = 18;
/** Smooth-max blend width (px): puffs merge into one surface instead of meeting in a crease. */
const SMOOTH = 3;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number): number => ((BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
/** Coarse quantization keeps the output identical across JS engines (generator contract). */
const q = (v: number): number => Math.round(v * 256) / 256;

interface Puff {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

interface CloudShape {
  readonly puffs: readonly Puff[];
  /** Base row per column (BASE ± 1, stepping every 6–10 px). */
  readonly base: readonly number[];
}

function shapeFor(variant: string, w: number, count: number): CloudShape {
  const rng = seededRng(`cloud.${variant}:puffs`);
  const x0 = Math.round((W - w) / 2);
  const puffs: Puff[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    // Taller in the middle (cumulus tower), smaller toward the ends; neighbours always overlap (no loose balls).
    const mid = 1 - Math.abs(t - 0.5) * 2;
    const r = Math.min(MAX_R, Math.round(6 + mid * (w / 6) + rng() * 3));
    const x = x0 + Math.round(w * (0.1 + 0.8 * t) + (rng() - 0.5) * 4);
    const y = BASE - Math.round(r * (0.35 + rng() * 0.25));
    puffs.push({ x, y, r });
  }
  // Cauliflower cap: two smaller puffs on top of the tallest ones; the cap's top row stays ≥ 1.
  const tall = [...puffs].sort((a, b) => b.r - a.r).slice(0, 2);
  for (const p of tall) {
    const r = Math.round(p.r * 0.55);
    const y = Math.max(Math.ceil(r / 1.15) + 1, p.y - Math.round(p.r * 0.75));
    puffs.push({ x: p.x + Math.round((rng() - 0.6) * p.r * 0.6), y, r });
  }
  const base: number[] = [];
  let offset = 0;
  let next = 0;
  for (let x = 0; x < W; x++) {
    if (x >= next) {
      offset = rng() < 0.5 ? (offset === 0 ? 1 : 0) : offset === 0 ? -1 : 0;
      next = x + 6 + Math.floor(rng() * 5);
    }
    base.push(BASE + offset);
  }
  return { puffs, base };
}

/** Polynomial smooth max (only + − × ÷: deterministic across engines). */
function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/** Height of the puff field at (x, y); 0 outside. Rows below the stepped base are cut flat. */
function height(shape: CloudShape, x: number, y: number): number {
  if (x < 0 || x >= W || y < 0 || y > (shape.base[x] ?? BASE)) return 0;
  let best = 0;
  let any = false;
  for (const p of shape.puffs) {
    const dx = x - p.x;
    const dy = (y - p.y) * 1.15;
    const d2 = p.r * p.r - dx * dx - dy * dy;
    if (d2 <= 0) continue;
    const h = Math.sqrt(d2);
    best = any ? smax(best, h, SMOOTH) : h;
    any = true;
  }
  return best;
}

// Light from the top-left, a little in front (ART-BIBLE §3).
const L = (() => {
  const v = [-0.55, -0.7, 0.45];
  const n = Math.sqrt(v.reduce((s, c) => s + c * c, 0));
  return v.map((c) => c / n);
})();

/**
 * Keeps only the largest 8-connected group of px (the underside run with its flank): lone px and detached fragments
 * from crevices between puffs would turn into gold specks at golden hour.
 */
function keepLargestComponent(plot: Plot): void {
  const seen = new Set<number>();
  let best: number[] = [];
  for (const start of [...plot.px.keys()].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    const group: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const k = stack.pop() ?? 0;
      group.push(k);
      const x = k % 4096;
      const y = Math.floor(k / 4096);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = (y + dy) * 4096 + x + dx;
          if ((dx !== 0 || dy !== 0) && plot.has(x + dx, y + dy) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
    }
    if (group.length > best.length) best = group;
  }
  const keep = new Set(best);
  for (const k of [...plot.px.keys()]) if (!keep.has(k)) plot.delete(k % 4096, Math.floor(k / 4096));
}

const cloud: SpriteGenerator = {
  atlas: 'sky',
  id: 'cloud',
  size: { w: W, h: H },
  frames: { idle: 1, rim: 1 },
  variants: Object.keys(CLOUD_VARIANTS),
  anchor: { x: 0.5, y: (BASE + 1) / H },
  generate(_rng, { variant, anim, buffer, rampSize }) {
    const spec = CLOUD_VARIANTS[variant ?? 'c1'];
    if (!spec) throw new Error(`cloud: unknown variant ${String(variant)}`);
    const shape = shapeFor(variant ?? 'c1', spec.w, spec.puffs);
    const inside = (x: number, y: number): boolean => height(shape, x, y) > 0;
    const plot = new Plot();
    let minX = W;
    let maxX = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (inside(x, y)) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    }
    const sunThird = minX + (maxX - minX) / 3;
    // plaster: 1 #7f7b90, 2 #a6a2b0, 3 #cac4c6, 4 #e5ddd3, 5 #f5eee0, 6 #fffaf0
    const hi = Math.min(6, rampSize('plaster') - 1);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inside(x, y)) continue;
        if (anim === 'rim') {
          // Underside: 1 px; 2 px only on the sun-side (left) third. Flank: the lower left silhouette, 1 px, 2 px on
          // that third too (a low sun lights the flank, not the crown). A 2-px band all along read as an outline.
          const sunSide = x < sunThird;
          const under = !inside(x, y + 1) || (sunSide && !inside(x, y + 2));
          const flank = (!inside(x - 1, y) || (sunSide && !inside(x - 2, y))) && y > BASE - 12;
          if (under || flank) plot.set(x, y, 'plaster', hi);
          continue;
        }
        const nx = (height(shape, x - 1, y) - height(shape, x + 1, y)) / 2;
        const ny = (height(shape, x, y - 1) - height(shape, x, y + 1)) / 2;
        const len = Math.sqrt(nx * nx + ny * ny + 1);
        const lit = Math.max(0, (nx * (L[0] ?? 0) + ny * (L[1] ?? 0) + (L[2] ?? 0)) / len);
        // Underside: the last rows above the base fall into the shadow belly.
        const belly = Math.max(0, 1 - ((shape.base[x] ?? BASE) - y) / 7);
        const v = q(Math.min(1, Math.max(0, 0.05 + lit * 1.05 - belly * 0.6)));
        const pos = 2 + v * (hi - 2);
        const i = Math.floor(pos);
        const f = pos - i;
        // Solid steps; a 50 % checker only in the narrow band between two steps (no grainy lit tops).
        const shade = f < 0.3 ? i : f > 0.7 ? i + 1 : bayer(x, y) < 0.5 ? i + 1 : i;
        plot.set(x, y, 'plaster', Math.min(hi, shade));
      }
    }
    if (anim === 'rim') keepLargestComponent(plot);
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default cloud;
