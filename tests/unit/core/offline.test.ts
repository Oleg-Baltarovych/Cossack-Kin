import { describe, expect, it } from 'vitest';
import { ARMY, OFFLINE } from '../../../src/content/economy.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import { collectModifiers } from '../../../src/core/modifiers.ts';
import { applyOffline, resume, tick } from '../../../src/core/offline.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { gloryRate } from '../../../src/core/systems/army.ts';

const T0 = 1_763_400_000_000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const rel = (a: Big, b: Big): number => (b.isZero() ? (a.isZero() ? 0 : 1) : Math.abs(a.sub(b).div(b).toNumber()));

function midGame(seed = 21): GameState {
  const s = createInitialState({ seed, now: T0 });
  return {
    ...s,
    army: { infantry: 12 },
    village: {
      ...s.village,
      levels: { field: 40, garden: 35, apiary: 30, windmill: 27, potter: 20, smithy: 12, tavern: 8, fair: 2 },
      sichLevels: { ...s.village.sichLevels, walls: 6, kurins: 4, maidan: 3 },
    },
  };
}
/** Ducats and glory `advance` alone would earn from T0 to `to`. */
const advanceGain = (s: GameState, to: number): { ducats: Big; glory: Big } => {
  const a = advance(s, to).state;
  return { ducats: a.currencies.ducats.sub(s.currencies.ducats), glory: a.currencies.glory.sub(s.currencies.glory) };
};

describe('applyOffline (M1-11, SPEC §3.8, §12.1)', () => {
  it('3 h away: the report holds what advance earns in 3 h; currencies wait for claimReturn', () => {
    const s = midGame();
    const r = applyOffline(s, T0 + 3 * HOUR);
    const report = r.state.returnReport;
    expect(report).not.toBeNull();
    if (!report) return;
    const want = advanceGain(s, T0 + 3 * HOUR);
    expect(rel(report.ducats, want.ducats.mul(OFFLINE.mult))).toBeLessThan(1e-9);
    expect(rel(report.glory, want.glory)).toBeLessThan(1e-9);
    expect(report).toMatchObject({ awaySec: 3 * 3600, countedSec: 3 * 3600, capped: false, reason: 'normal' });
    expect(r.state.currencies.ducats.eq(s.currencies.ducats)).toBe(true);
    expect(r.state.time.lastSeen).toBe(T0 + 3 * HOUR);
    expect(r.events).toContainEqual({ type: 'OfflineApplied', report });
  });

  it('20 h away: only the 8 h cap counts, and the report says so', () => {
    const s = midGame();
    const report = applyOffline(s, T0 + 20 * HOUR).state.returnReport;
    expect(report).toMatchObject({ awaySec: 20 * 3600, countedSec: OFFLINE.capSec, capped: true, reason: 'normal' });
    const want = advanceGain(s, T0 + OFFLINE.capSec * 1000);
    if (report) expect(rel(report.ducats, want.ducats)).toBeLessThan(1e-9);
  });

  it('the glory store caps glory at gloryCapSec of income (6 h away, a 4 h store)', () => {
    const s = midGame();
    const report = applyOffline(s, T0 + 6 * HOUR).state.returnReport;
    const rate = gloryRate(s, collectModifiers(s, T0));
    expect(ARMY.gloryCapSec).toBeLessThan(6 * 3600);
    if (report) expect(rel(report.glory, rate.mul(ARMY.gloryCapSec))).toBeLessThan(1e-9);
  });

  it('the clock went back: nothing earned, lastSeen never moves back, reason clockBack', () => {
    const s = midGame();
    const r = applyOffline(s, T0 - 2 * HOUR);
    expect(r.state.time.lastSeen).toBe(s.time.lastSeen);
    expect(r.state.time.maxSeen).toBe(s.time.maxSeen);
    expect(r.state.returnReport).toMatchObject({ countedSec: 0, reason: 'clockBack' });
    expect(r.state.returnReport?.ducats.isZero()).toBe(true);
    expect(r.state.currencies.ducats.eq(s.currencies.ducats)).toBe(true);
  });

  it('a jump forward of 30 days past maxSeen counts exactly the cap (forwardJump)', () => {
    const s = midGame();
    const report = applyOffline(s, T0 + 30 * DAY).state.returnReport;
    expect(report).toMatchObject({ countedSec: OFFLINE.capSec, capped: true, reason: 'forwardJump' });
  });

  it('an unclaimed report is credited before the new one is made', () => {
    const s = midGame();
    const first = applyOffline(s, T0 + 2 * HOUR).state;
    const old = first.returnReport;
    const second = applyOffline(first, T0 + 5 * HOUR);
    if (!old) throw new Error('no first report');
    expect(rel(second.state.currencies.ducats.sub(s.currencies.ducats), old.ducats)).toBeLessThan(1e-9);
    expect(second.state.returnReport?.awaySec).toBe(3 * 3600);
    expect(second.events.map((e) => e.type)).toContain('ReturnClaimed');
  });

  it('away less than returnMinSec: no report, the income goes straight in', () => {
    const s = midGame();
    const r = applyOffline(s, T0 + (OFFLINE.returnMinSec - 1) * 1000);
    expect(r.state.returnReport).toBeNull();
    const want = advanceGain(s, T0 + (OFFLINE.returnMinSec - 1) * 1000);
    expect(rel(r.state.currencies.ducats.sub(s.currencies.ducats), want.ducats)).toBeLessThan(1e-9);
  });

  it('applies the cap before advance: wind events and work stay bounded for any absence', () => {
    const s = midGame();
    const a = applyOffline(s, T0 + 9 * HOUR).state.village.mechanic.stormsSurvived;
    const b = applyOffline(s, T0 + 9 * DAY).state.village.mechanic.stormsSurvived;
    expect(b).toBeLessThanOrEqual(a + 3); // storms counted only within the counted window (both ≤ 8 h)
    expect(applyOffline(s, T0 + 365 * DAY).events.length).toBeLessThan(5);
  });
});

