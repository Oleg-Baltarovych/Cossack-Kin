// Shape primitives (plan ART-02): coverage at px centres, normals that the light pass can read as form.
import { describe, expect, it } from 'vitest';
import {
  dome,
  domeProfile,
  ellipse,
  log,
  poly,
  rect,
  roof,
  unitNormal,
  type Shape,
} from '../../../assets-src/gen/lib/shapes.ts';

const at = (s: Shape, x: number, y: number) => s.fragments.find((f) => f.x === x && f.y === y);
const length = (n: readonly number[]): number => Math.sqrt(n.reduce((sum, c) => sum + c * c, 0));

describe('shape primitives', () => {
  it('unitNormal: integer components, length ≈ 127, flat for a zero vector', () => {
    const n = unitNormal(-1, -1, 0.8);
    expect(n.every((c) => Number.isInteger(c))).toBe(true);
    expect(length(n)).toBeGreaterThan(125);
    expect(length(n)).toBeLessThan(129);
    expect(unitNormal(0, 0, 0)).toEqual([0, 0, 127]);
  });

  it('rect covers w × h px with u, v from its corner', () => {
    const s = rect(2, 1, 3, 2);
    expect(s.fragments).toHaveLength(6);
    expect(at(s, 4, 2)).toMatchObject({ u: 2, v: 1 });
  });

  it('poly fills a right triangle by px centres without gaps or overlaps', () => {
    const s = poly([
      [0, 0],
      [8, 8],
      [0, 8],
    ]);
    const keys = s.fragments.map((f) => `${String(f.x)},${String(f.y)}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(s.fragments).toHaveLength(28); // row y covers the y px whose centre is left of the hypotenuse
    expect(at(s, 0, 7)).toBeDefined();
    expect(at(s, 7, 0)).toBeUndefined();
  });

  it('ellipse is symmetric and its left half faces left, its top half up', () => {
    const s = ellipse(4, 4, 4, 3);
    for (const f of s.fragments) expect(at(s, 7 - f.x, f.y)).toBeDefined();
    expect(at(s, 0, 4)?.normal[0]).toBeLessThan(0);
    expect(at(s, 4, 1)?.normal[1]).toBeLessThan(0);
    expect(ellipse(4, 4, 4, 3, 0).fragments.every((f) => f.normal[2] === 127)).toBe(true);
  });

  it('log: the top row faces up, the bottom row down; vertical logs turn sideways', () => {
    const s = log(0, 0, 8, 4);
    expect(at(s, 3, 0)?.normal[1]).toBeLessThan(0);
    expect(at(s, 3, 3)?.normal[1]).toBeGreaterThan(0);
    const v = log(0, 0, 8, 4, 'y');
    expect(at(v, 0, 5)?.normal[0]).toBeLessThan(0);
    expect(v.w).toBe(4);
  });

  it('hip roof: trapezoid, the left hip faces the sun side, the right hip away', () => {
    const s = roof({ style: 'hip', x: 0, w: 32, top: 0, bottom: 10, inset: 8 });
    const top = s.fragments.filter((f) => f.y === 0);
    const bottom = s.fragments.filter((f) => f.y === 9);
    expect(top.length).toBeLessThan(bottom.length);
    expect(bottom).toHaveLength(32);
    expect(at(s, 1, 9)?.normal[0]).toBeLessThan(0);
    expect(at(s, 30, 9)?.normal[0]).toBeGreaterThan(0);
  });

  it('thatch roof: the eave roll faces down, the slope faces up', () => {
    const s = roof({ style: 'thatch', x: 0, w: 40, top: 0, bottom: 16 });
    expect(at(s, 20, 6)?.normal[1]).toBeLessThan(0);
    expect(at(s, 20, 15)?.normal[1]).toBeGreaterThan(0);
  });

  it('tent roof narrows to an apex', () => {
    const s = roof({ style: 'tent', x: 0, w: 16, top: 0, bottom: 12 });
    expect(s.fragments.filter((f) => f.y === 0).length).toBeLessThanOrEqual(2);
    expect(s.fragments.filter((f) => f.y === 11)).toHaveLength(16);
  });

  it('dome profiles: wider bulb than base, closing to a tip; the pear dome has a waist and an upper bulb', () => {
    for (const style of ['onion', 'pear'] as const) {
      expect(domeProfile(style, 0.25).r).toBeGreaterThan(domeProfile(style, 0).r);
      expect(domeProfile(style, 1).r).toBeCloseTo(0, 5);
    }
    expect(domeProfile('pear', 0.58).r).toBeLessThan(domeProfile('pear', 0.7).r);
    const s = dome(8, 24, 16, 24, 'onion');
    const widest = Math.max(
      ...[...new Set(s.fragments.map((f) => f.y))].map((y) => s.fragments.filter((f) => f.y === y).length),
    );
    expect(s.fragments.filter((f) => f.y === 23).length).toBeLessThan(widest);
    // Below the bulb's widest row the surface faces down (underside reads dark).
    expect(at(s, 8, 22)?.normal[1]).toBeGreaterThan(0);
  });
});
