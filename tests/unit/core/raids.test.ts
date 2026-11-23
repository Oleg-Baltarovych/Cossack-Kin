// Raid formulas (plan M3-03, SPEC §3.4, §2.6, ADR 012): power, start check, chance, the roll at start, the daily
// board, relics without duplicates and the pity, loot at the steady rates, the card preview.
import { describe, expect, it } from 'vitest';
import { BOARD, RAID_TIER_IDS, RAID_TIERS, RAIDS, REGIONS, type RaidTierId } from '../../../src/content/raids.ts';
import { RELIC_IDS, RELICS, pityThreshold, type RelicId } from '../../../src/content/relics.ts';
import { Big } from '../../../src/core/big.ts';
import { collectModifiers } from '../../../src/core/modifiers.ts';
import { createRng } from '../../../src/core/rng.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { dayAt } from '../../../src/core/systems/quests.ts';
import {
  canStart,
  chance,
  lootOf,
  pickRelic,
  previewRaid,
  raidBoard,
  raidPower,
  rollRaid,
  type RaidFacts,
  type RaidSlot,
} from '../../../src/core/systems/raids.ts';

const T0 = 1_763_400_000_000; // 2025-11-17 17:20 UTC
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function tierOf(id: RaidTierId) {
  const t = RAID_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(id);
  return t;
}

const IDLE: RaidSlot = { kind: 'idle' };

/** A land-1 state with raids (the v4 fields, M3-04) — built directly, like a played game would be. */
function raidState(
  o: {
    seed?: number;
    rngSeed?: number;
    infantry?: number;
    levels?: Partial<GameState['village']['levels']>;
    relics?: readonly RelicId[];
    pity?: number;
    rumorDay?: number;
    maxSeen?: number;
    slots?: readonly RaidSlot[];
  } = {},
): RaidFacts {
  const s = createInitialState({ seed: o.seed ?? 5, now: T0 });
  const maxSeen = o.maxSeen ?? T0;
  return {
    ...s,
    rng: o.rngSeed === undefined ? s.rng : createRng(o.rngSeed),
    time: { ...s.time, lastSeen: maxSeen, maxSeen },
    village: { ...s.village, levels: { ...s.village.levels, ...o.levels } },
    army: { infantry: o.infantry ?? 0 },
    raids: { slots: o.slots ?? [IDLE, IDLE, IDLE], rumorDay: o.rumorDay ?? -1, pity: o.pity ?? 0 },
    relics: o.relics ?? [],
  };
}

const FARM = { field: 30, garden: 12, windmill: 8 } as const;

/** The first day from `from` whose rumour sits on `tier` (seed of `raidState`). */
function rumorDayOf(seed: number, tier: RaidTierId, from: number): number {
  for (let d = from; d < from + 400; d++) {
    if (raidBoard(seed, d).some((o) => o.tier === tier && o.rumor !== null)) return d;
  }
  throw new Error(`no rumour on ${tier}`);
}

describe('raidPower and chance', () => {
  it('power is the army power at the steady rates', () => {
    expect(raidPower(raidState({ infantry: 12 }))).toBe(12);
  });

  it('chance is power / P clamped to [chanceMin, 1]', () => {
    expect(chance(0, 100)).toBe(RAIDS.chanceMin);
    expect(chance(RAIDS.chanceMin * 100, 100)).toBeCloseTo(RAIDS.chanceMin, 12);
    expect(chance(RAIDS.chanceMin * 100 - 1, 100)).toBe(RAIDS.chanceMin);
    expect(chance(60, 100)).toBeCloseTo(0.6, 12);
    expect(chance(100, 100)).toBe(1);
    expect(chance(250, 100)).toBe(1);
  });
});

