// World ↔ screen (M2-29 D): the coins of an ordinary upgrade fly from the HUD counter to the building, so the UI needs
// the client point of a ground-space px in the frame on screen — the inverse of the tap's client → ground mapping.
import { describe, expect, it } from 'vitest';
import { clientToGround, groundToClient, type FrameCamera } from '../../../src/render/screenMap.ts';

const CAMS: readonly FrameCamera[] = [
  { worldPx: 0, fracDevicePx: 0, scale: 3, y: 0 },
  { worldPx: 412, fracDevicePx: 2, scale: 3, y: 0 },
  { worldPx: 1180, fracDevicePx: 1, scale: 4, y: 37 },
  { worldPx: 77, fracDevicePx: 0, scale: 2, y: 5 },
];
const RECT = { left: 0, top: 0 };

describe('groundToClient / clientToGround', () => {
  it('a px centre maps to a client point that taps back on the same px (any camera, dpr, canvas offset)', () => {
    for (const cam of CAMS)
      for (const dpr of [1, 2.625, 3])
        for (const rect of [RECT, { left: 12, top: 40 }])
          for (const g of [
            { x: cam.worldPx + 5, y: 120 },
            { x: cam.worldPx + 200, y: 300 },
          ]) {
            const c = groundToClient({ x: g.x + 0.5, y: g.y + 0.5 }, cam, rect, dpr);
            expect(clientToGround(c, cam, rect, dpr), JSON.stringify({ cam, dpr, rect, g })).toEqual(g);
          }
  });

  it('moves with the camera: one logical px right of the view = one scale of device px', () => {
    const cam = CAMS[0] ?? { worldPx: 0, fracDevicePx: 0, scale: 3, y: 0 };
    const a = groundToClient({ x: 10, y: 100 }, cam, RECT, 1);
    const b = groundToClient({ x: 10, y: 100 }, { ...cam, worldPx: 1 }, RECT, 1);
    expect(a).toEqual({ x: 30, y: 300 });
    expect(b.x).toBe(27);
    // The sub-px shift of a smooth camera and a raised closer view.
    expect(groundToClient({ x: 10, y: 100 }, { ...cam, fracDevicePx: 2, y: 4 }, RECT, 3)).toEqual({
      x: 28 / 3,
      y: 96,
    });
  });
});
