// Stepped sky band edges (M2-29, ART-BIBLE §8.2 «шви дизеру»): the gradient's row shifts in whole px by runs of columns,
// so a band edge never runs as one ruler-straight row. A3: teeth of 1–3 px depth, the run grid offset per row band.
import { describe, expect, it } from 'vitest';
import { SKY_BAND_EDGES } from '../../../src/render/atmosphere/config.ts';
import { bandShift } from '../../../src/render/atmosphere/skyPaint.ts';

const W = 400;
const rowOf = (y: number): number[] => Array.from({ length: W }, (_, x) => bandShift(x, y));
/** Columns where the shift changes (a run starts), with the run lengths between them. */
const edges = (row: readonly number[]): { at: number[]; runs: number[] } => {
  const at: number[] = [];
  const runs: number[] = [];
  let len = 1;
  for (let x = 1; x < row.length; x++) {
    if (row[x] === row[x - 1]) len++;
    else {
      at.push(x);
      runs.push(len);
      len = 1;
    }
  }
  return { at, runs };
};

describe('bandShift', () => {
  it('stays within ±depthMax whole px, deterministic', () => {
    for (let y = 0; y < 300; y += 7) {
      for (let x = 0; x < W; x++) {
        const s = bandShift(x, y);
        expect(Number.isInteger(s)).toBe(true);
        expect(Math.abs(s)).toBeLessThanOrEqual(SKY_BAND_EDGES.depthMax);
        expect(bandShift(x, y)).toBe(s);
      }
    }
  });

  it('steps along a row in runs of at least runMin columns, with several distinct shifts (no straight edge)', () => {
    for (const y of [10, 120, 250]) {
      const row = rowOf(y);
      const { runs } = edges(row);
      expect(new Set(row).size).toBeGreaterThanOrEqual(3);
      expect(runs.length).toBeGreaterThan(W / (2 * SKY_BAND_EDGES.runMax));
      // Interior runs (both ends seen): never a 1–2 px speck.
      for (const r of runs.slice(1)) expect(r).toBeGreaterThanOrEqual(SKY_BAND_EDGES.runMin);
    }
  });

  it('steps vary in depth: every depth 1…depthMax shows along a row, up and down', () => {
    for (const y of [10, 120, 250]) {
      const row = rowOf(y);
      const teeth = row.filter((s) => s !== 0);
      for (let d = 1; d <= SKY_BAND_EDGES.depthMax; d++)
        expect(
          teeth.some((s) => Math.abs(s) === d),
          `depth ${String(d)} at y ${String(y)}`,
        ).toBe(true);
      expect(teeth.some((s) => s > 0) && teeth.some((s) => s < 0)).toBe(true);
    }
  });

  it('row bands are out of phase: their run edges do not line up column for column', () => {
    const { cellRows } = SKY_BAND_EDGES;
    for (let cell = 0; cell < 10; cell++) {
      const a = new Set(edges(rowOf(cell * cellRows + 1)).at);
      const b = edges(rowOf((cell + 1) * cellRows + 1)).at;
      const shared = b.filter((x) => a.has(x)).length;
      expect(shared, `cells ${String(cell)}/${String(cell + 1)}`).toBeLessThan(b.length * 0.5);
    }
  });
});
