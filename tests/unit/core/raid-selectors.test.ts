// Raid view selectors (plan M3-06, §0, §0.1 П3–П6): the Sich tab slots and board, the HUD power, the return-window
// count, the relics, the render's slot states and the notification hook. Pure reads; the UI never does economy.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { RAID_TIER_IDS, RAIDS, type RaidTierId } from '../../../src/content/raids.ts';
import { RELIC_DEFS, type RelicId } from '../../../src/content/relics.ts';
import { Big } from '../../../src/core/big.ts';
import {
  raidAlerts,
  raidBoardView,
  raidSceneView,
  raidSlotsView,
  relicsView,
  type RaidSceneView,
  type RaidSlotView,
} from '../../../src/core/raid-selectors.ts';
import { hudView } from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { previewRaid, raidPower, raidTier, type RaidRoll, type RaidSlot } from '../../../src/core/systems/raids.ts';

const T0 = 1_763_400_000_000;
const SEC = 1000;
const MIN = 60 * SEC;
const IDLE: RaidSlot = { kind: 'idle' };

const share = (id: RelicId): number => RELIC_DEFS.find((r) => r.id === id)?.effect.share ?? 0;
const tierOf = raidTier;

function st(o: { infantry?: number; relics?: readonly RelicId[]; slots?: readonly RaidSlot[] } = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    village: { ...s.village, levels: { ...s.village.levels, field: 30, garden: 12, windmill: 8 } },
    army: { infantry: o.infantry ?? 100 },
    relics: o.relics ?? [],
    raids: { ...s.raids, slots: o.slots ?? [IDLE, IDLE, IDLE] },
  };
}

function roll(tier: RaidTierId, startedAt: number, o: Partial<RaidRoll> = {}): RaidRoll {
  return {
    region: 'porohy',
    tier,
    startedAt,
    returnAt: startedAt + tierOf(tier).durationSec * SEC,
    success: true,
    rumor: false,
    loot: { ducats: Big.from(100), glory: Big.from(10), pysanky: 0, relic: null },
    ...o,
  };
}

describe('hudView power (M3-06)', () => {
  it('«Пернач» → army power +5 % in the HUD', () => {
    const plain = hudView(st()).power;
    expect(plain).toBeGreaterThan(0);
    expect(hudView(st({ relics: ['pernach'] })).power / plain).toBeCloseTo(1 + share('pernach'), 12);
  });
});

describe('raidSlotsView (§0.1 П4)', () => {
  const running = roll('h1', T0);

  it('one view per open slot; idle is just its index', () => {
    const v = raidSlotsView(st(), T0);
    expect(v).toEqual(Array.from({ length: RAIDS.slots }, (_, slot) => ({ kind: 'idle', slot })));
  });

  it('running: region, tier, returnAt, the seconds left and the road share — from `now`', () => {
    const s = st({ slots: [{ kind: 'running', raid: running }, IDLE, IDLE] });
    const [a] = raidSlotsView(s, T0 + 10 * MIN);
    expect(a).toEqual({
      kind: 'running',
      slot: 0,
      tier: 'h1',
      region: 'porohy',
      startedAt: T0,
      returnAt: running.returnAt,
      leftSec: 50 * 60,
      progress: 10 / 60,
    });
    // Seconds round up: never «0 s left» while still on the road.
    const [b] = raidSlotsView(s, running.returnAt - 1);
    expect(b?.kind === 'running' ? b.leftSec : -1).toBe(1);
  });

  it('running never shows the result: no success or loot, at runtime and in the type', () => {
    const s = st({ slots: [{ kind: 'running', raid: { ...running, success: false } }, IDLE, IDLE] });
    const [v] = raidSlotsView(s, T0);
    expect(v?.kind).toBe('running');
    for (const key of ['success', 'loot', 'raid', 'ducats', 'glory', 'relic']) expect(v ?? {}).not.toHaveProperty(key);
    expectTypeOf<Extract<RaidSlotView, { kind: 'running' }>>().not.toHaveProperty('success');
    expectTypeOf<Extract<RaidSlotView, { kind: 'running' }>>().not.toHaveProperty('loot');
    if (v?.kind === 'running') {
      // @ts-expect-error — a running slot's view has no result (§0.1 П4): this access must not compile.
      expect(v.success).toBeUndefined();
    }
  });

  it('returned is computed from `now`: a running raid past its returnAt shows as returned before any advance', () => {
    const s = st({ slots: [{ kind: 'running', raid: running }, { kind: 'returned', raid: roll('m5', T0) }, IDLE] });
    expect(raidSlotsView(s, running.returnAt - 1).map((x) => x.kind)).toEqual(['running', 'returned']);
    const v = raidSlotsView(s, running.returnAt);
    expect(v[0]).toEqual({ kind: 'returned', slot: 0, tier: 'h1', region: 'porohy', returnAt: running.returnAt });
    expect(v.filter((x) => x.kind === 'returned')).toHaveLength(2);
    for (const key of ['success', 'loot', 'raid', 'ducats', 'glory', 'relic']) expect(v[0]).not.toHaveProperty(key);
    expectTypeOf<Extract<RaidSlotView, { kind: 'returned' }>>().not.toHaveProperty('loot');
    expectTypeOf<Extract<RaidSlotView, { kind: 'returned' }>>().not.toHaveProperty('success');
  });
});

