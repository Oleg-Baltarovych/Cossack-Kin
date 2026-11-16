import { describe, expect, it } from 'vitest';
import { cameraBounds, layerOffset } from '../../../src/render/camera.ts';
import { contentWidth } from '../../../src/render/layers/Layer.ts';

const size = { viewW: 392, viewH: 846, worldW: 720 };

describe('contentWidth', () => {
  it('= worldW·p + viewW·(1 − p), rounded up to whole px', () => {
    expect(contentWidth(0, size)).toBe(392);
    expect(contentWidth(1, size)).toBe(720);
    expect(contentWidth(0.5, size)).toBe(556);
    expect(contentWidth(0.1, size)).toBe(425); // 72 + 352.8
    expect(contentWidth(1.2, size)).toBe(786); // 864 − 78.4
  });

  it('covers every visible column at every camera position for every parallax', () => {
    // viewW is the worldRT width = visible columns + 1 spare; App clamps the camera to the visible width.
    // The spare column is only on screen while the camera has a device-px remainder, i.e. below maxX.
    const visibleW = size.viewW - 1;
    const bounds = cameraBounds(size.worldW, visibleW);
    for (const parallax of [0, 0.1, 0.2, 0.5, 1, 1.2]) {
      const width = contentWidth(parallax, size);
      for (let worldPx = bounds.minX; worldPx <= bounds.maxX; worldPx++) {
        const left = -layerOffset(worldPx, parallax);
        const shown = worldPx < bounds.maxX ? size.viewW : visibleW;
        expect(left + shown, `p=${String(parallax)} x=${String(worldPx)}`).toBeLessThanOrEqual(width);
      }
    }
  });
});
