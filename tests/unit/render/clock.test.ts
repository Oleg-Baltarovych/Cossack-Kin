import { describe, expect, it } from 'vitest';
import { createClock, createCosmeticRng, realLocalMinutes } from '../../../src/render/clock.ts';

const fakeNow = () => {
  let ms = 1000;
  return {
    nowMs: () => ms,
    advance: (dt: number) => {
      ms += dt;
    },
  };
};

describe('createClock', () => {
  it('real clock: seconds since creation follow nowMs', () => {
    const t = fakeNow();
    const clock = createClock({ frozenAt: null, fixedMinutes: null, nowMs: t.nowMs, localMinutes: () => 600 });
    expect(clock.frozen).toBe(false);
    expect(clock.seconds()).toBe(0);
    t.advance(2500);
    expect(clock.seconds()).toBeCloseTo(2.5, 9);
  });

  it('frozen clock: always returns the pinned animation time', () => {
    const t = fakeNow();
    const clock = createClock({ frozenAt: 12.5, fixedMinutes: null, nowMs: t.nowMs, localMinutes: () => 600 });
    expect(clock.frozen).toBe(true);
    expect(clock.seconds()).toBe(12.5);
    t.advance(10_000);
    expect(clock.seconds()).toBe(12.5);
  });

  it('time of day: pinned minutes win over local time; local time is read live', () => {
    let local = 600;
    const live = createClock({ frozenAt: null, fixedMinutes: null, nowMs: () => 0, localMinutes: () => local });
    expect(live.minutesOfDay()).toBe(600);
    local = 601.5;
    expect(live.minutesOfDay()).toBe(601.5);

    const pinned = createClock({ frozenAt: null, fixedMinutes: 1170, nowMs: () => 0, localMinutes: () => local });
    expect(pinned.minutesOfDay()).toBe(1170);
  });

  it('realLocalMinutes reads hours, minutes and seconds of a date', () => {
    expect(realLocalMinutes(new Date(2026, 10, 16, 19, 30, 30))).toBeCloseTo(1170.5, 9);
  });
});

describe('createCosmeticRng', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = createCosmeticRng(1);
    const b = createCosmeticRng(1);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds give different sequences', () => {
    const a = createCosmeticRng(1);
    const b = createCosmeticRng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });
});
