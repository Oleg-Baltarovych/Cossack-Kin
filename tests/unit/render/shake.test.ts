// The camera shake (plan M2-26, SPEC §6.7): `px` logical px at most, whole px, up and down, gone after `ms`.
import { describe, expect, it } from 'vitest';
import { SHAKE } from '../../../src/content/juice.ts';
import { shakeOffset } from '../../../src/render/fx/shake.ts';

describe('shakeOffset (M2-26)', () => {
  const samples = Array.from({ length: SHAKE.ms }, (_, ms) => shakeOffset(ms));

  it('whole logical px, never more than SHAKE.px, and it does reach SHAKE.px', () => {
    for (const dy of samples) {
      expect(Number.isInteger(dy)).toBe(true);
      expect(Math.abs(dy)).toBeLessThanOrEqual(SHAKE.px);
    }
    expect(Math.max(...samples.map(Math.abs))).toBe(SHAKE.px);
  });

  it('moves both ways, every stepMs, and fades: the last step is no larger than the first', () => {
    expect(samples.some((dy) => dy < 0)).toBe(true);
    expect(samples.some((dy) => dy > 0)).toBe(true);
    expect(Math.sign(shakeOffset(0))).toBe(-Math.sign(shakeOffset(SHAKE.stepMs)));
    expect(Math.abs(shakeOffset(SHAKE.ms - 1))).toBeLessThanOrEqual(Math.abs(shakeOffset(0)));
    expect(samples.every((dy) => dy !== 0)).toBe(true);
    expect(Math.abs(shakeOffset(SHAKE.ms - 1))).toBe(SHAKE.minPx);
  });

  it('still before it starts and from SHAKE.ms on', () => {
    expect(shakeOffset(-1)).toBe(0);
    expect(shakeOffset(SHAKE.ms)).toBe(0);
    expect(shakeOffset(SHAKE.ms * 10)).toBe(0);
    expect(shakeOffset(Number.NaN)).toBe(0);
  });
});
