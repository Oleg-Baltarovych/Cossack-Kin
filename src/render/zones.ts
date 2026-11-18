// Continuous-world geometry (plan M2-01): which stretch of the world has the river, ground haze and which zone.
// Pure: no Pixi, no DOM. World x everywhere; screen x = world x − camX.
import type { GroundSegment, River } from '../content/villages/khortytsia.layout.ts';

/** World x where river row `r` (0 = right under the horizon) ends: the far row at x1, the nearest `taper` px before. */
export function riverRowEnd(river: River, r: number): number {
  const near = river.rows > 1 ? r / (river.rows - 1) : 1;
  return river.x1 - Math.round(river.taper * near);
}

/** Water rows over world column `x` (0 = dry land). */
export function riverRowsAt(river: River | null, x: number): number {
  if (!river || x < river.x0) return 0;
  let rows = 0;
  while (rows < river.rows && x < riverRowEnd(river, rows)) rows++;
  return rows;
}

/** Screen columns [a, b) of river row `r` in a `viewW`-wide view at `camX`; `null` when none is on screen. */
export function riverSpan(river: River, r: number, camX: number, viewW: number): { a: number; b: number } | null {
  const a = Math.max(0, river.x0 - camX);
  const b = Math.min(viewW, riverRowEnd(river, r) - camX);
  return b > a ? { a, b } : null;
}

/**
 * Ground haze strength 0..1 per world column over `width`: 1 over zones with `groundHaze`, 0 elsewhere, falling to 0
 * over the last `ramp` px of a hazed zone before a clear one (no vertical seam in the band).
 */
export function hazeCover(segments: readonly GroundSegment[], width: number, ramp: number): number[] {
  const on = (x: number): boolean => segments.find((s) => x >= s.x0 && x < s.x1)?.groundHaze ?? false;
  const cover = Array.from({ length: width }, (_, x): number => (on(x) ? 1 : 0));
  // Distance to the nearest clear column on either side, within `ramp`.
  for (let x = 0; x < width; x++) {
    if (cover[x] === 0) continue;
    let d = ramp;
    for (let k = 1; k < ramp; k++) {
      if ((x - k >= 0 && !on(x - k)) || (x + k < width && !on(x + k))) {
        d = k;
        break;
      }
    }
    cover[x] = Math.min(1, d / ramp);
  }
  return cover;
}
