import { describe, expect, it } from 'vitest';
import { WATER } from '../../../src/render/atmosphere/config.ts';
import {
  columnPath,
  darkWave,
  dashes,
  glints,
  sheenDashes,
  waveDashes,
  waveOffset,
  waveStep,
} from '../../../src/render/water.ts';

describe('water waves (ART-09)', () => {
  it('shift rows by whole px only, never past WATER.maxShift', () => {
    for (let step = 0; step < 24; step++) {
      for (let row = 0; row < 26; row++) {
        const dx = waveOffset(row, 26, step);
        expect(Number.isInteger(dx)).toBe(true);
        expect(Math.abs(dx)).toBeLessThanOrEqual(WATER.maxShift);
      }
    }
  });

  it('far water (right under the horizon) is still; near rows move', () => {
    const farMoves = new Set<number>();
    const nearMoves = new Set<number>();
    for (let step = 0; step < 12; step++) {
      farMoves.add(waveOffset(2, 26, step));
      nearMoves.add(waveOffset(24, 26, step));
    }
    expect([...farMoves]).toEqual([0]);
    expect(nearMoves.size).toBeGreaterThan(1);
  });

  it('wave lines drift toward the viewer step by step, and the clock is frozen-deterministic', () => {
    const lines = (step: number): number[] =>
      Array.from({ length: 26 }, (_, r) => r).filter((r) => darkWave(r, 26, step));
    const now = lines(0);
    expect(now.length).toBeGreaterThan(1);
    for (const r of now) if (r + 1 < 26) expect(lines(1)).toContain(r + 1);
    expect(waveStep(1.3)).toBe(waveStep(1.3));
    expect(waveStep(1 / WATER.waveHz + 1e-9)).toBe(1);
  });
});

describe('glints (sun/moon path)', () => {
  it('cluster under the disc, spread wider toward the viewer, and respect the pool size', () => {
    const path = glints(100, 26, 1, 3);
    expect(path.length).toBeGreaterThan(5);
    expect(path.length).toBeLessThanOrEqual(WATER.maxGlints);
    for (const g of path) expect(Math.abs(g.x - 100)).toBeLessThanOrEqual(2 + 10);
    const far = path.filter((g) => g.row < 8).map((g) => Math.abs(g.x - 100));
    for (const d of far) expect(d).toBeLessThanOrEqual(6);
  });

  it('none at zero density; deterministic per step', () => {
    expect(glints(100, 26, 0, 3)).toEqual([]);
    expect(glints(100, 26, 0.7, 5)).toEqual(glints(100, 26, 0.7, 5));
  });
});

describe('dashes and the moon/sun column', () => {
  it('dashes stay inside the row, with gaps between them (no ruled line)', () => {
    const segs = dashes(200, 9, 3, 8);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const next = segs[i + 1];
      if (!s) continue;
      expect(s.x + s.len).toBeLessThanOrEqual(200);
      if (next) expect(next.x - (s.x + s.len)).toBeGreaterThanOrEqual(2);
    }
  });

  it('far-row wave dashes are at most 2 px; near-row ones 3–8 px', () => {
    for (const s of waveDashes(3, 26, 300, 0)) expect(s.len).toBeLessThanOrEqual(2);
    for (const s of waveDashes(20, 26, 300, 0).slice(0, -1)) {
      expect(s.len).toBeGreaterThanOrEqual(3);
      expect(s.len).toBeLessThanOrEqual(8);
    }
  });

  it('the column core is centred on the disc in every row: 1 px far, 3 px mid, 5 px at the bank', () => {
    const cores = columnPath(120, 26, 5, 2).filter((s) => s.core);
    for (const s of cores) expect(s.x + (s.width - 1) / 2).toBe(120); // centred, no zigzag
    expect(cores.filter((s) => s.row <= 7).every((s) => s.width === 1)).toBe(true);
    expect(cores.some((s) => s.row >= 18 && s.width === 5)).toBe(true);
    expect(columnPath(120, 26, 3, 2).every((s) => !s.core || s.width <= 3)).toBe(true);
  });

  it('the waterline sheen is uneven: dash lengths and gaps vary widely', () => {
    const segs = sheenDashes(390);
    expect(new Set(segs.map((s) => s.len)).size).toBeGreaterThan(6);
    expect(segs.some((s) => s.len === 1)).toBe(true);
  });
});
