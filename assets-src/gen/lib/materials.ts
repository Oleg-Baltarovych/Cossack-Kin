// Shade-field materials (plan ART-03, ART-BIBLE §5): earth (diagonal smears, clods), planks (+ batten, nails) and log
// stakes. The pixel-recipe materials (thatch, whitewash, pryzba, window, grass, wattle, pot, path) are in recipes.ts. Materials paint *structure* — relief as
// normals and depth — and let the passes light it (sun top-left), occlude it (AO under eaves and courses, cast
// shadows) and dither it; base shades are the albedo only. Noise is position-hashed (noise.ts), so a material
// looks the same whatever order parts are drawn in. Shade numbers are ramp indices (master.json).
import type { Normal } from './buffer.ts';
import { rand2, seedOf, valueNoise } from './noise.ts';
import type { Material } from './passes.ts';
import { seededRng } from './rng.ts';
import { unitNormal, type Shape } from './shapes.ts';

/** Material ids stored in the buffer (`material` field): outlines draw internal lines where these change. */
export const MATERIAL = {
  plaster: 1,
  pryzba: 2,
  thatch: 3,
  ridge: 4,
  earth: 5,
  path: 6,
  grass: 7,
  plank: 8,
  batten: 9,
  nail: 10,
  rod: 11,
  stake: 12,
  pot: 13,
  flower: 14,
  pebble: 15,
} as const;

/** Normal of a height field `h` at (x, y) by central differences; `k` = relief strength. */
export function heightNormal(h: (x: number, y: number) => number, x: number, y: number, k: number): Normal {
  const dx = (h(x + 1, y) - h(x - 1, y)) / 2;
  const dy = (h(x, y + 1) - h(x, y - 1)) / 2;
  return unitNormal(-dx * k, -dy * k, 1);
}

/** Per-shape cache (cracks, strand layouts…) so the work is done once per shape, not once per px. */
function perShape<T>(make: (shape: Shape) => T): (shape: Shape) => T {
  const cache = new WeakMap<Shape, T>();
  return (shape) => {
    let v = cache.get(shape);
    if (v === undefined) {
      v = make(shape);
      cache.set(shape, v);
    }
    return v;
  };
}

const FLAT_UP: Normal = [0, 0, 127];

// ── ground ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Bare earth: horizontal strata, rounded raised clods (lit top-left, shadow bottom-right), grit. */
export function earth(options: { readonly seed: string; readonly tone?: number }): Material {
  const s = seedOf(options.seed);
  const tone = options.tone ?? 2.5;
  const clod = (x: number, y: number): number => Math.max(0, valueNoise(x, y, 4, 3, s + 1) - 0.62) * 4;
  const relief = (x: number, y: number): number => clod(x, y) + valueNoise(x, y, 12, 4, s) * 0.5;
  return {
    id: MATERIAL.earth,
    base(f) {
      const strata = valueNoise(f.x, f.y, 14, 2.5, s) * 0.7 + valueNoise(f.x, f.y, 5, 1.5, s + 2) * 0.3;
      const c = clod(f.x, f.y);
      const shade = tone + (strata - 0.5) * 1.3 + (c > 0 ? 0.35 : 0);
      return { ramp: 'earth', shade, depth: c * 0.8, normal: heightNormal(relief, f.x, f.y, 1.3) };
    },
    texture(f) {
      const r = rand2(f.x, f.y, s + 7);
      return r < 0.04 ? -0.9 : r > 0.975 ? 0.8 : 0;
    },
  };
}

// ── wood ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface Board {
  readonly start: number;
  readonly width: number;
  readonly tone: number;
  readonly knot: number;
}

export interface PlankOptions {
  readonly seed: string;
  /** Board width range in px including the 1-px gap (default [5, 7]). */
  readonly width?: readonly [number, number];
}

/** Board layout along a width (shared by planks and the nails on their battens). */
export function boardLayout(seed: string, w: number, range: readonly [number, number] = [5, 7]): readonly Board[] {
  const rng = seededRng(`${seed}:boards`);
  const out: Board[] = [];
  for (let u = 0; u < w;) {
    const width = range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
    out.push({ start: u, width, tone: (rng() - 0.5) * 1.1, knot: rng() < 0.45 ? Math.floor(rng() * 1000) : -1 });
    u += width;
  }
  return out;
}

