// Rain (plan ART-17): streak tiles and splashes. Pure (no Pixi): the light layer owns the textures and sprites.
// Streaks are 1-px opaque pixels in a seamless tile, scrolled in whole px (no soft alpha, no sub-px shimmer);
// splashes are deterministic functions of animation seconds, so `?freeze=<s>` frames repeat.
import { RAIN } from './config.ts';

/** Integer hash → 0..1. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A `tile`×`tile` RGBA tile of `count` streaks `len` px long, each falling 1 px down per row and `slant` px across
 * (the wind), wrapped at the edges so the tile repeats seamlessly. White and opaque: the sprite tint and alpha
 * give the colour of the key.
 */
export function paintStreakTile(
  tile: number,
  count: number,
  len: number,
  slant: number,
  seed: number,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(tile * tile * 4);
  for (let i = 0; i < count; i++) {
    const x0 = Math.floor(hash(i, seed) * tile);
    const y0 = Math.floor(hash(i, seed + 1) * tile);
    for (let k = 0; k < len; k++) {
      const x = (((x0 + Math.round(k * slant)) % tile) + tile) % tile;
      const y = (y0 + k) % tile;
      out.set([255, 255, 255, 255], (y * tile + x) * 4);
    }
  }
  return out;
}

/** Scroll offset (0 ≤ y < tile) of a streak tile falling at `speed` px/s, drifting `slant` px across per px down. */
export function streakOffset(seconds: number, speed: number, tile: number, slant: number): { x: number; y: number } {
  const fall = Math.round(seconds * speed);
  const mod = (v: number): number => ((v % tile) + tile) % tile;
  return { x: mod(Math.round(fall * slant)), y: mod(fall) };
}

export interface Splash {
  readonly x: number;
  readonly y: number;
  /** `splash` on the land, `ripple` in the river band. */
  readonly kind: 'splash' | 'ripple';
  /** 0 = the drop hits (1 px), 1 = it spreads. */
  readonly stage: 0 | 1;
}

/**
 * Splashes alive now inside `area` (x0 ≤ x < x1, y0 ≤ y < y1; the first `water` rows are the river): each slot
 * lands somewhere new every RAIN.splashLife s, shows the hit, then the spread.
 */
export function splashes(
  seconds: number,
  area: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number; readonly water: number },
): Splash[] {
  const out: Splash[] = [];
  const w = area.x1 - area.x0;
  const h = area.y1 - area.y0;
  for (let i = 0; i < RAIN.splashes; i++) {
    const cycle = seconds / RAIN.splashLife + hash(i, 11);
    const gen = Math.floor(cycle);
    const t = cycle - gen;
    if (t > 0.7) continue;
    const x = area.x0 + Math.min(w - 1, Math.floor(hash(i * 131 + gen, 12) * w));
    // Denser toward the viewer: the ground rows near the bottom cover more of the screen.
    const y = area.y0 + Math.min(h - 1, Math.floor(Math.sqrt(hash(i * 71 + gen, 13)) * h));
    out.push({ x, y, kind: y < area.y0 + area.water ? 'ripple' : 'splash', stage: t < 0.3 ? 0 : 1 });
  }
  return out;
}
