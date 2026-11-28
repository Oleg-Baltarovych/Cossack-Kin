// Raid view selectors (plan M3-06, §0, §0.1 П3–П6): the Sich tab slots and board, the HUD power, the return-window
// count, the relics, the render's slot states and the notification hook. Pure reads; the UI never does economy.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { RAID_TIER_IDS, RAIDS, type RaidTierId } from '../../../src/content/raids.ts';
import { pityThreshold, RELIC_DEFS, RELICS, relicOnTier, type RelicId } from '../../../src/content/relics.ts';
import { Big } from '../../../src/core/big.ts';
import {
  raidAlerts,
  raidBoardView,
  raidClaimable,
  raidGuide,
  raidSuggested,
  raidSceneView,
  raidSlotsView,
  relicHint,
  relicsView,
  type RaidSceneView,
  type RaidSlotView,
} from '../../../src/core/raid-selectors.ts';
import { wholePercent } from '../../../src/core/percent.ts';
import { QUEST_CHAIN } from '../../../src/content/quests.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { createRng } from '../../../src/core/rng.ts';
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

  it('one view per open slot; idle is its index and whether the army can start any raid at all', () => {
    const v = raidSlotsView(st(), T0);
    expect(v).toEqual(Array.from({ length: RAIDS.slots }, (_, slot) => ({ kind: 'idle', slot, blocked: null })));
    // No Cossack: not even the lowest tier's minPowerShare × P — the slot card's «Обрати похід» says why (M3-09).
    expect(raidSlotsView(st({ infantry: 0 }), T0).map((x) => (x.kind === 'idle' ? x.blocked : x.kind))).toEqual(
      Array.from({ length: RAIDS.slots }, () => 'power'),
    );
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
    expect(v[0]).toEqual({
      kind: 'returned',
      slot: 0,
      tier: 'h1',
      region: 'porohy',
      returnAt: running.returnAt,
      again: null,
    });
    expect(v.filter((x) => x.kind === 'returned')).toHaveLength(2);
    for (const key of ['success', 'loot', 'raid', 'ducats', 'glory', 'relic']) expect(v[0]).not.toHaveProperty(key);
    expectTypeOf<Extract<RaidSlotView, { kind: 'returned' }>>().not.toHaveProperty('loot');
    expectTypeOf<Extract<RaidSlotView, { kind: 'returned' }>>().not.toHaveProperty('success');
  });
});

describe('«Ще раз» on a returned slot (§0.1 П12, M3-09)', () => {
  it('again: null while the army may start the same tier, else «power» (the claim frees the slot itself)', () => {
    const back = (tier: RaidTierId): RaidSlot => ({ kind: 'returned', raid: roll(tier, T0) });
    // 60 power: m5…h1 start (≥ ½ P), h4 (P 450) and h8 do not.
    const v = raidSlotsView(st({ infantry: 60, slots: [back('h1'), back('h8'), IDLE] }), T0);
    expect(v.map((x) => (x.kind === 'returned' ? x.again : x.kind))).toEqual([null, 'power']);
    expect(previewRaid(st({ infantry: 60 }), 'h8').blocked).toBe('power');
  });

  it('a running raid past its returnAt gets the same answer as a stored returned one', () => {
    const s = st({ infantry: 60, slots: [{ kind: 'running', raid: roll('h8', T0) }, IDLE, IDLE] });
    const [v] = raidSlotsView(s, T0 + tierOf('h8').durationSec * SEC);
    expect(v?.kind === 'returned' ? v.again : v?.kind).toBe('power');
  });
});

