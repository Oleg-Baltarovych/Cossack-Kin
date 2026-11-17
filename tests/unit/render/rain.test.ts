import { describe, expect, it } from 'vitest';
import { RAIN, RAIN_NIGHT_GRADE, type SkyKeyId } from '../../../src/render/atmosphere/config.ts';
import type { DayCycle } from '../../../src/render/atmosphere/dayCycle.ts';
import { gradeCycle } from '../../../src/render/atmosphere/grading.ts';
import { paintStreakTile, splashes, streakOffset } from '../../../src/render/atmosphere/rain.ts';
import { weatherLook } from '../../../src/render/atmosphere/skyPaint.ts';

describe('rain streaks (ART-17)', () => {
  const tile = paintStreakTile(RAIN.tile, RAIN.near.count, RAIN.near.len, RAIN.slant, 7);

  it('paints opaque 1-px streak px only (no soft alpha), roughly count × len of them', () => {
    let n = 0;
    for (let i = 3; i < tile.length; i += 4) {
      expect([0, 255]).toContain(tile[i]);
      if ((tile[i] ?? 0) > 0) n++;
    }
    expect(n).toBeGreaterThan(RAIN.near.count * RAIN.near.len * 0.6);
    expect(n).toBeLessThanOrEqual(RAIN.near.count * RAIN.near.len);
  });

  it('tiles seamlessly: a streak as long as the tile wraps around and hits every row once', () => {
    const size = 8;
    const one = paintStreakTile(size, 1, size, 0.5, 4);
    for (let y = 0; y < size; y++) {
      let n = 0;
      for (let x = 0; x < size; x++) if ((one[(y * size + x) * 4 + 3] ?? 0) > 0) n++;
      expect(n, `row ${String(y)}`).toBe(1);
    }
  });

  it('scrolls down and sideways with the wind in whole px, wrapping inside the tile, repeatable', () => {
    const a = streakOffset(1.25, RAIN.near.speed, RAIN.tile, RAIN.slant);
    expect(Number.isInteger(a.x) && Number.isInteger(a.y)).toBe(true);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeLessThan(RAIN.tile);
    expect(streakOffset(1.25, RAIN.near.speed, RAIN.tile, RAIN.slant)).toEqual(a);
    expect(streakOffset(1.3, RAIN.near.speed, RAIN.tile, RAIN.slant)).not.toEqual(a);
  });
});

describe('splashes (ART-17)', () => {
  const area = { x0: 0, x1: 400, y0: 380, y1: 800, water: 26 };
  it('at most RAIN.splashes (≤ 80), inside the area, whole px; ripples only in the river band', () => {
    expect(RAIN.splashes).toBeLessThanOrEqual(80);
    for (let t = 0; t < 3; t += 0.37) {
      const list = splashes(t, area);
      expect(list.length).toBeLessThanOrEqual(RAIN.splashes);
      for (const s of list) {
        expect(s.x).toBeGreaterThanOrEqual(area.x0);
        expect(s.x).toBeLessThan(area.x1);
        expect(s.y).toBeGreaterThanOrEqual(area.y0);
        expect(s.y).toBeLessThan(area.y1);
        expect(s.kind === 'ripple').toBe(s.y < area.y0 + area.water);
      }
    }
    expect(splashes(1.1, area)).toEqual(splashes(1.1, area));
  });
});

describe('weather skies (ART-17)', () => {
  it('rain: no sun disc, no halos, no stars or moon', () => {
    const look = weatherLook('day', 'rain');
    expect(look.sun.radius).toBe(0);
    expect(look.sunHalo.strength).toBe(0);
    expect(look.stars).toBe(0);
    expect(look.moon).toBe(0);
  });
  it('fog: a light, nearly flat grey sky, no halos or stars', () => {
    const fog = weatherLook('morning', 'fog');
    for (const [ramp] of fog.chain) expect(['stone', 'plaster']).toContain(ramp);
    expect(fog.horizon - fog.top).toBeLessThan(1);
    expect(fog.sunHalo.strength).toBe(0);
    expect(fog.stars).toBe(0);
  });
});

describe('gradeCycle under rain (ART-17)', () => {
  const at = (keyA: SkyKeyId, keyB: SkyKeyId, t: number): DayCycle => ({
    keyA,
    keyB,
    t,
    sun: { x: 0.5, y: -0.5 },
    moon: { x: 0.5, y: 0.5 },
  });
  it('caps the night key at RAIN_NIGHT_GRADE in rain, keeps the cycle in clear weather and by day', () => {
    const deep = at('dusk', 'night', 1);
    expect(gradeCycle(deep, 'clear')).toBe(deep);
    const rainy = gradeCycle(deep, 'rain');
    expect(rainy.keyB).toBe('night');
    expect(rainy.t).toBe(RAIN_NIGHT_GRADE);
    const day = at('morning', 'day', 0.5);
    expect(gradeCycle(day, 'rain')).toBe(day);
    const both = gradeCycle(at('night', 'night', 0), 'rain');
    expect(both.keyA).toBe('dusk');
    expect(both.t).toBe(RAIN_NIGHT_GRADE);
  });
});
