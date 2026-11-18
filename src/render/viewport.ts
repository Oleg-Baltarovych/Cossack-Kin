// Integer-scale viewport (SPEC §5.1, plan M0-03 / Q2). Pure helper: no DOM access.

/** Target minimum logical width; `scale` is chosen from it. */
export const MIN_LOGICAL_WIDTH = 320;
/** Hard maximum logical width; wins over the minimum when both cannot hold (e.g. 401–639 device px). */
export const MAX_LOGICAL_WIDTH = 400;

export interface Viewport {
  /** Integer upscale factor: one logical px = `scale × scale` device px. */
  readonly scale: number;
  readonly logicalW: number;
  readonly logicalH: number;
  readonly deviceW: number;
  readonly deviceH: number;
}

/**
 * Zoom level (plan M2-03, Q4): 0 = normal, 1 = closer — the next integer scale (s + 1). Never a fractional scale and
 * never farther than normal: art and sky are tuned for 320–400 logical px.
 */
export type ZoomLevel = 0 | 1;

export function computeViewport(cssW: number, cssH: number, dpr: number, zoom: ZoomLevel = 0): Viewport {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const deviceW = toDevicePx(cssW, ratio);
  const deviceH = toDevicePx(cssH, ratio);

  let scale = Math.max(1, Math.floor(deviceW / MIN_LOGICAL_WIDTH));
  if (deviceW / scale > MAX_LOGICAL_WIDTH) scale += 1;
  scale += zoom;

  return {
    scale,
    logicalW: Math.max(1, Math.floor(deviceW / scale)),
    logicalH: Math.max(1, Math.floor(deviceH / scale)),
    deviceW,
    deviceH,
  };
}

/**
 * Whole device px covered by `cssPx` (floored; 1e-6 absorbs float noise such as 390 × 3.0000001). Rounding up a
 * half px (915 × 3.5 = 3202.5) would make the canvas overhang the viewport, and the compositor would rescale it and
 * drop one device row somewhere in the frame (breaks the pixel grid).
 */
function toDevicePx(cssPx: number, ratio: number): number {
  const device = Math.floor(cssPx * ratio + 1e-6);
  return Number.isFinite(device) ? Math.max(1, device) : 1;
}

export interface TargetSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Size of worldRT in logical px: every (partial) logical column/row of the canvas plus one spare, so the
 * upscale sprite shifted left by up to `scale − 1` device px still reaches the right edge
 * (`width·scale − frac ≥ deviceW`). `logicalW + 1` is not enough when `deviceW mod scale ≥ 2`.
 */
export function worldTargetSize(viewport: Pick<Viewport, 'deviceW' | 'deviceH' | 'scale'>): TargetSize {
  return {
    width: Math.ceil(viewport.deviceW / viewport.scale) + 1,
    height: Math.ceil(viewport.deviceH / viewport.scale) + 1,
  };
}