describe('tick (M1-11)', () => {
  it('a gap within onlineGapSec goes through advance; a longer one through applyOffline (caps apply)', () => {
    const s = midGame();
    const near = tick(s, T0 + OFFLINE.onlineGapSec * 1000);
    expect(near.state.returnReport).toBeNull();
    expect(near.state.currencies.ducats.gt(s.currencies.ducats)).toBe(true);
    const far = tick(s, T0 + 6 * HOUR);
    expect(far.state.returnReport).not.toBeNull();
    // A long "online" gap cannot bypass the glory store.
    const rate = gloryRate(s, collectModifiers(s, T0));
    if (far.state.returnReport)
      expect(rel(far.state.returnReport.glory, rate.mul(ARMY.gloryCapSec))).toBeLessThan(1e-9);
  });
});

describe('clock set back and forward again (platform review M1-18, SPEC §3.8)', () => {
  const claim = (s: GameState): GameState => ({
    ...s,
    currencies: {
      ...s.currencies,
      ducats: s.currencies.ducats.add(s.returnReport?.ducats ?? Big.ZERO),
    },
    returnReport: null,
  });

  it('back 8 h, then forward to the real time: nothing earned, no matter how often it is repeated', () => {
    let s = midGame();
    const start = s.currencies.ducats;
    for (let i = 0; i < 5; i += 1) {
      s = claim(applyOffline(s, T0 - 8 * HOUR).state);
      s = claim(resume(s, T0).state);
    }
    expect(s.currencies.ducats.eq(start)).toBe(true);
    expect(s.time.lastSeen).toBe(T0);
  });

  it('time spent with the clock behind earns nothing until the clock passes lastSeen again', () => {
    const s = midGame();
    const behind = resume(s, T0 - HOUR).state;
    const ticked = tick(behind, T0 - HOUR + 10 * 60_000);
    expect(ticked.state.currencies.ducats.eq(s.currencies.ducats)).toBe(true);
    // Real time moves on past lastSeen: from there the income runs as usual.
    const later = tick(claim(ticked.state), T0 + 1000);
    expect(later.state.currencies.ducats.gt(s.currencies.ducats)).toBe(true);
  });
});

describe('resume (M1-18 review): the tick a returning page makes', () => {
  it('a clock set back by more than the online gap reports clockBack (the window says why nothing grew)', () => {
    const s = midGame();
    const r = resume(s, T0 - 10 * 60_000);
    expect(r.state.returnReport?.reason).toBe('clockBack');
    expect(r.state.time.lastSeen).toBe(s.time.lastSeen);
  });

  it('a tiny step back (clock sync jitter) is ignored quietly, like an online tick', () => {
    const s = midGame();
    const r = resume(s, T0 - 2000);
    expect(r.state).toBe(s);
  });

  it('forward it is the same as tick', () => {
    const s = midGame();
    expect(resume(s, T0 + 3 * HOUR).state.returnReport).toEqual(tick(s, T0 + 3 * HOUR).state.returnReport);
  });
});

describe('no level events from time alone (M2-12: an offline return never spams tier banners)', () => {
  it('tick, applyOffline and resume never emit BuildingUpgraded, SichUpgraded or TierReached; levels stay', () => {
    const s = { ...midGame(), currencies: { ...midGame().currencies, ducats: Big.from(1e30), glory: Big.from(1e20) } };
    const level = new Set(['BuildingUpgraded', 'SichUpgraded', 'TierReached']);
    for (const r of [tick(s, T0 + 2000), tick(s, T0 + 3 * HOUR), applyOffline(s, T0 + 9 * HOUR), resume(s, T0 + DAY)]) {
      expect(r.events.filter((e) => level.has(e.type))).toEqual([]);
      expect(r.state.village.levels).toEqual(s.village.levels);
      expect(r.state.village.sichLevels).toEqual(s.village.sichLevels);
    }
  });
});
