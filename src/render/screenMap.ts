// World ↔ client px in the frame on screen (M2-29 D): pure, so the tap's client → ground mapping and its inverse (the
// coins of an ordinary upgrade fly from the HUD counter to the building, ui/components/CoinFlight.tsx) are one model.
// Ground space = world x and rows of the low-res world target (the horizon included); the camera of a frame = its whole
// world px, the sub-px shift of the upscale sprite in device px, the scale of the zoom level shown, and the rows of the
// normal frame above the screen (the closer level).

export interface FrameCamera {
  readonly worldPx: number;
  readonly fracDevicePx: number;
  readonly scale: number;
  readonly y: number;
}

export interface ClientRect {
  readonly left: number;
  readonly top: number;
}

/** The ground-space px under a client point (CSS px) in the frame drawn with `cam` (what a tap hits). */
export function clientToGround(
  client: { readonly x: number; readonly y: number },
  cam: FrameCamera,
  rect: ClientRect,
  dpr: number,
): { x: number; y: number } {
  const sx = ((client.x - rect.left) * dpr) / cam.scale;
  const sy = ((client.y - rect.top) * dpr) / cam.scale;
  return { x: Math.floor(sx + cam.fracDevicePx / cam.scale + cam.worldPx), y: Math.floor(sy + cam.y) };
}

/** The client point (CSS px) where ground-space point `g` is drawn in the frame drawn with `cam`. */
export function groundToClient(
  g: { readonly x: number; readonly y: number },
  cam: FrameCamera,
  rect: ClientRect,
  dpr: number,
): { x: number; y: number } {
  return {
    x: rect.left + ((g.x - cam.worldPx) * cam.scale - cam.fracDevicePx) / dpr,
    y: rect.top + ((g.y - cam.y) * cam.scale) / dpr,
  };
}
