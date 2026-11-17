import { describe, expect, it } from 'vitest';
import { foregroundAlpha, SWAY_UPRIGHT, swayFrame } from '../../../src/render/sway.ts';
import { FOREGROUND, SWAY } from '../../../src/render/atmosphere/config.ts';

const sample = (amp: number, strength: number, still = false): number[] =>
  Array.from({ length: 1200 }, (_, i) => swayFrame(i / 20, { amp, phase: 0.3 }, strength, still));

describe('swayFrame (ART-14 wind sway)', () => {
  it('picks one of the generated sway frames, upright in the middle', () => {
    expect(SWAY_UPRIGHT).toBe((SWAY.frames - 1) / 2);
    for (const f of sample(1, 1)) {
      expect(Number.isInteger(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(SWAY.frames);
    }
  });

  it('leans both ways in the default breeze', () => {
    const frames = new Set(sample(1, 0.55));
    expect(frames.has(SWAY_UPRIGHT - 1)).toBe(true);
    expect(frames.has(SWAY_UPRIGHT + 1)).toBe(true);
  });

  it('a stronger wind leans further; a stiff plant (smaller amp) leans less', () => {
    const reach = (frames: number[]): number => Math.max(...frames.map((f) => Math.abs(f - SWAY_UPRIGHT)));
    expect(reach(sample(1, 1))).toBeGreaterThan(reach(sample(1, 0.2)));
    expect(reach(sample(0.4, 1))).toBeLessThan(reach(sample(1, 1)));
  });

  it('never jumps more than one frame between 60 fps ticks (whole-px steps, no snapping)', () => {
    let prev = swayFrame(0, { amp: 1, phase: 0 }, 1, false);
    for (let i = 1; i < 3600; i++) {
      const f = swayFrame(i / 60, { amp: 1, phase: 0 }, 1, false);
      expect(Math.abs(f - prev)).toBeLessThanOrEqual(1);
      prev = f;
    }
  });

  it('stands still in calm air and under «менше руху»', () => {
    expect(new Set(sample(1, 0))).toEqual(new Set([SWAY_UPRIGHT]));
    expect(new Set(sample(1, 1, true))).toEqual(new Set([SWAY_UPRIGHT]));
  });

  it('is a pure function of time (frozen screenshots repeat)', () => {
    expect(sample(1, 0.55)).toEqual(sample(1, 0.55));
  });
});

describe('foregroundAlpha (ART-14: foreground thins out over people)', () => {
  const plant = { x: 100, y: 200, w: 40, h: 60 };
  it('is opaque when no one is behind the plant', () => {
    expect(foregroundAlpha(plant, [{ x: 0, y: 0, w: 16, h: 40 }])).toBe(1);
    expect(foregroundAlpha(plant, [{ x: 140, y: 200, w: 16, h: 40 }])).toBe(1); // touching edges only
  });
  it('fades when a person overlaps it', () => {
    expect(foregroundAlpha(plant, [{ x: 130, y: 230, w: 16, h: 40 }])).toBe(FOREGROUND.fadeAlpha);
  });
});
