// Pixel-grid check (plan M0-04/M0-07): every logical px of the world must reach the screen as a solid
// `scale × scale` block of device px. Equivalent formulation used here: a color change between two
// neighbouring device columns may only happen on a block boundary, i.e. at x ≡ phaseX (mod scale), and
// between rows only at y ≡ phaseY (mod scale). Blur, fractional scaling or a wrong camera offset all
// create edges inside blocks and fail. The upscale sprite is shifted left by `fracDevicePx`, so
// column boundaries sit at x ≡ −fracDevicePx (mod scale).
import type { RgbaImage } from './png.ts';

export interface GridRegion {
  /** Device-px rectangle to check (default: whole image). */
  readonly x0?: number;
  readonly y0?: number;
  readonly x1?: number;
  readonly y1?: number;
}

export interface GridOptions extends GridRegion {
  readonly scale: number;
  /** Device-px shift of the upscale sprite to the left (camera sub-pixel remainder), 0 ≤ frac < scale. */
  readonly fracDevicePx: number;
}

export interface GridReport {
  /** Edges found on block boundaries (proves the check saw real structure). */
  readonly columnEdges: number;
  readonly rowEdges: number;
  /** First few violations as `x,y` strings; empty = pass. */
  readonly violations: readonly string[];
  readonly violationCount: number;
}

const MAX_LISTED = 10;

export function checkPixelGrid(image: RgbaImage, options: GridOptions): GridReport {
  const { scale, fracDevicePx } = options;
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`bad scale ${String(scale)}`);
  const x0 = options.x0 ?? 0;
  const y0 = options.y0 ?? 0;
  const x1 = Math.min(options.x1 ?? image.width, image.width);
  const y1 = Math.min(options.y1 ?? image.height, image.height);
  const phaseX = mod(-fracDevicePx, scale);
  const { data, width } = image;
  const pixel = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);

  let columnEdges = 0;
  let rowEdges = 0;
  let violationCount = 0;
  const violations: string[] = [];
  const violate = (x: number, y: number, axis: string): void => {
    violationCount += 1;
    if (violations.length < MAX_LISTED) violations.push(`${axis}@${String(x)},${String(y)}`);
  };

  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = x0; x < x1; x++) {
      const here = pixel[row + x];
      if (x > x0 && here !== pixel[row + x - 1]) {
        if (mod(x, scale) === phaseX) columnEdges += 1;
        else violate(x, y, 'col');
      }
      if (y > y0 && here !== pixel[row - width + x]) {
        if (mod(y, scale) === 0) rowEdges += 1;
        else violate(x, y, 'row');
      }
    }
  }
  return { columnEdges, rowEdges, violations, violationCount };
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
