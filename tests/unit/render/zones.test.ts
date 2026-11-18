import { describe, expect, it } from 'vitest';
import type { GroundSegment, River } from '../../../src/content/villages/khortytsia.layout.ts';
import { hazeCover, riverRowEnd, riverRowsAt, riverSpan } from '../../../src/render/zones.ts';
import { overlapsX } from '../../../src/render/cull.ts';

const river: River = { x0: 0, x1: 1000, rows: 26, taper: 50 };

describe('river rows (M2-01)', () => {
  it('the far row runs to x1, the nearest ends `taper` px earlier, rows in between step monotonically', () => {
    expect(riverRowEnd(river, 0)).toBe(1000);
    expect(riverRowEnd(river, 25)).toBe(950);
    for (let r = 1; r < river.rows; r++) expect(riverRowEnd(river, r)).toBeLessThanOrEqual(riverRowEnd(river, r - 1));
  });

  it('counts the water rows over a world column: all of them before the taper, none past x1', () => {
    expect(riverRowsAt(river, 0)).toBe(26);
    expect(riverRowsAt(river, 949)).toBe(26);
    expect(riverRowsAt(river, 975)).toBeGreaterThan(0);
    expect(riverRowsAt(river, 975)).toBeLessThan(26);
    expect(riverRowsAt(river, 1000)).toBe(0);
    expect(riverRowsAt({ ...river, x0: 100 }, 99)).toBe(0);
    expect(riverRowsAt(null, 0)).toBe(0);
  });

  it('a row on screen is clipped to the view and to the river; off screen it is null', () => {
    expect(riverSpan(river, 0, 0, 390)).toEqual({ a: 0, b: 390 });
    expect(riverSpan(river, 0, 800, 390)).toEqual({ a: 0, b: 200 });
    expect(riverSpan(river, 25, 800, 390)).toEqual({ a: 0, b: 150 });
    expect(riverSpan(river, 0, 1000, 390)).toBeNull();
    expect(riverSpan({ ...river, x0: 500 }, 0, 300, 390)).toEqual({ a: 200, b: 390 });
  });
});

describe('ground haze cover per world column (M2-01)', () => {
  const seg = (x0: number, x1: number, groundHaze: boolean): GroundSegment => ({
    x0,
    x1,
    rows: [],
    fill: 'grass',
    groundHaze,
  });

  it('full over hazed zones, 0 over the others, fading out inside the hazed side of an edge', () => {
    const cover = hazeCover([seg(0, 100, true), seg(100, 200, true), seg(200, 300, false)], 300, 20);
    expect(cover).toHaveLength(300);
    expect(cover[0]).toBe(1);
    expect(cover[150]).toBe(1);
    expect(cover[179]).toBe(1);
    expect(cover[180]).toBe(1);
    expect(cover[181]).toBeLessThan(1);
    expect(cover[190]).toBeGreaterThan(0);
    expect(cover[190]).toBeLessThan(1);
    expect(cover[199]).toBeLessThan(cover[190] ?? 0);
    expect(cover[200]).toBe(0);
    expect(cover[299]).toBe(0);
  });
});

describe('cullByX (M2-01)', () => {
  it('a box is drawn iff it overlaps the view range', () => {
    expect(overlapsX(0, 64, 64, 400)).toBe(false);
    expect(overlapsX(1, 64, 64, 400)).toBe(true);
    expect(overlapsX(399, 10, 64, 400)).toBe(true);
    expect(overlapsX(400, 10, 64, 400)).toBe(false);
  });
});
