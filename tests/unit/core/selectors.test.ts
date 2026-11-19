import { describe, expect, it } from 'vitest';
import { DEFENCE, FARM, SICH } from '../../../src/content/economy.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { Big } from '../../../src/core/big.ts';
import { bulkCost, cost, prodRate } from '../../../src/core/economy.ts';
import {
  farmRowView,
  hireView,
  hudView,
  sichRowView,
  tierBannerView,
  visibleSichIds,
  visualTiers,
} from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { windLookAt } from '../../../src/core/systems/village-mechanics/wind.ts';
import { applyAction } from '../../../src/core/actions.ts';

const T0 = 1_763_400_000_000;

function makeState(over: {
  ducats?: number;
  glory?: number;
  levels?: Partial<GameState['village']['levels']>;
  sich?: Partial<GameState['village']['sichLevels']>;
  infantry?: number;
}): GameState {
  const s = createInitialState({ seed: 7, now: T0 });
  return {
    ...s,
    currencies: {
      ...s.currencies,
      ducats: Big.from(over.ducats ?? 0),
      glory: Big.from(over.glory ?? 0),
    },
    village: {
      ...s.village,
      levels: { ...s.village.levels, ...over.levels },
      sichLevels: { ...s.village.sichLevels, ...over.sich },
    },
    army: { infantry: over.infantry ?? 0 },
  };
}

const field = KHORTYTSIA.buildings[0];
if (!field) throw new Error('content: no field');

describe('hudView (M1-17)', () => {
  it('a new game: start ducats, no income, no glory, no cossacks', () => {
    const v = hudView(createInitialState({ seed: 7, now: T0 }));
    expect(v.ducats.eq(10)).toBe(true);
    expect(v.ducatsPerSec.isZero()).toBe(true);
    expect(v.gloryPerSec.isZero()).toBe(true);
    expect([v.cossacks, v.maxCossacks, v.kharch, v.defencePct]).toEqual([0, 0, 0, 0]);
  });

  it('income, food, cossack limit, defence bonus and the wind come from the core at the state clock', () => {
    const s = makeState({ levels: { field: 20, garden: 5 }, sich: { walls: 2 }, infantry: 1 });
    const v = hudView(s);
    expect(v.kharch).toBe(20 * 1 + 5 * 2);
    expect(v.maxCossacks).toBe(3);
    expect(v.cossacks).toBe(1);
    expect(v.defencePct).toBeCloseTo(2 * 3 * DEFENCE.incomePerPoint * 100, 9);
    expect(v.wind).toBe(windLookAt(s.seed, s.time.lastSeen).id);
    expect(v.ducatsPerSec.gt(0)).toBe(true);
    expect(v.gloryPerSec.gt(0)).toBe(true);
  });
});