describe('raidClaimable — the red dot on «Січ» (§0.1 П1, M3-09)', () => {
  const running = roll('m30', T0);

  it('idle slots never count: an empty slot does not «burn»', () => {
    expect(raidClaimable(st(), T0)).toBe(false);
    expect(raidClaimable(st({ infantry: 0 }), T0)).toBe(false);
  });

  it('a raid on the road does not count until its returnAt (from the live `now`), then it does', () => {
    const s = st({ slots: [{ kind: 'running', raid: running }, IDLE, IDLE] });
    expect(raidClaimable(s, running.returnAt - 1)).toBe(false);
    expect(raidClaimable(s, running.returnAt)).toBe(true);
  });

  it('a returned raid counts at any `now`', () => {
    expect(raidClaimable(st({ slots: [IDLE, { kind: 'returned', raid: running }, IDLE] }), T0)).toBe(true);
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

  it('each silhouette says where to look for that relic: the shortest tier its minTier allows (M4-06 «Кобза» → 1 h)', () => {
    const v = relicsView(st());
    for (const r of v) {
      const def = RELIC_DEFS.find((d) => d.id === r.id);
      if (!def) throw new Error(`no def ${r.id}`);
      // No shorter tier could find it: below its minTier, or a tier with neither a relic chance nor the pity.
      expect(relicOnTier(def, r.fromTier), r.id).toBe(true);
      for (const t of RAID_TIER_IDS.slice(0, RAID_TIER_IDS.indexOf(r.fromTier)))
        expect(relicOnTier(def, t) && tierOf(t).relicChance > 0, `${r.id} ${t}`).toBe(false);
    }
    expect(v.find((r) => r.id === 'kobza')?.fromTier).toBe('h1');
  });

  it('relicHint (M3-12, §0.1 П5): where to look — the shortest tier that can find one — and the pity, as the card says', () => {
    const first = RAID_TIER_IDS.find((t) => tierOf(t).relicChance > 0);
    expect(first).toBe('m30');
    expect(relicHint(st())).toEqual({ fromTier: first, near: false });
    // One qualifying success short of the pity: the next one is sure — the same fact as the card's relicSure.
    const near = (s: GameState, pity: number): GameState => ({ ...s, raids: { ...s.raids, pity } });
    const sure = near(st(), pityThreshold(0) - 1);
    expect(relicHint(sure)).toEqual({ fromTier: first, near: true });
    expect(raidBoardView(sure).offers.find((o) => o.tier === RELICS.pityMinTier)?.relicSure).toBe(true);
    // The last unfound relic already rides home in a slot: nothing left to be sure of, the silhouette still has its hint.
    const riding = st({
      relics: ['pernach'],
      slots: [
        { kind: 'running', raid: roll('h1', T0, { loot: { ...roll('h1', T0).loot, relic: 'porokhivnytsia' } }) },
        IDLE,
        IDLE,
      ],
    });
    // «Порохівниця» on its way home is not looked for: only «Кобза діда» is left, found from 1 h (M4-06).
    expect(relicHint(near(riding, 0))).toEqual({ fromTier: 'h1', near: false });
    expect(relicHint(near({ ...riding, relics: ['pernach', 'kobza'] }, 0))).toEqual({ fromTier: first, near: false });
    // Every relic found: no hint at all.
    expect(relicHint(st({ relics: RELIC_DEFS.map((r) => r.id) }))).toBeNull();
  });

  it('accepted leak (M3-12 decision, §3.4): «реліквія близько» follows the real pity, raids on the road included', () => {
    // A sure success (chance 1) one step short of the pity's threshold: its start already counts it (the roll is made
    // at the start), so the hint — and the card's relicSure — say «близько» while that raid is still away. That
    // tells the player it succeeded without a relic; shown = rolled wins over hiding it (never a failure, no gain).
    let checked = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const base = st({ infantry: 2000 });
      const s: GameState = {
        ...base,
        rng: createRng(seed),
        raids: { ...base.raids, pity: pityThreshold(0) - 2 },
      };
      expect(relicHint(s)?.near).toBe(false);
      const r = applyAction(s, { type: 'startRaid', slot: 0, tier: RELICS.pityMinTier }, T0);
      const slot = r.state.raids.slots[0];
      if (slot?.kind !== 'running' || slot.raid.loot.relic !== null) continue;
      expect(slot.raid.success).toBe(true);
      expect(relicHint(r.state)?.near).toBe(true);
      expect(raidBoardView(r.state).offers.find((o) => o.tier === RELICS.pityMinTier)?.relicSure).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
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

describe('raidGuide: the onboarding marker (plan M3-11, §0.1 П9)', () => {
  const at = (id: string, base = 0, sent = 0): GameState => {
    const s = st();
    const index = QUEST_CHAIN.findIndex((q) => q.id === id);
    if (index < 0) throw new Error(id);
    return {
      ...s,
      quests: { ...s.quests, chain: { kind: 'listed', index, base } },
      stats: { ...s.stats, raidsSent: sent },
    };
  };

  it('while the chain asks for the first raid, the map leads to the shortest tier', () => {
    expect(raidGuide(at('khortytsia.raid1'))).toBe(RAID_TIER_IDS[0]);
  });

  it('nothing once that step is done (a raid sent), on any other step, or past the chain', () => {
    expect(raidGuide(at('khortytsia.raid1', 0, 1))).toBeNull();
    expect(raidGuide(at('khortytsia.hire1'))).toBeNull();
    expect(raidGuide(at('khortytsia.field10'))).toBeNull();
    const s = st();
    expect(raidGuide({ ...s, quests: { ...s.quests, chain: { kind: 'done' } } })).toBeNull();
  });
});

describe('raidBoardView: whole percents and the power to set off (M3-11 review)', () => {
  it('chancePct / relicPct / pysankyPct are whole and never above the share × 100 (a shown chance never overstates)', () => {
    for (const infantry of [1, 7, 33, 60, 123, 450, 999]) {
      for (const o of raidBoardView(st({ infantry })).offers) {
        for (const [pct, share] of [
          [o.chancePct, o.chance],
          [o.relicPct, o.relicChance],
          [o.pysankyPct, o.pysankyChance],
        ] as const) {
          expect(Number.isInteger(pct), o.tier).toBe(true);
          expect(pct, o.tier).toBeLessThanOrEqual(share * 100 + 1e-9);
          expect(pct, o.tier).toBeGreaterThan(share * 100 - 1);
        }
      }
    }
    // A share that is a whole percent in decimal but not in binary still reads whole: 0.29 × 100 = 28.999…
    expect(wholePercent(0.29)).toBe(29);
    expect(wholePercent(1)).toBe(100);
    expect(wholePercent(0.999)).toBe(99);
  });

  it('powerToStart: the power still missing to set off (minPowerShare × P), whole and rounded up; 0 when it can go', () => {
    const s = st({ infantry: 60 });
    for (const o of raidBoardView(s).offers) {
      const need = Math.ceil(RAIDS.minPowerShare * o.p - o.power);
      expect(o.powerToStart, o.tier).toBe(o.blocked === 'power' ? need : 0);
      if (o.blocked === 'power') expect(o.powerToStart, o.tier).toBeGreaterThan(0);
    }
    expect(raidBoardView(s).offers.find((o) => o.tier === 'h8')?.powerToStart).toBe(
      Math.ceil(RAIDS.minPowerShare * tierOf('h8').power - raidPower(s)),
    );
  });
});

describe('raidSuggested: the offer the map opens on (M3-11 review)', () => {
  const chainAt = (s: GameState, id: string): GameState => {
    const index = QUEST_CHAIN.findIndex((q) => q.id === id);
    return { ...s, quests: { ...s.quests, chain: { kind: 'listed', index, base: s.stats.raidsSent } } };
  };

  it('the onboarding tier first', () => {
    expect(raidSuggested(chainAt(st({ infantry: 900 }), 'khortytsia.raid1'))).toBe(RAID_TIER_IDS[0]);
  });

  it('else the rumour offer when the army can take it, else the longest tier it can take', () => {
    const strong = st({ infantry: 2000 });
    const rumor = raidBoardView(strong).offers.find((o) => o.rumor !== null);
    expect(rumor).toBeDefined();
    expect(raidSuggested(strong)).toBe(rumor?.tier);
    // Weak: the rumour offer (≥ 30 min) is blocked by power → the longest tier that is not.
    const weak = st({ infantry: 5 });
    const open = raidBoardView(weak).offers.filter((o) => o.blocked === null);
    expect(raidBoardView(weak).offers.find((o) => o.rumor !== null)?.blocked).toBe('power');
    expect(raidSuggested(weak)).toBe(open[open.length - 1]?.tier);
  });

  it('nothing free (every squad out): the first tier', () => {
    const busy = { kind: 'running', raid: roll('h8', T0) } as const;
    expect(raidSuggested(st({ infantry: 2000, slots: [busy, busy, IDLE] }))).toBe(RAID_TIER_IDS[0]);
  });
});