describe('canStart', () => {
  it(`refuses below ${String(RAIDS.minPowerShare)}·P and accepts at it`, () => {
    const p = tierOf('h1').power;
    const need = RAIDS.minPowerShare * p;
    expect(canStart(raidState({ infantry: need - 1 }), 0, 'h1')).toEqual({ ok: false, reason: 'power' });
    expect(canStart(raidState({ infantry: need }), 0, 'h1')).toEqual({ ok: true });
  });

  it('refuses a busy slot and a slot past the open ones', () => {
    const roll = rollRaid(raidState({ infantry: 5 }), 'm5', T0).roll;
    const busy = raidState({ infantry: 5, slots: [{ kind: 'running', raid: roll }, IDLE, IDLE] });
    expect(canStart(busy, 0, 'm5')).toEqual({ ok: false, reason: 'slotBusy' });
    const back = raidState({ infantry: 5, slots: [IDLE, { kind: 'returned', raid: roll }, IDLE] });
    expect(canStart(back, 1, 'm5')).toEqual({ ok: false, reason: 'slotBusy' });
    for (const slot of [-1, RAIDS.slots, RAIDS.maxSlots, 0.5]) {
      expect(canStart(raidState({ infantry: 5 }), slot, 'm5')).toEqual({ ok: false, reason: 'range' });
    }
    expect(canStart(raidState({ infantry: 5 }), RAIDS.slots - 1, 'm5')).toEqual({ ok: true });
  });
});

describe('lootOf', () => {
  it(`failure is ${String(RAIDS.failShare)} of the success loot and never 0, even with no income`, () => {
    for (const levels of [{}, FARM]) {
      const s = raidState({ infantry: 3, levels });
      for (const id of RAID_TIER_IDS) {
        const l = lootOf(s, id, 1);
        expect(l.failure.ducats.toNumber()).toBeCloseTo(l.success.ducats.toNumber() * RAIDS.failShare, 6);
        expect(l.failure.glory.toNumber()).toBeCloseTo(l.success.glory.toNumber() * RAIDS.failShare, 6);
        expect(l.failure.ducats.gt(0)).toBe(true);
        expect(l.failure.glory.gt(0)).toBe(true);
      }
    }
  });

  it('scales with lootMult and grows with the tier', () => {
    const s = raidState({ infantry: 30, levels: FARM });
    const base = lootOf(s, 'h1', 1).success.ducats.toNumber();
    expect(lootOf(s, 'h1', 1.5).success.ducats.toNumber()).toBeCloseTo(base * 1.5, 6);
    expect(lootOf(s, 'h4', 1).success.ducats.gt(lootOf(s, 'h1', 1).success.ducats)).toBe(true);
  });
});

