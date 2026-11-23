// DOM pixel art on whole device px (plan M2-29 B1): the offset that moves a box onto the device-px grid.
import { describe, expect, it } from 'vitest';
import { deviceSnap } from '../../../src/ui/pixelSnap.ts';

describe('deviceSnap', () => {
  it('moves a box to the nearest whole device px at dpr 3.5', () => {
    for (const pos of [0, 10.1, 57.3, 123.456, 400.9]) {
      const moved = (pos + deviceSnap(pos, 3.5)) * 3.5;
      expect(Math.abs(moved - Math.round(moved))).toBeLessThan(1e-9);
      expect(Math.abs(deviceSnap(pos, 3.5) * 3.5)).toBeLessThanOrEqual(0.5);
    }
  });

  it('leaves a box already on the grid where it is', () => {
    expect(deviceSnap(2, 3.5)).toBe(0);
    expect(deviceSnap(41, 3)).toBe(0);
    expect(deviceSnap(1 / 3, 3)).toBeCloseTo(0, 12);
  });
});
