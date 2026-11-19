// Boats on the river (plan M2-11): the drift and the ripple frames are whole-step functions of atmosphere time.
import { describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/render/atmosphere/config.ts';
import { boatDrift, rippleFrame } from '../../../src/render/boats.ts';

const times = Array.from({ length: 200 }, (_, i) => i * 0.47);

describe('boatDrift', () => {
  it('keeps a moored boat (drift 0) still', () => {
    for (const t of times) expect(boatDrift({ drift: 0 }, t)).toBe(0);
  });

  it('swings a drifting boat by whole px within ±drift, both ways over a period', () => {
    const xs = times.map((t) => boatDrift({ drift: 6 }, t));
    for (const x of xs) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(6);
    }
    expect(Math.max(...xs)).toBe(6);
    expect(Math.min(...xs)).toBe(-6);
    expect(boatDrift({ drift: 6 }, 0)).toBe(boatDrift({ drift: 6 }, BOATS.driftPeriod));
  });
});

describe('rippleFrame', () => {
  it('cycles frames 0–2 at BOATS.rippleFps, and two boats lap out of step', () => {
    const frames = times.map((t) => rippleFrame(t, 0));
    expect(new Set(frames)).toEqual(new Set([0, 1, 2]));
    expect(rippleFrame(0, 0)).not.toBe(rippleFrame(1 / BOATS.rippleFps, 0));
    for (const t of times) expect(rippleFrame(t, 1)).not.toBe(rippleFrame(t, 0));
  });
});