describe('raidBoardView (§0.1 П3, П5)', () => {
  it('one offer per tier, each exactly the card core would roll (previewRaid)', () => {
    const s = st({ infantry: 60 });
    const v = raidBoardView(s);
    expect(v.offers.map((o) => o.tier)).toEqual([...RAID_TIER_IDS]);
    for (const o of v.offers) {
      const pre = previewRaid(s, o.tier);
      expect(o.region, o.tier).toBe(pre.region);
      expect([o.p, o.power, o.chance, o.relicChance, o.pysankyChance, o.relicSure], o.tier).toEqual([
        pre.p,
        pre.power,
        pre.chance,
        pre.relicChance,
        pre.pysankyChance,
        pre.relicSure,
      ]);
      expect(o.rumor, o.tier).toBe(pre.rumor);
      expect(o.durationSec, o.tier).toBe(tierOf(o.tier).durationSec);
      expect(o.success.ducats.eq(pre.success.ducats) && o.failure.glory.eq(pre.failure.glory), o.tier).toBe(true);
      expect(o.failure.ducats.gt(0), o.tier).toBe(true);
    }
  });

  it('«Пернач» → the board’s power +5 %', () => {
    const plain = raidBoardView(st()).offers[0]?.power ?? 0;
    expect(plain).toBeGreaterThan(0);
    expect((raidBoardView(st({ relics: ['pernach'] })).offers[0]?.power ?? 0) / plain).toBeCloseTo(1.05, 12);
  });

  it('powerToFull: power still missing for 100 %, whole and rounded up; 0 at chance 1', () => {
    const s = st({ infantry: 60 });
    const v = raidBoardView(s);
    for (const o of v.offers) {
      if (o.chance === 1) expect(o.powerToFull, o.tier).toBe(0);
      else {
        expect(o.powerToFull, o.tier).toBe(Math.ceil(o.p - o.power));
        expect(o.powerToFull, o.tier).toBeGreaterThan(0);
      }
    }
    expect(v.offers.find((o) => o.tier === 'm5')?.powerToFull).toBe(0);
    expect(v.offers.find((o) => o.tier === 'h8')?.powerToFull).toBe(Math.ceil(tierOf('h8').power - raidPower(s)));
  });

  it('disabled reason: no free open slot, else too little power, else none; freeSlot is the first idle open slot', () => {
    const weak = raidBoardView(st({ infantry: 60 }));
    expect(weak.freeSlot).toBe(0);
    expect(weak.offers.find((o) => o.tier === 'm5')?.blocked).toBeNull();
    expect(weak.offers.find((o) => o.tier === 'h8')?.blocked).toBe('power');
    const one = raidBoardView(st({ infantry: 60, slots: [{ kind: 'running', raid: roll('m5', T0) }, IDLE, IDLE] }));
    expect(one.freeSlot).toBe(1);
    const busy = { kind: 'returned', raid: roll('m5', T0) } as const;
    const full = raidBoardView(st({ infantry: 60, slots: [busy, busy, IDLE] }));
    expect(full.freeSlot).toBeNull();
    expect(full.offers.every((o) => o.blocked === 'slotBusy')).toBe(true);
  });
});

describe('raidAlerts (§0.1 П6, Q18)', () => {
  const merge = RAIDS.alertMergeSec * SEC;
  const run = (startedAt: number, tier: RaidTierId = 'h1'): RaidSlot => ({
    kind: 'running',
    raid: roll(tier, startedAt),
  });

  it('nothing for idle and returned slots', () => {
    expect(raidAlerts(st())).toEqual([]);
    expect(raidAlerts(st({ slots: [{ kind: 'returned', raid: roll('m5', T0) }, IDLE, IDLE] }))).toEqual([]);
  });

  it('one alert per running raid when far apart, in time order', () => {
    const a = run(T0 + 2 * merge);
    const b = run(T0);
    const s = st({ slots: [a, b, IDLE] });
    const back = T0 + tierOf('h1').durationSec * SEC;
    expect(raidAlerts(s)).toEqual([
      { at: back, count: 1 },
      { at: back + 2 * merge, count: 1 },
    ]);
  });

  it(`returns within alertMergeSec of the first make one alert, at the last of them (all are home by then)`, () => {
    const back = T0 + tierOf('h1').durationSec * SEC;
    expect(raidAlerts(st({ slots: [run(T0), run(T0 + merge), IDLE] }))).toEqual([{ at: back + merge, count: 2 }]);
    expect(raidAlerts(st({ slots: [run(T0), run(T0 + merge + 1), IDLE] }))).toEqual([
      { at: back, count: 1 },
      { at: back + merge + 1, count: 1 },
    ]);
  });
});

describe('relicsView and raidSceneView', () => {
  it('every relic of the collection, found or a silhouette, its bonus as {value} = share × 100', () => {
    const v = relicsView(st({ relics: ['porokhivnytsia'] }));
    expect(v.map((r) => r.id)).toEqual(RELIC_DEFS.map((r) => r.id));
    for (const r of v) {
      const def = RELIC_DEFS.find((d) => d.id === r.id);
      expect(r.found, r.id).toBe(r.id === 'porokhivnytsia');
      expect(r.value, r.id).toBe(Math.round((def?.effect.share ?? 0) * 100));
      expect([r.nameKey, r.textKey, r.factKey]).toEqual([def?.nameKey, def?.textKey, def?.factKey]);
    }
  });

  it('the scene sees only which open slots are away or back — no economy numbers (type)', () => {
    const s = st({
      slots: [{ kind: 'running', raid: roll('h1', T0) }, { kind: 'returned', raid: roll('m5', T0) }, IDLE],
    });
    expect(raidSceneView(s)).toEqual({ slots: ['away', 'back'] });
    expect(raidSceneView(st())).toEqual({ slots: ['idle', 'idle'] });
    expectTypeOf<RaidSceneView>().toEqualTypeOf<{ readonly slots: readonly ('idle' | 'away' | 'back')[] }>();
  });
});
