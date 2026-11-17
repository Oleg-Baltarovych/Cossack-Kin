import { describe, expect, it } from 'vitest';
import { KHORTYTSIA, type WindLevel } from '../../../src/content/villages/khortytsia.ts';
import { collectModifiers } from '../../../src/core/modifiers.ts';
import { createInitialState } from '../../../src/core/state.ts';
import {
  stormStarts,
  stormsSurvivedDuring,
  windAt,
  windBreakpoints,
} from '../../../src/core/systems/village-mechanics/wind.ts';

const SLOT_MS = KHORTYTSIA.wind.slotSec * 1000;
const DAY_MS = 24 * 3600 * 1000;
const T0 = 1_763_400_000_000;
const SEED = 0xc0ffee;

describe('wind: a pure function of (seed, time) (M1-07)', () => {
  it('gives the same answer for (seed, t) in any call order', () => {
    const times = Array.from({ length: 200 }, (_, i) => T0 + i * 137_000);
    const forward = times.map((t) => windAt(SEED, t));
    const backward = [...times]
      .reverse()
      .map((t) => windAt(SEED, t))
      .reverse();
    expect(backward).toEqual(forward);
  });

  it('is constant inside a slot and changes only on slot boundaries', () => {
    for (let i = 0; i < 300; i++) {
      const start = Math.floor(T0 / SLOT_MS) * SLOT_MS + i * SLOT_MS;
      expect(windAt(SEED, start + SLOT_MS - 1)).toBe(windAt(SEED, start));
    }
    for (const b of windBreakpoints(SEED, T0, T0 + DAY_MS)) {
      expect(b % SLOT_MS).toBe(0);
      expect(windAt(SEED, b)).not.toBe(windAt(SEED, b - 1));
    }
  });

  it('windBreakpoints lists every change in (from, to], in order, and nothing else', () => {
    const from = T0 + 123_456;
    const to = from + 2 * DAY_MS;
    const points = windBreakpoints(SEED, from, to);
    expect(points).toEqual([...points].sort((a, b) => a - b));
    for (const p of points) expect(p > from && p <= to).toBe(true);
    // Walk every slot boundary: a change appears in the list exactly when the wind differs across it.
    const first = (Math.floor(from / SLOT_MS) + 1) * SLOT_MS;
    const expected: number[] = [];
    for (let b = first; b <= to; b += SLOT_MS) if (windAt(SEED, b) !== windAt(SEED, b - 1)) expected.push(b);
    expect(points).toEqual(expected);
  });

  it('a different seed gives a different wind', () => {
    const a = Array.from({ length: 50 }, (_, i) => windAt(1, T0 + i * SLOT_MS));
    const b = Array.from({ length: 50 }, (_, i) => windAt(2, T0 + i * SLOT_MS));
    expect(a).not.toEqual(b);
  });

  it('over 30 days each level takes its content share (±0.03)', () => {
    const counts: Record<WindLevel, number> = { calm: 0, breeze: 0, storm: 0 };
    const slots = (30 * DAY_MS) / SLOT_MS;
    for (let i = 0; i < slots; i++) counts[windAt(SEED, T0 + i * SLOT_MS)] += 1;
    const total = KHORTYTSIA.wind.levels.reduce((s, l) => s + l.weight, 0);
    for (const l of KHORTYTSIA.wind.levels)
      expect(Math.abs(counts[l.id] / slots - l.weight / total)).toBeLessThan(0.03);
  });
});

describe('storms (M1-07)', () => {
  it('stormStarts lists the times a storm begins in (from, to]: a storm slot after a non-storm slot', () => {
    const from = T0;
    const to = T0 + 3 * DAY_MS;
    const starts = stormStarts(SEED, from, to);
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) {
      expect(windAt(SEED, s)).toBe('storm');
      expect(windAt(SEED, s - 1)).not.toBe('storm');
      expect(s > from && s <= to).toBe(true);
    }
    // Splitting the interval anywhere finds the same starts (offline = many online ticks).
    const mid = T0 + 1.37 * DAY_MS;
    expect([...stormStarts(SEED, from, mid), ...stormStarts(SEED, mid, to)]).toEqual(starts);
  });
});

describe('the wind on the windmill (M1-07)', () => {
  it('collectModifiers(state, now): windmill × land passive × the wind multiplier now', () => {
    const s = createInitialState({ seed: SEED, now: T0 });
    const look = (id: WindLevel): number => KHORTYTSIA.wind.levels.find((l) => l.id === id)?.windmillMult ?? 0;
    for (let i = 0; i < 40; i++) {
      const now = T0 + i * SLOT_MS;
      const m = collectModifiers(s, now);
      expect(m.buildingMult.windmill).toBe(KHORTYTSIA.passive.mult * look(windAt(SEED, now)));
      expect(m.buildingMult.field).toBe(1);
    }
  });
});

describe('storms survived toward the Bloom goal (M1-07)', () => {
  it('count the storms that begin while the windmill is at the goal level; none below it', () => {
    const from = T0;
    const to = T0 + 2 * DAY_MS;
    const goal = KHORTYTSIA.bloomGoal.windmillLevel;
    const all = stormStarts(SEED, from, to).length;
    expect(stormsSurvivedDuring(SEED, from, to, goal)).toBe(all);
    expect(stormsSurvivedDuring(SEED, from, to, goal + 10)).toBe(all);
    expect(stormsSurvivedDuring(SEED, from, to, goal - 1)).toBe(0);
  });
});
