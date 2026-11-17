import { describe, expect, it } from 'vitest';
import oak from '../../../assets-src/gen/khortytsia/oak/index.ts';
import plant from '../../../assets-src/gen/khortytsia/plant/index.ts';
import willow from '../../../assets-src/gen/khortytsia/willow/index.ts';
import { Plot } from '../../../assets-src/gen/lib/plot.ts';
import { footProfile, SWAY_SHIFTS, swayed } from '../../../assets-src/gen/lib/recipes-plants.ts';
import { SWAY } from '../../../src/render/atmosphere/config.ts';
import { SWAY_UPRIGHT } from '../../../src/render/sway.ts';

describe('plant sway frames (ART-14)', () => {
  it('generators bake as many frames as render picks from, upright in the middle', () => {
    for (const g of [oak, willow, plant]) expect(g.frames.idle).toBe(SWAY.frames);
    expect(SWAY_SHIFTS).toHaveLength(SWAY.frames);
    expect(SWAY_SHIFTS[SWAY_UPRIGHT]).toBe(0);
  });

  it('swayed keeps the foot, moves the top by the full shift and every row by whole px', () => {
    const stalk = new Plot();
    for (let y = 10; y <= 30; y++) stalk.set(20, y, 'grass', 3);
    const leaning = swayed(stalk, 2, footProfile(30, 20));
    expect(leaning.has(20, 30)).toBe(true); // foot still
    expect(leaning.has(22, 10)).toBe(true); // top leans 2 px
    let prev = 20;
    for (let y = 30; y >= 10; y--) {
      const x = [18, 19, 20, 21, 22].find((c) => leaning.has(c, y));
      expect(x, `row ${String(y)}`).toBeDefined();
      expect(Math.abs((x ?? 0) - prev)).toBeLessThanOrEqual(1); // no tear wider than a px
      prev = x ?? prev;
    }
    expect(leaning.px.size).toBe(stalk.px.size);
  });

  it('leans mirror each other', () => {
    const stalk = new Plot();
    for (let y = 0; y <= 20; y++) stalk.set(20, y, 'grass', 3);
    const right = swayed(stalk, 1, footProfile(20, 20));
    const left = swayed(stalk, -1, footProfile(20, 20));
    for (let y = 0; y <= 20; y++) expect(right.has(21, y)).toBe(left.has(19, y));
  });
});
