import { describe, expect, it } from 'vitest';
import { SKY_KEYS } from '../../../src/render/atmosphere/config.ts';
import { dayCycle } from '../../../src/render/atmosphere/dayCycle.ts';

const hm = (h: number, m = 0): number => h * 60 + m;

describe('dayCycle keys', () => {
  it('at each key time the key is reached in full (t = 0, keyA = keyB)', () => {
    for (const key of SKY_KEYS) {
      const c = dayCycle(key.at);
      expect(c.keyA, key.id).toBe(key.id);
      expect(c.keyB, key.id).toBe(key.id);
      expect(c.t, key.id).toBe(0);
    }
  });

  it('holds the key until at + hold, then starts blending toward the next key', () => {
    const day = SKY_KEYS.find((k) => k.id === 'day');
    if (!day) throw new Error('no day key');
    const held = dayCycle(day.at + day.hold);
    expect([held.keyA, held.keyB, held.t]).toEqual(['day', 'day', 0]);
    const after = dayCycle(day.at + day.hold + 1);
    expect(after.keyA).toBe('day');
    expect(after.keyB).toBe('golden');
    expect(after.t).toBeGreaterThan(0);
    expect(after.t).toBeLessThan(0.01);
  });

  it('interpolates monotonically with t = 0.5 at the middle of a transition', () => {
    // day holds 13:00–17:00, golden at 19:30 → middle at 18:15.
    const mid = dayCycle(hm(18, 15));
    expect([mid.keyA, mid.keyB]).toEqual(['day', 'golden']);
    expect(mid.t).toBeCloseTo(0.5, 9);
    let prev = -1;
    for (let m = hm(17) + 1; m < hm(19, 30); m += 5) {
      const { t } = dayCycle(m);
      expect(t).toBeGreaterThan(prev);
      expect(t).toBeLessThan(1);
      prev = t;
    }
  });

  it('just before a key the blend is almost the next key', () => {
    const c = dayCycle(hm(19, 30) - 0.01);
    expect([c.keyA, c.keyB]).toEqual(['day', 'golden']);
    expect(c.t).toBeGreaterThan(0.999);
  });

  it('crosses midnight: night holds past 00:00 and blends into dawn before 05:30', () => {
    for (const m of [hm(23, 30), hm(0), hm(2), hm(3, 59)]) {
      const c = dayCycle(m);
      expect([c.keyA, c.keyB, c.t], String(m)).toEqual(['night', 'night', 0]);
    }
    const c = dayCycle(hm(4, 45)); // night holds to 04:00, dawn at 05:30
    expect([c.keyA, c.keyB]).toEqual(['night', 'dawn']);
    expect(c.t).toBeCloseTo(0.5, 9);
  });

  it('wraps any finite input into one day', () => {
    expect(dayCycle(hm(13) + 1440)).toEqual(dayCycle(hm(13)));
    expect(dayCycle(-60)).toEqual(dayCycle(hm(23)));
    expect(dayCycle(1440)).toEqual(dayCycle(0));
  });

  it('non-finite input falls back to midday instead of NaN', () => {
    expect(dayCycle(Number.NaN)).toEqual(dayCycle(hm(13)));
  });
});

describe('dayCycle sun and moon', () => {
  it('sun is low at dawn and golden hour, culminates near solar noon', () => {
    const dawn = dayCycle(hm(5, 30)).sun;
    const noon = dayCycle(hm(12, 45)).sun;
    const golden = dayCycle(hm(19, 30)).sun;
    expect(dawn.y).toBeGreaterThan(0);
    expect(dawn.y).toBeLessThan(0.15); // just above the horizon
    expect(noon.y).toBeGreaterThan(0.85);
    expect(golden.y).toBeGreaterThan(0.05);
    expect(golden.y).toBeLessThan(0.25); // low, warm light
    for (const m of [hm(9), hm(16)]) expect(dayCycle(m).sun.y).toBeLessThan(noon.y);
  });

  it('art convention (ART-BIBLE §3, sprites lit from the top-left): a visible sun stays in the left 40% of the view', () => {
    for (const key of SKY_KEYS) {
      const { sun } = dayCycle(key.at);
      if (sun.y > 0) expect(sun.x, key.id).toBeLessThan(0.4);
    }
    for (let m = 0; m < 1440; m += 10) {
      const { sun } = dayCycle(m);
      if (sun.y > 0) expect(sun.x, String(m)).toBeLessThan(0.4);
    }
    // Low sun hugs the left edge, high sun stands further in; never off the left edge.
    expect(dayCycle(hm(19, 30)).sun.x).toBeLessThan(dayCycle(hm(13)).sun.x);
    expect(dayCycle(hm(5, 30)).sun.x).toBeGreaterThan(0.1);
  });

  it('sun is below the horizon at night and the moon is up', () => {
    for (const m of [hm(22), hm(23), hm(0), hm(2)]) {
      const c = dayCycle(m);
      expect(c.sun.y, String(m)).toBeLessThan(0);
      expect(c.moon.y, String(m)).toBeGreaterThan(0);
    }
  });

  it('moon at 23:00 stands well above the horizon, left of centre; positions move continuously over midnight', () => {
    const moon = dayCycle(hm(23)).moon;
    expect(moon.y).toBeGreaterThan(0.35);
    expect(moon.x).toBeLessThan(0.5);
    const before = dayCycle(1440 - 0.5);
    const after = dayCycle(0.5);
    expect(Math.abs(after.moon.x - before.moon.x)).toBeLessThan(0.01);
    expect(Math.abs(after.sun.y - before.sun.y)).toBeLessThan(0.01);
  });
});
