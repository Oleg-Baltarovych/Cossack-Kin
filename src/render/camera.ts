// Camera math (plan §0, M0-04). Pure: no Pixi, no DOM.
// The world moves inside worldRT by whole logical px only; the sub-pixel remainder is applied as a
// whole number of device px to the upscale sprite, so every logical px stays a `scale × scale` block.

export interface CameraSplit {
  /** Whole logical px the world is shifted by inside worldRT. */
  readonly worldPx: number;
  /** Remaining shift in device px, applied to the upscale sprite; 0 ≤ fracDevicePx < scale. */
  readonly fracDevicePx: number;
}

export interface CameraBounds {
  readonly minX: number;
  readonly maxX: number;
}

/** Camera x range that keeps a `viewW`-wide view inside a `worldW`-wide world (logical px). */
export function cameraBounds(worldW: number, viewW: number): CameraBounds {
  return { minX: 0, maxX: Math.max(0, worldW - viewW) };
}

export function clampCamX(camX: number, bounds: CameraBounds): number {
  if (!Number.isFinite(camX)) return bounds.minX;
  return Math.min(bounds.maxX, Math.max(bounds.minX, camX));
}

/** Splits a (possibly fractional) camera x in logical px into a world shift and a device-px remainder. */
export function split(camX: number, scale: number, bounds?: CameraBounds): CameraSplit {
  const x = bounds ? clampCamX(camX, bounds) : Number.isFinite(camX) ? camX : 0;
  const totalDevicePx = withoutNegativeZero(Math.round(x * scale));
  const worldPx = withoutNegativeZero(Math.floor(totalDevicePx / scale));
  return { worldPx, fracDevicePx: totalDevicePx - worldPx * scale };
}

/** Container x of a parallax layer for a world shift of `worldPx` (whole logical px). */
export function layerOffset(worldPx: number, parallax: number): number {
  return withoutNegativeZero(-Math.round(worldPx * parallax));
}

/** Math.round(-0.4) and -0 offsets yield -0; normalise so positions compare and print as 0. */
function withoutNegativeZero(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}
