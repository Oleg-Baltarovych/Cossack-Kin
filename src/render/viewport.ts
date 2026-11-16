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

export function computeViewport(cssW: number, cssH: number, dpr: number): Viewport {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const deviceW = toDevicePx(cssW, ratio);
  const deviceH = toDevicePx(cssH, ratio);

  let scale = Math.max(1, Math.floor(deviceW / MIN_LOGICAL_WIDTH));
  if (deviceW / scale > MAX_LOGICAL_WIDTH) scale += 1;

  return {
    scale,
    logicalW: Math.max(1, Math.floor(deviceW / scale)),
    logicalH: Math.max(1, Math.floor(deviceH / scale)),
    deviceW,
    deviceH,
  };
}

function toDevicePx(cssPx: number, ratio: number): number {
  const device = Math.round(cssPx * ratio);
  return Number.isFinite(device) ? Math.max(1, device) : 1;
}
