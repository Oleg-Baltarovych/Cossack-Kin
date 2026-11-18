import { describe, expect, it } from 'vitest';
import { PACING } from '../../../src/content/pacing.ts';
import { Big } from '../../../src/core/big.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { evaluate, longestZeroRun, renderReport, type Corridor } from '../../../tools/lib/balance/report.ts';
import { DEFAULT_EPOCH, sessionOf, sessionStarts, simulate, type SimResult } from '../../../tools/lib/balance/sim.ts';

const HOUR = 3600_000;

describe('simulate (M1-14, SPEC §12.3)', () => {
  it('known time: field level 1, no ducats, no taps → the next field level is bought at the first 2-s step after 23 s', () => {
    // Level 1 → 2 costs 10 × 1.15 = 11.5 ducats; one field earns 0.5/s, so the price is there after 23 s.
    const s = createInitialState({ seed: 1, now: DEFAULT_EPOCH + 8 * HOUR });
    const initial = {
      ...s,
      currencies: { ...s.currencies, ducats: Big.ZERO },
      village: { ...s.village, levels: { ...s.village.levels, field: 1 } },
    };
    const r = simulate({ seed: 1, days: 1, taps: false, initial });
    expect(r.firstPurchaseSec).toBe(24);
  });

  it('two runs are identical, byte for byte (report included)', () => {
    const a = simulate({ seed: 2, days: 3 });
    const b = simulate({ seed: 2, days: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(renderReport([a], evaluate([a]))).toBe(renderReport([b], evaluate([b])));
  });

  it('60 days of play simulate in under 10 s', () => {
    const t = performance.now();
    const r = simulate({ seed: 3, days: 60 });
    expect(performance.now() - t).toBeLessThan(10_000);
    expect(r.sessions).toHaveLength(60 * PACING.sessionsPerDay);
  }, 20_000);
});

describe('sessions and novelty (M1-14, SPEC §2.3–2.4)', () => {
  it('an event between sessions (an offline storm) belongs to the session the player comes back in', () => {
    const starts = sessionStarts(DEFAULT_EPOCH, 2);
    const first = starts[0] ?? 0;
    expect(sessionOf(first + 60_000, starts)).toBe(1);
    // 08:07 → 20:00 is offline: a storm at 13:00 is seen in the evening session.
    expect(sessionOf(first + 5 * HOUR, starts)).toBe(2);
  });

  it('longest run of empty sessions', () => {
    expect(longestZeroRun([1, 0, 2, 0, 0, 3])).toBe(2);
    expect(longestZeroRun([1, 1])).toBe(0);
  });

  it('a run with an empty week-1 session reports maxSessionsWithoutNovelty = 1 and fails the gate', () => {
    const sessions = Array.from({ length: 14 }, (_, i) => ({
      index: i + 1,
      start: i,
      actions: 8,
      noticeable: 3,
      noticeableAtOpen: 3,
    }));
    const fake: SimResult = {
      seed: 9,
      days: 7,
      firstPurchaseSec: 0,
      bloomSec: 5 * 86_400,
      bloomSession: 10,
      sessions,
      // Something new in every session but S5.
      novelties: sessions
        .filter((s) => s.index !== 5)
        .map((s) => ({ session: s.index, t: s.start, kind: 'building', ref: `b${String(s.index)}` })),
      milestones: {},
      offlineShare: 0.5,
    };
    const check = evaluate([fake]).find((c) => c.id.startsWith('maxSessionsWithoutNovelty'));
    expect(check).toMatchObject({ actual: '1', ok: false, gate: true });
  });

  it('--check fails on a corridor the content cannot meet (a deliberately bad target)', () => {
    const r = simulate({ seed: 1, days: 2 });
    const bad: Corridor = { ...PACING, bloomDays: { min: 100, max: 200 }, firstPurchaseMaxSec: -1 };
    const failed = evaluate([r], bad)
      .filter((c) => c.gate && !c.ok)
      .map((c) => c.id);
    expect(failed).toContain('bloomDays');
    expect(failed).toContain('firstPurchaseSec');
  });
});
