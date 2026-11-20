// Camera math (plan §0, M0-04). Pure: no Pixi, no DOM.
// The world moves inside worldRT by whole logical px only; the sub-pixel remainder is applied as a
// whole number of device px to the upscale sprite, so every logical px stays a `scale × scale` block.

import type { Viewport, ZoomLevel } from './viewport.ts';

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

/**
 * What the camera may show at one zoom level (plan M2-03). worldRT is always laid out for the normal level; a level
 * shows a window of it at its own integer scale: `viewW` visible columns (ceil, as the bounds), and camera y in
 * [0, maxY] logical px from the top of the normal frame (0 at the normal level, which shows the whole frame).
 */
export interface LevelView {
  readonly scale: number;
  readonly bounds: CameraBounds;
  readonly viewW: number;
  readonly maxY: number;
}

/** The view of zoom level `zoom` for the normal viewport `normal` (device size + normal scale). */
export function levelView(
  normal: Pick<Viewport, 'deviceW' | 'deviceH' | 'scale'>,
  zoom: ZoomLevel,
  worldW: number,
): LevelView {
  const scale = normal.scale + zoom;
  const viewW = Math.ceil(normal.deviceW / scale);
  const maxY = Math.max(0, Math.ceil(normal.deviceH / normal.scale) - Math.ceil(normal.deviceH / scale));
  return { scale, bounds: cameraBounds(worldW, viewW), viewW, maxY };
}

/**
 * Closer level (M2-03 review, art-director): rows to move the sky band down so the shown disc (sun, else moon; centre
 * row `discRow` of the band, `null` = none) stays in the window that starts at row `camY` — translation only, whole
 * rows, at most `camY` (the normal frame's sky never moves), never pushing the disc closer than `margin` to `horizon`.
 */
export function skyShift(o: {
  readonly camY: number;
  readonly discRow: number | null;
  readonly horizon: number;
  readonly margin: number;
}): number {
  if (o.discRow === null || o.camY <= 0) return 0;
  const needed = Math.round(o.camY) + o.margin - o.discRow;
  const room = o.horizon - o.margin - o.discRow;
  return Math.max(0, Math.min(Math.round(o.camY), needed, room));
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

/**
 * Bottom sheet (M2-13): the camera y (rows of the normal frame above the screen) that keeps a tapped building's ground
 * row `bottom` plus `margin` rows above the sheet's top edge `sheetTop` (device px from the canvas top) at a level of
 * `scale` device px per row. Moves only when needed and only up to the building's `top` row (it never leaves the top of
 * the screen) and within [0, maxY] — at the normal level (maxY 0) nothing moves. Whole rows (the row grid).
 */
export function revealY(o: {
  readonly camY: number;
  readonly maxY: number;
  readonly scale: number;
  readonly sheetTop: number;
  readonly top: number;
  readonly bottom: number;
  readonly margin: number;
}): number {
  const needed = Math.ceil(o.bottom + o.margin - o.sheetTop / o.scale);
  if (needed <= o.camY) return o.camY;
  return Math.max(0, Math.min(o.maxY, needed, Math.floor(o.top)));
}