describe('rollRaid', () => {
  it('golden rolls for seeds 1 and 2 (frozen: the roll order of the RNG is part of every save)', () => {
    const golden = [1, 2].map((seed) => {
      let s = raidState({ seed, rngSeed: seed, infantry: 50, levels: FARM, maxSeen: T0 + 3 * DAY });
      const out: string[] = [];
      for (let i = 0; i < 5; i++) {
        const r = rollRaid(s, 'h1', T0);
        const l = r.roll.loot;
        out.push(
          [r.roll.region, r.roll.success, r.roll.rumor, l.ducats.toString(), l.glory.toString()]
            .concat(String(l.pysanky), String(l.relic), String(r.pity), String(r.rng.state))
            .map(String)
            .join(':'),
        );
        s = { ...s, rng: r.rng, raids: { ...s.raids, pity: r.pity } };
      }
      return out;
    });
    expect(golden).toEqual([
      [
        'kinskiVody:false:true:271836:135:0:null:0:567894474',
        'kinskiVody:true:true:906120:450:0:null:1:1135788947',
        'kinskiVody:true:true:906120:450:0:null:2:1703683420',
        'kinskiVody:true:true:906120:450:0:null:3:2271577893',
        'kinskiVody:true:true:906120:450:0:porokhivnytsia:0:2839472366',
      ],
      [
        'dykePole:false:false:271836:135:0:null:0:567894475',
        'dykePole:false:false:271836:135:0:null:0:1135788948',
        'dykePole:false:false:271836:135:0:null:0:1703683421',
        'dykePole:true:false:906120:450:0:null:1:2271577894',
        'dykePole:false:false:271836:135:0:null:1:2839472367',
      ],
    ]);
  });

  it('the same state gives the same roll', () => {
    const s = raidState({ rngSeed: 99, infantry: 50, levels: FARM });
    expect(rollRaid(s, 'h1', T0)).toEqual(rollRaid(s, 'h1', T0));
  });

  it('stores the start, the return and the duration of the tier', () => {
    const r = rollRaid(raidState({ infantry: 50 }), 'h4', T0 + 5).roll;
    expect(r.tier).toBe('h4');
    expect(r.startedAt).toBe(T0 + 5);
    expect(r.returnAt).toBe(T0 + 5 + tierOf('h4').durationSec * 1000);
  });

  it('does not depend on the wind of the moment', () => {
    const s = raidState({ rngSeed: 3, infantry: 50, levels: FARM });
    const windy: number[] = [];
    const mult = (t: number) => collectModifiers(s, t).buildingMult.windmill;
    for (let t = T0; windy.length === 0 && t < T0 + 7 * DAY; t += 10 * MIN) if (mult(t) !== mult(T0)) windy.push(t);
    const other = windy[0];
    if (other === undefined) throw new Error('no wind change in a week');
    const a = rollRaid(s, 'h1', T0).roll;
    const b = rollRaid(s, 'h1', other).roll;
    expect({ ...b, startedAt: 0, returnAt: 0 }).toEqual({ ...a, startedAt: 0, returnAt: 0 });
  });

  it('a relic never repeats: only unfound relics, none once all are found', () => {
    const found = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const relics of [[], ['pernach'], ['porokhivnytsia']] as const) {
        const r = rollRaid(raidState({ rngSeed: seed, infantry: 900, relics, pity: 0 }), 'h8', T0).roll;
        if (r.loot.relic !== null) {
          expect(relics).not.toContain(r.loot.relic);
          found.add(r.loot.relic);
        }
      }
      const all = rollRaid(raidState({ rngSeed: seed, infantry: 900, relics: RELIC_IDS }), 'h8', T0);
      expect(all.roll.loot.relic).toBeNull();
    }
    expect([...found].sort()).toEqual([...RELIC_IDS].sort());
  });

  it('pickRelic draws among the unfound relics only', () => {
    for (const u of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(pickRelic([], u)).not.toBeNull();
      expect(pickRelic(['pernach'], u)).toBe('porokhivnytsia');
      expect(pickRelic(['porokhivnytsia'], u)).toBe('pernach');
      expect(pickRelic(RELIC_IDS, u)).toBeNull();
    }
  });

  it('all relics found → the relic chance becomes a pysanky chance', () => {
    const s = raidState({ infantry: 900, relics: [] });
    const done = raidState({ infantry: 900, relics: RELIC_IDS });
    for (const id of RAID_TIER_IDS) {
      const a = previewRaid(s, id);
      const b = previewRaid(done, id);
      expect(b.relicChance).toBe(0);
      expect(b.pysankyChance).toBeCloseTo(Math.min(1, a.pysankyChance + a.relicChance), 12);
    }
    let pysanky = 0;
    for (let seed = 1; seed <= 400; seed++) {
      if (rollRaid(raidState({ rngSeed: seed, infantry: 900, relics: RELIC_IDS }), 'm30', T0).roll.loot.pysanky > 0)
        pysanky++;
    }
    // m30 has no pysanky of its own: every pysanky here comes from the relic chance.
    expect(tierOf('m30').pysankyChance).toBe(0);
    expect(pysanky).toBeGreaterThan(0);
  });
});