/**
 * Vertical planks with 1-px dark gaps, a bevelled lit left edge and shaded right edge per board, long grain
 * streaks, the odd knot (grain bends round it), sun-bleached tops and dirt-darkened feet.
 */
export function planks(options: PlankOptions): Material {
  const s = seedOf(options.seed);
  const layout = perShape((shape) => {
    const byU: Board[] = [];
    for (const b of boardLayout(options.seed, shape.w, options.width)) for (let k = 0; k < b.width; k++) byU.push(b);
    return byU;
  });
  return {
    id: MATERIAL.plank,
    base(f, shape) {
      const u = f.x - shape.x;
      const v = f.y - shape.y;
      const b = layout(shape)[u] ?? { start: 0, width: 6, tone: 0, knot: -1 };
      const k = u - b.start;
      if (k === b.width - 1) return { ramp: 'wood', shade: 0.4, depth: -1.5, normal: FLAT_UP };
      const grain = valueNoise(f.x * 3, f.y, 2, 9, s + b.start);
      let shade = 2.9 + b.tone + (grain - 0.5) * 1.0;
      if (grain > 0.47 && grain < 0.53) shade -= 0.9; // dark grain line
      if (b.knot >= 0) {
        const ky = (b.knot % Math.max(1, shape.h - 8)) + 4;
        const kx = b.start + 1 + (b.knot % Math.max(1, b.width - 3));
        const ax = (u - kx) / 1.3;
        const ay = (v - ky) / 1.9;
        const d = ax * ax + ay * ay;
        if (d < 0.45) shade = 2.4;
        else if (d < 1.3) shade = 1.2;
        else if (d < 2.4 && Math.abs(u - kx) <= 1) shade -= 0.5; // grain bending around the knot
      }
      if (v < 3) shade += 0.22 * (3 - v);
      if (v >= shape.h - 3) shade -= 0.35 * (v - (shape.h - 4));
      const normal = k === 0 ? unitNormal(-0.6, 0, 1) : k === b.width - 2 ? unitNormal(0.6, 0, 1) : FLAT_UP;
      return { ramp: 'wood', shade, normal, depth: 0 };
    },
  };
}

/** Horizontal batten across planks: bevelled top (lit) and bottom (shaded) rows, grain along its length. */
export function batten(options: { readonly seed: string }): Material {
  const s = seedOf(options.seed);
  return {
    id: MATERIAL.batten,
    base(f, shape) {
      const v = f.y - shape.y;
      const grain = valueNoise(f.x, f.y * 3, 9, 2, s);
      const shade = 3.1 + (grain - 0.5) * 0.9;
      const normal = v === 0 ? unitNormal(0, -0.8, 1) : v === shape.h - 1 ? unitNormal(0, 0.8, 1) : FLAT_UP;
      return { ramp: 'wood', shade, normal, depth: 2 };
    },
  };
}

/** Forged nail head: 1 px, lit; `u` = 1 marks its rust streak below (wood 1). */
export function nail(): Material {
  return {
    id: MATERIAL.nail,
    base: (f) => (f.u === 0 ? { ramp: 'stone', shade: 3.6, depth: 3 } : { ramp: 'wood', shade: 1.2, depth: 2 }),
  };
}

// ── logs ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Log / post on a `log` shape: dark weathered bark with specks, a pale cut top at `u` = 0 (tower courses, posts). */
export function stake(options: { readonly seed: string }): Material {
  const s = seedOf(options.seed);
  return {
    id: MATERIAL.stake,
    base(f) {
      if (f.u === 0) return { ramp: 'wood', shade: 3.6, normal: unitNormal(0, -1, 0.6), depth: 1.2 };
      const bark = rand2(f.x, Math.floor(f.y / 2), s) < 0.2 ? -0.7 : 0;
      return { ramp: 'wood', shade: 1.5 + bark, depth: 1.2 };
    },
  };
}
