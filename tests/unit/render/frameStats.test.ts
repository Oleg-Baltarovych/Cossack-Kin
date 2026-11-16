import { describe, expect, it } from 'vitest';
import { createFrameStats } from '../../../src/render/debug/frameStats.ts';
import { ParticleRegistry } from '../../../src/render/fx/registry.ts';

describe('createFrameStats (1 s averages)', () => {
  it('publishes nothing until a full window has passed', () => {
    const stats = createFrameStats(1000);
    expect(stats.sample(0, 2)).toBe(false);
    expect(stats.sample(500, 2)).toBe(false);
    expect(stats.current()).toEqual({ fps: 0, frameMs: 0 });
  });

  it('60 frames in one second → 60 fps, mean CPU ms of those frames', () => {
    const stats = createFrameStats(1000);
    let published = false;
    for (let i = 0; i <= 60; i++) published = stats.sample((i * 1000) / 60, i % 2 === 0 ? 2 : 4) || published;
    expect(published).toBe(true);
    expect(stats.current().fps).toBeCloseTo(60, 6);
    expect(stats.current().frameMs).toBeCloseTo(3, 1);
  });

  it('starts a new window after publishing', () => {
    const stats = createFrameStats(1000);
    for (let i = 0; i <= 30; i++) stats.sample((i * 1000) / 30, 1);
    expect(stats.current().fps).toBeCloseTo(30, 6);
    for (let i = 1; i <= 10; i++) stats.sample(1000 + i * 100, 8);
    expect(stats.current().fps).toBeCloseTo(10, 6);
    expect(stats.current().frameMs).toBeCloseTo(8, 6);
  });
});

describe('ParticleRegistry', () => {
  it('counts acquired and released particles, never below zero', () => {
    const registry = new ParticleRegistry();
    registry.acquire(40);
    registry.acquire(80);
    expect(registry.active).toBe(120);
    registry.release(30);
    expect(registry.active).toBe(90);
    registry.release(500);
    expect(registry.active).toBe(0);
  });

  it('ignores non-positive and non-integer counts', () => {
    const registry = new ParticleRegistry();
    registry.acquire(-5);
    registry.acquire(1.5);
    registry.acquire(Number.NaN);
    expect(registry.active).toBe(0);
  });
});