describe('pity (Q5, Q16)', () => {
  const minTier = RELICS.pityMinTier;
  const sure = (found: number) => pityThreshold(found) - 1;

  it(`the ${String(pityThreshold(0))}th qualifying success always gives a relic (1000 seeds), and resets the counter`, () => {
    const p = tierOf(minTier).power;
    for (const relics of [[], ['pernach']] as const) {
      for (let seed = 1; seed <= 1000; seed++) {
        const s = raidState({ rngSeed: seed, infantry: p, relics, pity: sure(relics.length) });
        const r = rollRaid(s, minTier, T0);
        expect(r.roll.success).toBe(true);
        expect(r.roll.loot.relic).not.toBeNull();
        expect(r.pity).toBe(0);
      }
    }
  });

  it('a qualifying success without a relic moves the counter by one; below the threshold a relic is not sure', () => {
    const p = tierOf(minTier).power;
    let without = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rollRaid(raidState({ rngSeed: seed, infantry: p, pity: sure(0) - 1 }), minTier, T0);
      if (r.roll.loot.relic === null) {
        without++;
        expect(r.pity).toBe(sure(0));
      } else expect(r.pity).toBe(0);
    }
    expect(without).toBeGreaterThan(0);
  });

  it('a failure does not move the counter', () => {
    const p = tierOf(minTier).power;
    let failures = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rollRaid(raidState({ rngSeed: seed, infantry: p / 2, pity: sure(0) }), minTier, T0);
      if (!r.roll.success) {
        failures++;
        expect(r.pity).toBe(sure(0));
        expect(r.roll.loot.relic).toBeNull();
        expect(r.roll.loot.pysanky).toBe(0);
      }
    }
    expect(failures).toBeGreaterThan(0);
  });

  it('with every relic found the counter stays frozen on qualifying successes', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rollRaid(raidState({ rngSeed: seed, infantry: 900, relics: RELIC_IDS, pity: 2 }), 'h8', T0);
      expect(r.roll.success).toBe(true);
      expect(r.pity).toBe(2);
    }
    expect(previewRaid(raidState({ infantry: 900, relics: RELIC_IDS }), 'h8').pityCounts).toBe(false);
    expect(previewRaid(raidState({ infantry: 900 }), 'h8').pityCounts).toBe(true);
    expect(previewRaid(raidState({ infantry: 900 }), 'm5').pityCounts).toBe(false);
  });

  it('tiers below pityMinTier neither count nor guarantee', () => {
    const r = rollRaid(raidState({ rngSeed: 1, infantry: 5, pity: sure(0) }), 'm5', T0);
    expect(r.roll.success).toBe(true);
    expect(r.roll.loot.relic).toBeNull();
    expect(r.pity).toBe(sure(0));
  });

  it('relicSure in the preview is exactly the guaranteed case', () => {
    const p = tierOf(minTier).power;
    expect(previewRaid(raidState({ infantry: p, pity: sure(0) }), minTier).relicSure).toBe(true);
    expect(previewRaid(raidState({ infantry: p, pity: sure(0) - 1 }), minTier).relicSure).toBe(false);
    expect(previewRaid(raidState({ infantry: p, pity: sure(0) }), 'm5').relicSure).toBe(false);
    expect(previewRaid(raidState({ infantry: p, relics: ['pernach'], pity: sure(0) }), minTier).relicSure).toBe(false);
    expect(previewRaid(raidState({ infantry: p, relics: ['pernach'], pity: sure(1) }), minTier).relicSure).toBe(true);
    expect(previewRaid(raidState({ infantry: p, relics: RELIC_IDS, pity: sure(2) }), minTier).relicSure).toBe(false);
  });
});

describe('concurrent raids (relics held in slots)', () => {
  const p = tierOf(RELICS.pityMinTier).power;
  /** The first raid's roll, stored in slot 0 as the startRaid action would; then the second raid's state. */
  function second(rngSeed: number, relics: readonly RelicId[], kind: 'running' | 'returned') {
    const first = raidState({ rngSeed, infantry: p, relics, pity: pityThreshold(relics.length) - 1 });
    const r1 = rollRaid(first, RELICS.pityMinTier, T0);
    const s2: RaidFacts = {
      ...first,
      rng: r1.rng,
      raids: { ...first.raids, pity: r1.pity, slots: [{ kind, raid: r1.roll }, IDLE, IDLE] },
    };
    return { r1, s2 };
  }

  it('a relic rolled into a running or returned slot is never rolled again', () => {
    for (const kind of ['running', 'returned'] as const) {
      for (let seed = 1; seed <= 300; seed++) {
        const { r1, s2 } = second(seed, [], kind);
        expect(r1.roll.loot.relic).not.toBeNull();
        const r2 = rollRaid({ ...s2, raids: { ...s2.raids, pity: pityThreshold(1) - 1 } }, RELICS.pityMinTier, T0);
        expect(r2.roll.loot.relic).not.toBeNull();
        expect(r2.roll.loot.relic).not.toBe(r1.roll.loot.relic);
      }
    }
  });

  it('the pity threshold counts the relics held in slots', () => {
    const { s2 } = second(1, [], 'running');
    expect(previewRaid({ ...s2, raids: { ...s2.raids, pity: pityThreshold(1) - 1 } }, 'm30').relicSure).toBe(true);
    expect(previewRaid({ ...s2, raids: { ...s2.raids, pity: pityThreshold(0) - 1 } }, 'm30').relicSure).toBe(false);
  });

  it('once every relic is found or pending, the relic chance goes to the pysanky', () => {
    const { s2 } = second(1, ['pernach'], 'returned');
    expect(s2.raids.slots[0]?.kind === 'returned' && s2.raids.slots[0].raid.loot.relic).toBe('porokhivnytsia');
    const pre = previewRaid(s2, 'h8');
    expect(pre.relicChance).toBe(0);
    expect(pre.pityCounts).toBe(false);
    expect(pre.pysankyChance).toBeCloseTo(Math.min(1, tierOf('h8').pysankyChance + tierOf('h8').relicChance), 12);
    for (let seed = 1; seed <= 200; seed++) {
      expect(rollRaid({ ...s2, rng: createRng(seed) }, 'h8', T0).roll.loot.relic).toBeNull();
    }
  });
});

