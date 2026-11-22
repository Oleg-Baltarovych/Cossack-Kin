// Stepped sky band edges (M2-29, ART-BIBLE §8.2 «шви дизеру»): the gradient's row shifts in whole px by runs of columns,
// so a band edge never runs as one ruler-straight row.
import { describe, expect, it } from 'vitest';
import { SKY_BAND_EDGES } from '../../../src/render/atmosphere/config.ts';
import { bandShift } from '../../../src/render/atmosphere/skyPaint.ts';

describe('bandShift', () => {
  const W = 400;
  it('stays within ±shift whole px, deterministic', () => {
    for (let y = 0; y < 300; y += 7) {
      for (let x = 0; x < W; x++) {
        const s = bandShift(x, y);
        expect(Number.isInteger(s)).toBe(true);
        expect(Math.abs(s)).toBeLessThanOrEqual(SKY_BAND_EDGES.shift);
        expect(bandShift(x, y)).toBe(s);
      }
    }
  });

  it('steps along a row in runs of at least runMin columns, with several distinct shifts (no straight edge)', () => {
    for (const y of [10, 120, 250]) {
      const row = Array.from({ length: W }, (_, x) => bandShift(x, y));
      const runs: number[] = [];
      let len = 1;
      for (let x = 1; x < W; x++) {
        if (row[x] === row[x - 1]) len++;
        else {
          runs.push(len);
          len = 1;
        }
      }
      expect(new Set(row).size).toBeGreaterThanOrEqual(3);
      expect(runs.length).toBeGreaterThan(W / (2 * SKY_BAND_EDGES.runMax));
      // Interior runs (both ends seen): never a 1–2 px speck.
      for (const r of runs.slice(1)) expect(r).toBeGreaterThanOrEqual(SKY_BAND_EDGES.runMin);
    }
  });
});