describe('farmRowView (M1-17)', () => {
  it('×1 affordable: price of one level, income now and after', () => {
    const s = makeState({ ducats: 100, levels: { field: 3 } });
    const r = farmRowView(s, 'field', 1);
    expect(r.level).toBe(3);
    expect(r.count).toBe(1);
    expect(r.price.eq(cost(field, 3, KHORTYTSIA.scale))).toBe(true);
    expect(r.blocked).toBeNull();
    expect(r.incomeNow.toNumber()).toBeCloseTo(prodRate(field, 3, 1), 9);
    expect(r.incomeAfter.toNumber()).toBeCloseTo(prodRate(field, 4, 1), 9);
  });

  it('×10 not affordable: the price of all ten, blocked by ducats', () => {
    const r = farmRowView(makeState({ ducats: 50 }), 'field', 10);
    expect(r.count).toBe(10);
    expect(r.price.eq(bulkCost(field, 0, 10, 1))).toBe(true);
    expect(r.blocked).toBe('ducats');
  });

  it('×25 near the cap buys only the rest', () => {
    const r = farmRowView(makeState({ ducats: 1e30, levels: { field: FARM.levelMax - 3 } }), 'field', 25);
    expect(r.count).toBe(3);
    expect(r.blocked).toBeNull();
  });

  it('MAX buys what the ducats cover; with too few it shows one level, blocked', () => {
    const rich = farmRowView(makeState({ ducats: 1000 }), 'field', 'max');
    expect(rich.count).toBeGreaterThan(1);
    expect(rich.price.lte(1000)).toBe(true);
    const poor = farmRowView(makeState({ ducats: 1 }), 'field', 'max');
    expect([poor.count, poor.blocked]).toEqual([1, 'ducats']);
  });

  it('at the level cap: blocked by max, no price to pay', () => {
    const r = farmRowView(makeState({ ducats: 1e30, levels: { field: FARM.levelMax } }), 'field', 1);
    expect(r.blocked).toBe('max');
    expect(r.count).toBe(0);
  });

  it('tier counts the milestones reached; nextMilestone is the next one (null at the top)', () => {
    expect(farmRowView(makeState({ levels: { field: 9 } }), 'field', 1)).toMatchObject({
      tier: 0,
      nextMilestone: { level: 10, mult: 2 },
    });
    expect(farmRowView(makeState({ levels: { field: 25 } }), 'field', 1)).toMatchObject({
      tier: 2,
      nextMilestone: { level: 50, mult: 2 },
    });
    expect(farmRowView(makeState({ levels: { field: 100 } }), 'field', 1)).toMatchObject({
      tier: 5,
      nextMilestone: null,
    });
  });

  it('the windmill income includes the land passive and the current wind', () => {
    const s = makeState({ levels: { windmill: 1 } });
    const mill = KHORTYTSIA.buildings.find((b) => b.id === 'windmill');
    if (!mill) throw new Error('content: no windmill');
    const wind = windLookAt(s.seed, s.time.lastSeen).windmillMult;
    expect(farmRowView(s, 'windmill', 1).incomeNow.toNumber()).toBeCloseTo(
      prodRate(mill, 1, 1, KHORTYTSIA.passive.mult * wind),
      6,
    );
  });
});

describe('sichRowView and visibleSichIds (M1-17)', () => {
  it('the cannon foundry of land 5 is hidden in land 1; the church is listed (locked) with its condition', () => {
    const ids = visibleSichIds(makeState({}));
    expect(ids).not.toContain('cannonry');
    expect(ids).toContain('church');
    const church = sichRowView(makeState({ glory: 1e9 }), 'church', 1);
    expect(church.blocked).toBe('locked');
    expect(church.unlock).toEqual({ kind: 'farmAll', level: 25 });
  });

  it('paid in glory: blocked by glory when short, free to buy when not', () => {
    expect(sichRowView(makeState({ glory: 1 }), 'kurins', 1).blocked).toBe('glory');
    const ok = sichRowView(makeState({ glory: 1e6 }), 'kurins', 1);
    expect(ok.blocked).toBeNull();
    expect(ok.count).toBe(1);
  });

  it('the church unlocks when every farm building is at 25', () => {
    const all25 = Object.fromEntries(KHORTYTSIA.buildings.map((b) => [b.id, 25])) as Partial<
      GameState['village']['levels']
    >;
    expect(sichRowView(makeState({ glory: 1e9, levels: all25 }), 'church', 1).blocked).toBeNull();
  });

  it('a Sich building at its cap is blocked by max', () => {
    expect(sichRowView(makeState({ glory: 1e30, sich: { walls: SICH.levelMax } }), 'walls', 1).blocked).toBe('max');
  });
});

describe('hireView (M1-17)', () => {
  it('no food → blocked by kharch; food and ducats → the price of the next Cossack', () => {
    expect(hireView(makeState({ ducats: 1e9 })).blocked).toBe('kharch');
    const ok = hireView(makeState({ ducats: 1e9, levels: { field: 10 } }));
    expect(ok.blocked).toBeNull();
    expect(ok.price.gt(0)).toBe(true);
    expect(hireView(makeState({ ducats: 1, levels: { field: 10 } })).blocked).toBe('ducats');
  });
});

