// The chest window's model (plan M3-12, §0.1 П4): what comes out of the chest and in what order, when each piece shows
// (content RAID_REVEAL), and one window per action's claims.
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import type { RaidSlot } from '../../../src/core/systems/raids.ts';
import { chestItems, chestQueue, EMPTY_CHESTS, revealTimes, type ChestClaim } from '../../../src/ui/raidReveal.ts';

function claim(o: Partial<ChestClaim> & { pysanky?: number } = {}): ChestClaim {
  return {
    slot: 0,
    tier: 'h1',
    region: 'porohy',
    success: true,
    granted: { ducats: Big.from(500), glory: Big.from(40), pysanky: o.pysanky ?? 0 },
    relic: null,
    ...o,
  };
}
const ev = (c: ChestClaim): GameEvent => ({ type: 'RaidClaimed', ...c });

describe('chestItems', () => {
  it('ducats, glory, pysanky, then the relic, claim by claim; nothing that is 0', () => {
    const items = chestItems([claim({ pysanky: 2, relic: 'pernach' }), claim({ slot: 1, success: false })]);
    expect(items.map((i) => `${String(i.claim)}:${i.kind}`)).toEqual([
      '0:ducats',
      '0:glory',
      '0:pysanky',
      '0:relic',
      '1:ducats',
      '1:glory',
    ]);
    const noGlory = claim({ granted: { ducats: Big.from(5), glory: Big.from(0), pysanky: 0 } });
    expect(chestItems([noGlory]).map((i) => i.kind)).toEqual(['ducats']);
  });
});

describe('revealTimes (RAID_REVEAL)', () => {
  it('the first item as the shake ends, then one per step; the relic is its own beat', () => {
    const t = { shakeMs: 400, itemStepMs: 100, relicMs: 1000 };
    const items = chestItems([claim({ relic: 'pernach' }), claim({ slot: 1 })]);
    expect(revealTimes(items, t)).toEqual([400, 500, 600, 1600, 1700]);
    expect(revealTimes([], t)).toEqual([]);
  });
});

describe('chestQueue', () => {
  it('one window for all claims of one change; other events open none; close by key only', () => {
    let q = chestQueue(EMPTY_CHESTS, { type: 'events', events: [{ type: 'Tapped', amount: Big.from(1) }] });
    expect(q).toBe(EMPTY_CHESTS);
    q = chestQueue(q, {
      type: 'events',
      events: [ev(claim()), { type: 'RelicFound', id: 'pernach' }, ev(claim({ slot: 1, relic: 'pernach' }))],
    });
    expect(q.waiting).toHaveLength(1);
    expect(q.waiting[0]?.claims.map((c) => c.slot)).toEqual([0, 1]);
    expect(q.waiting[0]?.claims[1]).toEqual(claim({ slot: 1, relic: 'pernach' }));
    q = chestQueue(q, { type: 'events', events: [ev(claim())] });
    expect(q.waiting.map((w) => w.key)).toEqual([0, 1]);
    expect(chestQueue(q, { type: 'close', key: 1 })).toBe(q);
    q = chestQueue(q, { type: 'close', key: 0 });
    expect(q.waiting.map((w) => w.key)).toEqual([1]);
    expect(chestQueue(q, { type: 'events', events: [{ type: 'StateReplaced' }] }).waiting).toEqual([]);
  });
});

describe('a real «Забрати все» through the store (onEvents → chestQueue)', () => {
  it('two RaidClaimed and a RelicFound in one batch = one window with both claims', () => {
    const T0 = 1_763_400_000_000;
    const back = (relic: 'pernach' | null): RaidSlot => ({
      kind: 'returned',
      raid: {
        region: 'porohy',
        tier: 'h4',
        startedAt: T0 - 4 * 3600_000,
        returnAt: T0,
        success: true,
        rumor: false,
        loot: { ducats: Big.from(10), glory: Big.from(1), pysanky: 0, relic },
      },
    });
    const s = createInitialState({ seed: 5, now: T0 });
    const store = createStore({ ...s, raids: { ...s.raids, slots: [back('pernach'), back(null), { kind: 'idle' }] } });
    let q = EMPTY_CHESTS;
    const batches: string[][] = [];
    store.onEvents((events) => {
      batches.push(events.map((e) => e.type));
      q = chestQueue(q, { type: 'events', events });
    });
    store.dispatch({ type: 'claimAllRaids' }, T0);
    // One batch (a new game's welcome beat rides in it too).
    expect(batches).toHaveLength(1);
    expect(batches[0]?.filter((t) => t.startsWith('R'))).toEqual(['RaidClaimed', 'RelicFound', 'RaidClaimed']);
    expect(q.waiting).toHaveLength(1);
    expect(q.waiting[0]?.claims.map((c) => [c.slot, c.relic])).toEqual([
      [0, 'pernach'],
      [1, null],
    ]);
  });
});
