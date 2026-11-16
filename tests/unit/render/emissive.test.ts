import { describe, expect, it } from 'vitest';
import { dayCycle } from '../../../src/render/atmosphere/dayCycle.ts';
import { emissiveLevel } from '../../../src/render/atmosphere/emissive.ts';

const hm = (h: number, m = 0): number => h * 60 + m;

describe('emissiveLevel (night window masks)', () => {
  it('is off by day, on at dusk and night, partial at golden hour', () => {
    expect(emissiveLevel(dayCycle(hm(7)))).toBe(0);
    expect(emissiveLevel(dayCycle(hm(13)))).toBe(0);
    const golden = emissiveLevel(dayCycle(hm(19, 30)));
    expect(golden).toBeGreaterThan(0.1);
    expect(golden).toBeLessThan(0.7);
    expect(emissiveLevel(dayCycle(hm(21)))).toBe(1);
    expect(emissiveLevel(dayCycle(hm(23)))).toBe(1);
    expect(emissiveLevel(dayCycle(hm(2)))).toBe(1);
  });

  it('blends between keys', () => {
    const mid = emissiveLevel(dayCycle(hm(20, 15))); // golden → dusk
    expect(mid).toBeGreaterThan(emissiveLevel(dayCycle(hm(19, 30))));
    expect(mid).toBeLessThan(1);
  });
});
