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

  it('tap targets: at least 44 css px and a whole number of logical px', () => {
    for (const [w, h, dpr] of [
      [390, 844, 3],
      [360, 800, 3],
      [412, 915, 3.5],
      [390, 844, 2],
    ] as const) {
      const s = uiScale(w, h, dpr);
      expect(s.tap).toBeGreaterThanOrEqual(44);
      expect(Math.abs(s.tap / s.px - Math.round(s.tap / s.px))).toBeLessThan(1e-9);
      expect(s.tap - s.px).toBeLessThan(44);
    }
    expect(uiScale(412, 915, 3.5).tap).toBeCloseTo((39 * 4) / 3.5, 9);
  });
});
