import { describe, expect, it } from 'vitest';
import {
  CLOUD_SHADOW_LEVELS,
  CLOUDS,
  EMISSIVE_LEVELS,
  LOW_CLOUD,
  sailFps,
} from '../../../src/render/atmosphere/config.ts';
import { dayCycle } from '../../../src/render/atmosphere/dayCycle.ts';
import { cloudShadowLevel, emissiveLevel, keyLevel } from '../../../src/render/atmosphere/emissive.ts';
import { cloudLook, cloudX } from '../../../src/render/layers/Clouds.ts';
import { horizonY } from '../../../src/render/layers/Layer.ts';
import { computeViewport, worldTargetSize } from '../../../src/render/viewport.ts';
import { SKY_LOOKS } from '../../../src/render/atmosphere/config.ts';
import { skyPixel } from '../../../src/render/atmosphere/skyPaint.ts';
import { layerOffset } from '../../../src/render/camera.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';

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

describe('clouds and the HUD (M2-29 framing review)', () => {
  /** Cloud frame (assets-src/gen/sky/cloud): 44 rows, pivot on the base row 39 → 39 rows above it, 5 below. */
  const ABOVE = 39;
  const BELOW = 5;
  /** HUD bottom as a share of the screen, measured on each phone (e2e framing.spec, state=showcase). */
  const PHONES = [
    { w: 390, h: 844, dpr: 3, hud: 0.114 },
    { w: 360, h: 800, dpr: 3, hud: 0.121 },
    { w: 412, h: 915, dpr: 3.5, hud: 0.117 },
  ] as const;

  it('every cloud stands wholly below the HUD edge at the default framing (none hidden under it, none sliced)', () => {
    for (const p of PHONES) {
      const viewH = worldTargetSize(computeViewport(p.w, p.h, p.dpr)).height;
      const hud = Math.ceil(viewH * p.hud);
      for (const c of CLOUDS) {
        const scaleY = c.y > LOW_CLOUD.below ? LOW_CLOUD.scaleY : 1;
        const base = Math.round(horizonY(viewH) * c.y);
        const top = base - Math.ceil(ABOVE * scaleY);
        const bottom = base + Math.ceil(BELOW * scaleY);
        expect(
          top >= hud,
          `${c.variant} on ${String(p.w)}: rows ${String(top)}–${String(bottom)}, HUD ${String(hud)}`,
        ).toBe(true);
      }
    }
  });
});

describe('clouds and the moon (M2-29a art review)', () => {
  /** Cloud footprints (assets-src/gen/sky/cloud `CLOUD_SHAPES` widths) and rows around the base (as above). */
  const WIDTH = { c1: 120, c2: 92, c3: 70, c4: 52, c5: 104 } as const;
  it('in each zone frame at 23:00 (freeze 0) the moon disc and its halo core stand clear of every cloud', () => {
    for (const p of [
      { w: 390, h: 844, dpr: 3 },
      { w: 360, h: 800, dpr: 3 },
      { w: 412, h: 915, dpr: 3.5 },
    ] as const) {
      const { width: viewW, height: viewH } = worldTargetSize(computeViewport(p.w, p.h, p.dpr));
      const sky = horizonY(viewH);
      const moon = skyPixel(dayCycle(23 * 60).moon, viewW, sky);
      // The disc and the bright core of its halo (half its radius): the key light a cloud must not chop.
      const radius = SKY_LOOKS.night.moonHalo.radius / 2;
      const span = Math.round(KHORTYTSIA_WORLD.width * 0.1) + viewW;
      for (const zone of KHORTYTSIA_WORLD.zones) {
        const cam = Math.min(zone.anchorX, KHORTYTSIA_WORLD.width - viewW);
        for (const c of CLOUDS) {
          const scaleY = c.y > LOW_CLOUD.below ? LOW_CLOUD.scaleY : 1;
          const base = Math.round(sky * c.y);
          const x = cloudX(c, 0, span) + layerOffset(cam, 0.1);
          const box = {
            x0: x - WIDTH[c.variant] / 2,
            x1: x + WIDTH[c.variant] / 2,
            y0: base - Math.ceil(39 * scaleY),
            y1: base + Math.ceil(5 * scaleY),
          };
          const dx = Math.max(box.x0 - moon.x, 0, moon.x - box.x1);
          const dy = Math.max(box.y0 - moon.y, 0, moon.y - box.y1);
          expect(Math.hypot(dx, dy), `${c.variant} over the moon in ${zone.id} on ${String(p.w)}`).toBeGreaterThan(
            radius,
          );
        }
      }
    }
  });
});
