import { describe, expect, it } from 'vitest';
import { AUTO_QUALITY, QUALITY_TIERS } from '../../../src/render/atmosphere/config.ts';
import { claimParticles, ParticleRegistry } from '../../../src/render/fx/registry.ts';
import { createFpsProbe, pickTier } from '../../../src/render/quality.ts';

describe('quality tiers (ART-18)', () => {
  it('cost grows low → med → high for every effect count, within the particle budget', () => {
    const { low, med, high } = QUALITY_TIERS;
    for (const k of ['dust', 'sparks', 'fireflies', 'splashes'] as const) {
      expect(low[k]).toBeLessThanOrEqual(med[k]);
      expect(med[k]).toBeLessThanOrEqual(high[k]);
    }
    expect(high.dust + high.sparks + high.fireflies + high.splashes).toBeLessThanOrEqual(300);
    expect(high.fireflies).toBeLessThanOrEqual(40);
    expect(high.splashes).toBeLessThanOrEqual(80);
  });

  it('pickTier: fast → high, smooth → med, slow → low', () => {
    expect(pickTier(60)).toBe('high');
    expect(pickTier(AUTO_QUALITY.high)).toBe('high');
    expect(pickTier(AUTO_QUALITY.high - 1)).toBe('med');
    expect(pickTier(AUTO_QUALITY.low)).toBe('med');
    expect(pickTier(AUTO_QUALITY.low - 1)).toBe('low');
  });
});

describe('fps probe (ART-18 auto-detect)', () => {
  const run = (frameMs: number, until: number): ReturnType<typeof createFpsProbe> => {
    const probe = createFpsProbe();
    for (let t = 0; t <= until; t += frameMs) probe.sample(t);
    return probe;
  };

  it('has no verdict until warm-up + window have passed', () => {
    expect(run(16.7, (AUTO_QUALITY.warmup + AUTO_QUALITY.window) * 1000 - 100).verdict()).toBeNull();
  });

  it('measures the mean fps after the warm-up', () => {
    const done = (AUTO_QUALITY.warmup + AUTO_QUALITY.window) * 1000 + 50;
    expect(run(1000 / 60, done).verdict()).toBe('high');
    expect(run(1000 / 50, done).verdict()).toBe('med');
    expect(run(1000 / 30, done).verdict()).toBe('low');
  });

  it('ignores a slow start-up (only the window after the warm-up counts)', () => {
    const probe = createFpsProbe();
    let t = 0;
    for (; t < AUTO_QUALITY.warmup * 1000; t += 100) probe.sample(t); // 10 fps while loading
    for (; t <= (AUTO_QUALITY.warmup + AUTO_QUALITY.window) * 1000 + 50; t += 1000 / 60) probe.sample(t);
    expect(probe.verdict()).toBe('high');
  });
});

describe('fps probe pauses (ART-18 review)', () => {
  it('a backgrounded tab (no frames for seconds) restarts the measurement instead of reading as slow', () => {
    const probe = createFpsProbe();
    let t = 0;
    for (; t < 1500; t += 1000 / 60) probe.sample(t);
    t += 5000; // rAF stopped: the tab was hidden
    const end = t + (AUTO_QUALITY.warmup + AUTO_QUALITY.window) * 1000 + 50;
    for (; t <= end; t += 1000 / 60) probe.sample(t);
    expect(probe.verdict()).toBe('high');
  });
});

describe('claimParticles (ART-18)', () => {
  it('claims by difference, never double-counts, and releases what it holds', () => {
    const registry = new ParticleRegistry();
    const a = claimParticles(registry);
    const b = claimParticles(registry);
    a.set(10);
    a.set(10);
    expect(registry.active).toBe(10);
    b.set(5);
    a.set(4);
    expect(registry.active).toBe(9);
    a.release();
    expect(registry.active).toBe(5);
    a.release();
    expect(registry.active).toBe(5);
    b.set(0);
    expect(registry.active).toBe(0);
  });
});
