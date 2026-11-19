// Cosmetic plot variants (plan M2-10, SPEC §2.6): a pure function of the game seed — no state, no save field.
import { describe, expect, it } from 'vitest';
import { PLOT_VARIANTS, type VariantPlot } from '../../../src/content/variants.ts';
import { pickStable } from '../../../src/core/rng.ts';
import { plotVariant, plotVariants } from '../../../src/core/selectors.ts';
import { createInitialState } from '../../../src/core/state.ts';

const T0 = 1_763_400_000_000;
const PLOTS = Object.keys(PLOT_VARIANTS) as VariantPlot[];
/** plotVariant of seeds 1–3 in PLOTS order, frozen when the rendezvous pick shipped (M2-10 review). */
const GOLDEN: Record<number, number[]> = {
  1: [2, 2, 0, 2, 2, 1, 1, 2],
  2: [1, 2, 1, 1, 1, 0, 1, 1],
  3: [2, 0, 0, 1, 0, 0, 2, 0],
};
const combo = (seed: number): string => PLOTS.map((p) => plotVariant(seed, p)).join(',');

describe('plotVariant (M2-10)', () => {
  it('gives seeds 1, 2 and 3 different combinations of add-ons', () => {
    expect(new Set([combo(1), combo(2), combo(3)]).size).toBe(3);
  });

  it('gives the same seed the same combination every time', () => {
    for (const seed of [1, 2, 3, 0xffffffff]) expect(combo(seed)).toBe(combo(seed));
  });

  it('picks an option the plot has, and uses every option over many seeds', () => {
    for (const p of PLOTS) {
      const seen = new Set(Array.from({ length: 200 }, (_, seed) => plotVariant(seed, p)));
      expect([...seen].sort(), p).toEqual(Array.from({ length: PLOT_VARIANTS[p].options }, (_, i) => i));
    }
  });

  it('plotVariants reads the state seed only: progress and time never change the village look', () => {
    const s = createInitialState({ seed: 2, now: T0 });
    const later = {
      ...s,
      time: { ...s.time, lastSeen: T0 + 9e6 },
      village: { ...s.village, levels: { ...s.village.levels, potter: 40 } },
    };
    expect(plotVariants(s)).toEqual(Object.fromEntries(PLOTS.map((p) => [p, plotVariant(2, p)])));
    expect(plotVariants(later)).toEqual(plotVariants(s));
  });

  it('plotVariants differs for seed 2 and seed 3 through the state path', () => {
    const at = (seed: number) => plotVariants(createInitialState({ seed, now: T0 }));
    expect(at(2)).not.toEqual(at(3));
  });

  it('is pinned: shipped seeds keep their village (golden values)', () => {
    expect(PLOTS.map((p) => plotVariant(1, p))).toEqual(GOLDEN[1]);
    expect(PLOTS.map((p) => plotVariant(2, p))).toEqual(GOLDEN[2]);
    expect(PLOTS.map((p) => plotVariant(3, p))).toEqual(GOLDEN[3]);
  });
});

describe('pickStable (M2-10 review)', () => {
  it('adding an option moves a seed only onto the new option, never between old ones', () => {
    for (const options of [2, 3, 5]) {
      for (let seed = 0; seed < 2000; seed++) {
        const before = pickStable(seed, 7, options);
        const after = pickStable(seed, 7, options + 1);
        expect(after === before || after === options, `seed ${String(seed)} ${String(options)}→`).toBe(true);
      }
    }
  });

  it('spreads seeds over every option', () => {
    const counts = [0, 0, 0];
    for (let seed = 0; seed < 3000; seed++) counts[pickStable(seed, 1, 3)] = (counts[pickStable(seed, 1, 3)] ?? 0) + 1;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });
});
