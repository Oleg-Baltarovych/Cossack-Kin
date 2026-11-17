import { describe, expect, it } from 'vitest';
import { uiScale } from '../../../src/ui/theme.ts';

describe('uiScale (M1-17)', () => {
  it('one font px is a whole number of device px at every common DPR (the pixel font stays crisp)', () => {
    for (const dpr of [1, 1.5, 2, 2.625, 3, 3.5]) {
      const s = uiScale(390, 844, dpr);
      for (const size of [s.fontS, s.fontM]) {
        const devicePerFontPx = (size * dpr) / 8;
        expect(Math.abs(devicePerFontPx - Math.round(devicePerFontPx))).toBeLessThan(1e-9);
      }
      expect(s.fontM).toBeGreaterThan(s.fontS);
    }
  });

  it('390 css px at DPR 3: one logical px = 1 css px, row text 10.67 px, HUD counters 16 px', () => {
    const s = uiScale(390, 844, 3);
    expect(s.px).toBe(1);
    expect(s.fontS).toBeCloseTo(32 / 3, 9);
    expect(s.fontM).toBe(16);
  });
});