describe('selectors agree with the reducer (M1-17 review)', () => {
  const states = [
    makeState({ ducats: 10 }),
    makeState({ ducats: 5e4, glory: 140, levels: { field: 32, garden: 26, windmill: 10 }, infantry: 6 }),
    makeState({ ducats: 1e12, glory: 1e9, levels: { field: 99 }, sich: { walls: SICH.levelMax - 1 } }),
  ];
  const modes = [1, 10, 25, 'max'] as const;

  it('a row the UI shows as buyable is accepted, one it shows as blocked is refused', () => {
    for (const s of states) {
      for (const mode of modes) {
        for (const b of KHORTYTSIA.buildings) {
          const v = farmRowView(s, b.id, mode);
          const r = applyAction(s, { type: 'buyBuilding', id: b.id, mode }, s.time.lastSeen);
          const accepted = !r.events.some((e) => e.type === 'ActionRejected');
          expect(accepted, `${b.id} ×${String(mode)}`).toBe(v.blocked === null);
          if (accepted) expect(r.state.village.levels[b.id]).toBe(v.level + v.count);
        }
        for (const id of visibleSichIds(s)) {
          const v = sichRowView(s, id, mode);
          const r = applyAction(s, { type: 'buySich', id, mode }, s.time.lastSeen);
          expect(!r.events.some((e) => e.type === 'ActionRejected'), `${id} ×${String(mode)}`).toBe(v.blocked === null);
        }
      }
      const h = hireView(s);
      const r = applyAction(s, { type: 'hire', n: 1 }, s.time.lastSeen);
      expect(!r.events.some((e) => e.type === 'ActionRejected')).toBe(h.blocked === null);
    }
  });

  it('the land building takes its name from the land (the watchtower in Khortytsia)', () => {
    expect(sichRowView(makeState({}), 'special', 1)).toMatchObject({
      nameKey: KHORTYTSIA.sichSpecial.nameKey,
      descKey: KHORTYTSIA.sichSpecial.descKey,
    });
  });
});

describe('visualTiers (M1-19, SPEC §6.5)', () => {
  it('level 0 = empty plot (0); then I at level 1 and one more per milestone', () => {
    const v = visualTiers(makeState({ levels: { field: 1, garden: 9, apiary: 10, windmill: 25, potter: 100 } }));
    expect([v.field, v.garden, v.apiary, v.windmill, v.potter, v.fair]).toEqual([1, 1, 2, 3, 6, 0]);
  });

  it('Sich: milestones 10/25/50; a locked building shows nothing even with a level (crafted save)', () => {
    const v = visualTiers(makeState({ sich: { kurins: 10, walls: 50, maidan: 1, church: 30 } }));
    expect([v.kurins, v.walls, v.maidan, v.church, v.treasury]).toEqual([2, 4, 1, 0, 0]);
  });
});

describe('tierBannerView (M2-12)', () => {
  it('names the building and its new visual tier: milestone 1 of the farm = tier II; the land names its own Sich building', () => {
    const s = makeState({});
    expect(tierBannerView(s, { type: 'TierReached', zone: 'farm', id: 'field', tier: 1 })).toEqual({
      nameKey: 'building.field.name',
      tier: 2,
    });
    expect(tierBannerView(s, { type: 'TierReached', zone: 'sich', id: 'special', tier: 3 })).toEqual({
      nameKey: KHORTYTSIA.sichSpecial.nameKey,
      tier: 4,
    });
    expect(tierBannerView(s, { type: 'TierReached', zone: 'sich', id: 'walls', tier: 2 })?.nameKey).toBe(
      'sich.walls.name',
    );
  });

  it('an id the land does not have (a crafted event) gives null, not a crash', () => {
    const s = makeState({});
    // A forged event: the type allows only real ids, so the test widens it on purpose.
    const forged = { type: 'TierReached', zone: 'farm', id: 'mine', tier: 1 } as unknown as Extract<
      Parameters<typeof tierBannerView>[1],
      { type: 'TierReached' }
    >;
    expect(tierBannerView(s, forged)).toBeNull();
    expect(tierBannerView(s, { ...forged, zone: 'sich' })).toBeNull();
  });
});
