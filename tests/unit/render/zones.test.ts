import { describe, expect, it } from 'vitest';
import type { GroundSegment, River } from '../../../src/content/villages/khortytsia.layout.ts';
import { hazeCover, riverRowEnd, riverRowsAt, riverSpan, zoneAt } from '../../../src/render/zones.ts';
import { overlapsX } from '../../../src/render/cull.ts';

const river: River = { x0: 0, x1: 1000, rows: 26, taper: 50 };

describe('river rows (M2-01)', () => {
  it('the far row runs to x1, the nearest ends `taper` px earlier, rows in between step monotonically', () => {
    expect(riverRowEnd(river, 0)).toBe(1000);
    expect(riverRowEnd(river, 25)).toBe(950);
    for (let r = 1; r < river.rows; r++) expect(riverRowEnd(river, r)).toBeLessThanOrEqual(riverRowEnd(river, r - 1));
  });

  it('a stepped bank profile (M2-29 A2) ends each row `bank[r]` px before x1 instead of on the clean taper', () => {
    const bank = Array.from({ length: 26 }, (_, r) => (r < 2 ? 0 : r < 5 ? 4 : 50));
    const stepped: River = { ...river, bank };
    expect(riverRowEnd(stepped, 0)).toBe(1000);
    expect(riverRowEnd(stepped, 1)).toBe(1000);
    expect(riverRowEnd(stepped, 3)).toBe(996);
    expect(riverRowEnd(stepped, 25)).toBe(950);
    expect(riverRowsAt(stepped, 997)).toBe(2);
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

describe('zoneAt (M2-02: the tab follows the settled camera)', () => {
  const zones = [
    { id: 'farm', x0: 0, x1: 768, anchorX: 0 },
    { id: 'suburb', x0: 768, x1: 1152, anchorX: 768 },
    { id: 'sich', x0: 1152, x1: 1920, anchorX: 1152 },
  ] as const;

  it('the zone under the centre; edges belong to the zone on the right', () => {
    expect(zoneAt(zones, 100, null, 32)).toBe('farm');
    expect(zoneAt(zones, 768, null, 32)).toBe('suburb');
    expect(zoneAt(zones, 1500, null, 32)).toBe('sich');
  });

  it('keeps the current zone within the hysteresis past its edge, switches beyond it', () => {
    expect(zoneAt(zones, 1152 + 31, 'suburb', 32)).toBe('suburb');
    expect(zoneAt(zones, 1152 + 32, 'suburb', 32)).toBe('sich');
    expect(zoneAt(zones, 1152 - 20, 'sich', 32)).toBe('sich');
    expect(zoneAt(zones, 1152 - 40, 'sich', 32)).toBe('suburb');
  });
});