describe('raidBoard (SPEC §2.6)', () => {
  it('golden: 14 days of seed 1 (frozen: BOARD.salt, REGION_IDS, RUMOR_IDS, rumorTiers)', () => {
    const days = Array.from({ length: 14 }, (_, i) =>
      raidBoard(1, 20_400 + i)
        .map((o) => `${o.tier}:${o.region}${o.rumor === null ? '' : `+${o.rumor}`}`)
        .join(' '),
    );
    expect(days).toEqual([
      'm5:vovchiVody m30:tavan+ford h1:dykePole h4:samara h8:kinskiVody',
      'm5:porohy m30:samara h1:dykePole+kurgan h4:kinskiVody h8:vovchiVody',
      'm5:dykePole m30:samara h1:vovchiVody h4:tavan h8:porohy+kurgan',
      'm5:samara m30:porohy h1:dykePole+ford h4:vovchiVody h8:kinskiVody',
      'm5:vovchiVody m30:porohy h1:dykePole h4:tavan+chumaky h8:samara',
      'm5:porohy m30:kinskiVody h1:tavan+kurgan h4:vovchiVody h8:samara',
      'm5:tavan m30:kinskiVody h1:porohy h4:samara h8:dykePole+chumaky',
      'm5:vovchiVody m30:dykePole h1:porohy h4:samara h8:tavan+chumaky',
      'm5:kinskiVody m30:tavan h1:dykePole+ford h4:samara h8:porohy',
      'm5:tavan m30:porohy+chumaky h1:vovchiVody h4:dykePole h8:kinskiVody',
      'm5:kinskiVody m30:tavan+kurgan h1:vovchiVody h4:dykePole h8:porohy',
      'm5:samara m30:dykePole h1:kinskiVody h4:vovchiVody h8:porohy+kurgan',
      'm5:tavan m30:porohy h1:kinskiVody+kurgan h4:vovchiVody h8:dykePole',
      'm5:dykePole m30:porohy h1:kinskiVody+kurgan h4:samara h8:vovchiVody',
    ]);
    for (let i = 1; i < days.length; i++) expect(days[i]).not.toBe(days[i - 1]);
  });

  it('one offer per tier in distinct regions, exactly one rumour on a rumour tier', () => {
    const rumorTiers: readonly RaidTierId[] = BOARD.rumorTiers;
    for (const seed of [1, 2, 7, 123_456]) {
      for (let day = 0; day < 60; day++) {
        const board = raidBoard(seed, day);
        expect(board.map((o) => o.tier)).toEqual([...RAID_TIER_IDS]);
        expect(new Set(board.map((o) => o.region)).size).toBe(board.length);
        for (const o of board) expect(REGIONS.khortytsia.map((r) => r.id)).toContain(o.region);
        const rumors = board.filter((o) => o.rumor !== null);
        expect(rumors).toHaveLength(1);
        expect(rumorTiers).toContain(rumors[0]?.tier);
      }
    }
  });

  it('the board of a state is the same for the whole local day and changes the next', () => {
    const tz = 120;
    const start = (dayAt(T0, tz) + 1) * DAY - tz * MIN; // local midnight after T0
    const at = (t: number) => {
      const s = raidState({ maxSeen: t, infantry: 900 });
      const st = { ...s, settings: { ...s.settings, tzOffsetMin: tz } };
      return RAID_TIER_IDS.map((id) => `${previewRaid(st, id).region}:${String(previewRaid(st, id).rumor)}`).join();
    };
    expect(at(start + 1)).toBe(at(start));
    expect(at(start + DAY - 1)).toBe(at(start));
    expect(at(start + DAY)).not.toBe(at(start));
    expect(at(start - 1)).not.toBe(at(start));
  });
});

