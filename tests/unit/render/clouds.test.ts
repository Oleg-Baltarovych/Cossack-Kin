import { describe, expect, it } from 'vitest';
import { CLOUD_SHADOW_LEVELS, CLOUDS, EMISSIVE_LEVELS, sailFps } from '../../../src/render/atmosphere/config.ts';
import { dayCycle } from '../../../src/render/atmosphere/dayCycle.ts';
import { cloudShadowLevel, emissiveLevel, keyLevel } from '../../../src/render/atmosphere/emissive.ts';
import { cloudLook, cloudX } from '../../../src/render/layers/Clouds.ts';

const cloud = { variant: 'c2', x: 100, y: 0.4, speed: 2 } as const;

describe('cloudX (ART-07 drift)', () => {
  it('drifts right at the cloud speed in whole px', () => {
    expect(cloudX(cloud, 0, 400, 50)).toBe(100);
    expect(cloudX(cloud, 10, 400, 50)).toBe(120);
    expect(Number.isInteger(cloudX(cloud, 3.3, 400, 50))).toBe(true);
  });

  it('wraps from past the right edge back to the left margin, keeping its speed', () => {
    // period = 400 + 2·50 = 500 px → back to the start after 250 s
    expect(cloudX(cloud, 250, 400, 50)).toBe(100);
    const leaving = cloudX(cloud, 174, 400, 50); // 100 + 348 = 448 → still on screen side of +50
    expect(leaving).toBe(448);
    expect(cloudX(cloud, 176, 400, 50)).toBe(-48); // 452 → re-entered at −50 + 2
  });

  it('every configured cloud stays inside the sky band and drifts slowly (wind, not weather)', () => {
    expect(CLOUDS.length).toBeGreaterThanOrEqual(3);
    expect(CLOUDS.length).toBeLessThanOrEqual(6);
    for (const c of CLOUDS) {
      expect(c.y).toBeGreaterThan(0.05);
      expect(c.y).toBeLessThan(0.95);
      expect(c.speed).toBeGreaterThan(0);
      expect(c.speed).toBeLessThan(5);
    }
  });
});

describe('per-key levels', () => {
  it('blend between the two keys of the cycle', () => {
    const c = dayCycle(13 * 60);
    expect(keyLevel(CLOUD_SHADOW_LEVELS, c)).toBeCloseTo(
      CLOUD_SHADOW_LEVELS[c.keyA] + (CLOUD_SHADOW_LEVELS[c.keyB] - CLOUD_SHADOW_LEVELS[c.keyA]) * c.t,
      10,
    );
    expect(emissiveLevel(c)).toBeCloseTo(keyLevel(EMISSIVE_LEVELS, c), 10);
  });

  it('cloud shadows are full at noon and absent at night (no sun to cast them)', () => {
    expect(cloudShadowLevel(dayCycle(13 * 60))).toBeCloseTo(1, 5);
    expect(cloudShadowLevel(dayCycle(23 * 60))).toBe(0);
    expect(cloudShadowLevel(dayCycle(19 * 60 + 30))).toBeLessThan(1);
  });
});

describe('cloudLook (per-key cloud tint and rim)', () => {
  const grey = (tint: number): number => tint & 0xff;
  it('night clouds are dark masses, day clouds untinted', () => {
    expect(grey(cloudLook(dayCycle(13 * 60)).tint)).toBe(255);
    expect(grey(cloudLook(dayCycle(23 * 60)).tint)).toBeLessThan(140);
  });

  it('a low sun lights the rim (golden hour, dawn); none at noon or at night', () => {
    expect(cloudLook(dayCycle(19 * 60 + 30)).rimAlpha).toBeGreaterThan(0.8);
    expect(cloudLook(dayCycle(5 * 60 + 30)).rimAlpha).toBeGreaterThan(0.5);
    expect(cloudLook(dayCycle(13 * 60)).rimAlpha).toBe(0);
    expect(cloudLook(dayCycle(23 * 60)).rimAlpha).toBe(0);
    // Golden-hour rim is warm: red over blue.
    const rim = cloudLook(dayCycle(19 * 60 + 30)).rimTint;
    expect((rim >> 16) & 0xff).toBeGreaterThan(rim & 0xff);
  });
});

describe('sailFps (ART-13 wind)', () => {
  it('turns lazily in light air and fast in a gale, clamped to 0..1 strength', () => {
    expect(sailFps(0)).toBe(2);
    expect(sailFps(1)).toBe(10);
    expect(sailFps(0.5)).toBeGreaterThan(sailFps(0.2));
    expect(sailFps(5)).toBe(10);
    expect(sailFps(-1)).toBe(2);
  });
});
