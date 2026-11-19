// Тіні хмар — ground overlay tiles (plan ART-07): lumpy cloud-shaped shadows (each a cluster of overlapping
// ellipses, squashed by the side-view foreshortening), `ink` 1, binary alpha with a Bayer-dithered rim (solid core,
// 50 %, 25 %), so the overlay stays on the pixel grid. Render draws them at one opacity over the whole ground
// (houses and people included) and scrolls them with the wind.
// - `near`: 512×320, six shadows of different sizes; wraps in x only, blobs keep clear of the top and bottom edges,
//   so stacked rows never show a straight cut and the repeat is longer than any phone's ground area;
// - `far` (generator cloud-shadow-far): 512×48 strip under the horizon, smaller and flatter shadows (depth).
import { Plot } from '../../lib/plot.ts';
import { compose } from '../../lib/passes.ts';
import { seededRng } from '../../lib/rng.ts';
import type { GeneratorParams, SpriteGenerator } from '../../lib/types.ts';

export const CLOUD_SHADOW_TILES = { near: { w: 512, h: 320 }, far: { w: 512, h: 48 } } as const;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number): number => ((BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
/** Wrapped distance on a ring of length n. */
const wrap = (d: number, n: number): number => {
  const a = Math.abs(d) % n;
  return Math.min(a, n - a);
};

interface Ellipse {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

/** A cloud-shaped shadow at (cx, cy): 5 ellipses of a puff row, squashed vertically. */
function shadowBlob(rng: () => number, cx: number, cy: number, size: number, squash: number): Ellipse[] {
  const out: Ellipse[] = [];
  const span = 90 * size;
  for (let k = 0; k < 5; k++) {
    const t = k / 4 - 0.5;
    const r = (14 + (1 - Math.abs(t) * 2) * 20 + rng() * 8) * size;
    out.push({
      x: cx + Math.round(t * span + (rng() - 0.5) * 10 * size),
      y: cy + Math.round((rng() - 0.5) * 6 * size * squash),
      rx: Math.round(r),
      ry: Math.max(2, Math.round(r * squash)),
    });
  }
  return out;
}

const SPECS: Readonly<Record<'near' | 'far', readonly (readonly [number, number, number])[]>> = {
  // [cx, cy, size]: big, medium and small shadows, staggered so no two share a column.
  near: [
    [70, 46, 1],
    [300, 30, 0.6],
    [430, 120, 0.9],
    [170, 160, 0.7],
    [330, 236, 1],
    [40, 276, 0.5],
  ],
  far: [
    [80, 24, 0.55],
    [330, 22, 0.4],
  ],
};

/** Draws one shadow tile of `kind` into the frame buffer. */
export function drawCloudShadows(kind: 'near' | 'far', { buffer, rampSize }: GeneratorParams): void {
  const tile = CLOUD_SHADOW_TILES[kind];
  const rng = seededRng(`cloud-shadow.${kind}:blobs`);
  const squash = kind === 'far' ? 0.18 : 0.3;
  const ellipses = SPECS[kind].flatMap(([cx, cy, size]) => shadowBlob(rng, cx, cy, size, squash));
  const plot = new Plot();
  // Rows within MARGIN of the tile's top/bottom stay empty (no cut where rows of tiles meet).
  const MARGIN = 2;
  for (let y = MARGIN; y < tile.h - MARGIN; y++) {
    for (let x = 0; x < tile.w; x++) {
      let d = Infinity;
      for (const e of ellipses) {
        const u = wrap(x - e.x, tile.w) / e.rx;
        const v = (y - e.y) / e.ry;
        d = Math.min(d, Math.sqrt(u * u + v * v));
      }
      // Solid core, then a 50 % and a 25 % dithered rim: soft-looking edge on a binary grid.
      const keep = d < 0.75 || (d < 0.9 && bayer(x, y) < 0.5) || (d < 1.05 && bayer(x, y) < 0.25);
      if (keep) plot.set(x, y, 'ink', 1);
    }
  }
  compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
}

const cloudShadow: SpriteGenerator = {
  atlas: 'sky',
  id: 'cloud-shadow',
  size: CLOUD_SHADOW_TILES.near,
  frames: { idle: 1 },
  anchor: { x: 0, y: 0 },
  generate(_rng, params) {
    drawCloudShadows('near', params);
  },
};

export default cloudShadow;