describe('previewRaid (§0.1 П3: shown = granted)', () => {
  it('equals the loot of rollRaid on success and on failure, every tier, with and without a rumour', () => {
    const seed = 5;
    for (const id of RAID_TIER_IDS) {
      const p = tierOf(id).power;
      const infantry = Math.max(1, Math.ceil(0.7 * p));
      const cases: RaidFacts[] = [raidState({ seed, infantry, levels: FARM })];
      if ((BOARD.rumorTiers as readonly RaidTierId[]).includes(id)) {
        const day = rumorDayOf(seed, id, dayAt(T0, 0));
        const rumorDay = raidState({ seed, infantry, levels: FARM, maxSeen: day * DAY + 60 * MIN });
        cases.push(rumorDay, { ...rumorDay, raids: { ...rumorDay.raids, rumorDay: day } });
      }
      for (const s of cases) {
        const pre = previewRaid(s, id);
        let wins = 0;
        let losses = 0;
        for (let rngSeed = 1; rngSeed <= 200; rngSeed++) {
          const r = rollRaid({ ...s, rng: createRng(rngSeed) }, id, s.time.maxSeen).roll;
          expect(r.region).toBe(pre.region);
          expect(r.rumor).toBe(pre.rumor !== null);
          const shown = r.success ? pre.success : pre.failure;
          expect(r.loot.ducats.toString()).toBe(shown.ducats.toString());
          expect(r.loot.glory.toString()).toBe(shown.glory.toString());
          if (r.success) wins++;
          else losses++;
        }
        expect(wins).toBeGreaterThan(0);
        if (pre.chance < 1) expect(losses).toBeGreaterThan(0);
      }
    }
  });

  it('rollRaid returns the rumour day: the day when it used the rumour, the old one otherwise', () => {
    const seed = 5;
    const day = rumorDayOf(seed, 'h1', dayAt(T0, 0));
    const s = raidState({ seed, infantry: 60, maxSeen: day * DAY + 60 * MIN, rumorDay: day - 3 });
    expect(rollRaid(s, 'h1', s.time.maxSeen).rumorDay).toBe(day);
    const other = RAID_TIER_IDS.find((t) => t !== 'h1') ?? 'm5';
    expect(rollRaid(s, other, s.time.maxSeen).rumorDay).toBe(day - 3);
    const used = { ...s, raids: { ...s.raids, rumorDay: day } };
    expect(rollRaid(used, 'h1', s.time.maxSeen).rumorDay).toBe(day);
    expect(rollRaid(used, 'h1', s.time.maxSeen).roll.rumor).toBe(false);
  });

  it('a rumour holds for the first start of the day only, and shows its bonus', () => {
    const seed = 5;
    const day = rumorDayOf(seed, 'h1', dayAt(T0, 0));
    const offer = raidBoard(seed, day).find((o) => o.tier === 'h1');
    const rumor = BOARD.rumors.find((r) => r.id === offer?.rumor);
    if (!rumor) throw new Error('no rumour');
    const fresh = raidState({ seed, infantry: 60, levels: FARM, maxSeen: day * DAY + 60 * MIN });
    const used = { ...fresh, raids: { ...fresh.raids, rumorDay: day } };
    const on = previewRaid(fresh, 'h1');
    const off = previewRaid(used, 'h1');
    expect(on.rumor).toBe(rumor.id);
    expect(off.rumor).toBeNull();
    if (rumor.effect.kind === 'loot') {
      const ratio = on.success.ducats.toNumber() / off.success.ducats.toNumber();
      expect(ratio).toBeCloseTo(1 + rumor.effect.share, 9);
    } else {
      expect(on.relicChance).toBeCloseTo(Math.min(1, off.relicChance * (1 + rumor.effect.share)), 12);
    }
  });

  it('shows P, the chance, the power and the block reason', () => {
    const p = tierOf('h4').power;
    const low = previewRaid(raidState({ infantry: p / 2 - 1 }), 'h4');
    expect(low.blocked).toBe('power');
    expect(low.p).toBe(p);
    const ok = previewRaid(raidState({ infantry: (p * 3) / 4 }), 'h4');
    expect(ok.blocked).toBeNull();
    expect(ok.power).toBe((p * 3) / 4);
    expect(ok.chance).toBeCloseTo(0.75, 12);
  });

  it('loot values are Big', () => {
    expect(previewRaid(raidState({ infantry: 1 }), 'm5').success.ducats).toBeInstanceOf(Big);
  });
});
