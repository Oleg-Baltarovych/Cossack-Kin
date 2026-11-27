// «Кобза діда» (plan M4-06, Q14, SPEC §3.4 «Реліквії»): the third relic of land 1, −5 % culture price, found only on
// raids of 1 h and longer. A relic a tier cannot find is not «left» for that tier: the shorter raids treat the
// collection as complete for them (their relic chance turns into pysanky, the pity does not count there), so a save
// with «Пернач» and «Порохівниця» held keeps its 30-min pysanky; the pity's sure find waits for a long enough raid.
import { describe, expect, it } from 'vitest';
import { RAID_TIER_IDS, RAID_TIERS, tierRank, type RaidTierId } from '../../../src/content/raids.ts';
import { RELIC_DEFS, pityThreshold, type RelicId } from '../../../src/content/relics.ts';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { CULTURE_NODES } from '../../../src/content/culture.ts';
import { relicHint } from '../../../src/core/raid-selectors.ts';
import { modifierSources, steadyModifiers } from '../../../src/core/modifiers.ts';
import { createRng } from '../../../src/core/rng.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { culturePrice } from '../../../src/core/systems/culture.ts';
import { pickRelic, previewRaid, rollRaid } from '../../../src/core/systems/raids.ts';

const T0 = 1_763_400_000_000;
const KOBZA = RELIC_DEFS.find((r) => r.id === 'kobza') ?? fail('content: kobza');
const OTHERS: readonly RelicId[] = RELIC_DEFS.filter((r) => r.id !== 'kobza').map((r) => r.id);
const SHORT = RAID_TIER_IDS.filter((t) => tierRank(t) < tierRank(KOBZA.minTier));
const LONG = RAID_TIER_IDS.filter((t) => tierRank(t) >= tierRank(KOBZA.minTier));
const tierOf = (id: RaidTierId) => RAID_TIERS.find((t) => t.id === id) ?? fail(`content: ${id}`);

function fail(why: string): never {
  throw new Error(why);
}

function raidState(o: { rngSeed?: number; relics?: readonly RelicId[]; pity?: number } = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    rng: createRng(o.rngSeed ?? 1),
    story: { seen: [...STORY_BEAT_IDS] },
    army: { infantry: 5000 },
    raids: { ...s.raids, pity: o.pity ?? 0 },
    relics: o.relics ?? [],
  };
}

describe('content (Q14)', () => {
  it('appended last (relic ids are saved, append only); −culture price; found from 1 h', () => {
    expect(RELIC_DEFS[RELIC_DEFS.length - 1]?.id).toBe('kobza');
    expect(KOBZA.effect.kind).toBe('cultureCost');
    expect(KOBZA.minTier).toBe('h1');
  });
});

describe('found only on raids of 1 h and longer', () => {
  it('short tiers never draw it: no relic left for them once the others are held — chance 0, no pity', () => {
    for (const tier of SHORT) {
      const pre = previewRaid(raidState({ relics: OTHERS, pity: pityThreshold(OTHERS.length) - 1 }), tier);
      expect(pre.relicChance, tier).toBe(0);
      expect(pre.relicSure, tier).toBe(false);
      expect(pre.pityCounts, tier).toBe(false);
      for (let seed = 1; seed <= 300; seed++) {
        const r = rollRaid(raidState({ rngSeed: seed, relics: OTHERS }), tier, T0);
        expect(r.roll.loot.relic, `${tier} seed ${String(seed)}`).toBeNull();
      }
    }
  });

  it('short tiers: the relic chance turns into pysanky once the relics they can find are held (as before M4-06)', () => {
    const fresh = raidState();
    const done = raidState({ relics: OTHERS });
    for (const tier of SHORT) {
      const a = previewRaid(fresh, tier);
      expect(previewRaid(done, tier).pysankyChance, tier).toBeCloseTo(Math.min(1, a.pysankyChance + a.relicChance), 12);
    }
  });

  it('long tiers find it once the others are held; the pity makes it sure there', () => {
    for (const tier of LONG) {
      expect(previewRaid(raidState({ relics: OTHERS }), tier).relicChance, tier).toBeGreaterThan(0);
      expect(previewRaid(raidState({ relics: OTHERS }), tier).pityCounts, tier).toBe(true);
      const sure = raidState({ relics: OTHERS, pity: pityThreshold(OTHERS.length) - 1 });
      expect(rollRaid(sure, tier, T0).roll.loot.relic, tier).toBe('kobza');
    }
  });

  it('pickRelic: a short tier draws among the others only, a long one among all unfound', () => {
    for (const u of [0, 0.34, 0.67, 0.999]) {
      expect(pickRelic([], SHORT[SHORT.length - 1] ?? fail('no short tier'), u)).not.toBe('kobza');
      expect(pickRelic(OTHERS, 'm30', u)).toBeNull();
      expect(pickRelic(OTHERS, 'h1', u)).toBe('kobza');
    }
    const drawn = new Set([0, 0.34, 0.67, 0.999].map((u) => pickRelic([], 'h8', u)));
    expect(drawn.has('kobza')).toBe(true);
  });

  it('the treasury hint points at the 1-h raids once only «Кобза діда» is left, and «близько» follows its pity', () => {
    expect(relicHint(raidState())?.fromTier).toBe('m30');
    expect(relicHint(raidState({ relics: OTHERS }))?.fromTier).toBe(KOBZA.minTier);
    expect(relicHint(raidState({ relics: OTHERS }))?.near).toBe(false);
    expect(relicHint(raidState({ relics: OTHERS, pity: pityThreshold(OTHERS.length) - 1 }))?.near).toBe(true);
    expect(relicHint(raidState({ relics: [...OTHERS, 'kobza'] }))).toBeNull();
    expect(tierOf(KOBZA.minTier).relicChance).toBeGreaterThan(0);
  });
});

describe('its bonus: −share of every culture price, only once found', () => {
  it('cultureCostMult falls by its share; a culture rank costs that much less', () => {
    const without = steadyModifiers(raidState({ relics: OTHERS })).cultureCostMult;
    const withIt = steadyModifiers(raidState({ relics: [...OTHERS, 'kobza'] })).cultureCostMult;
    expect(withIt).toBeCloseTo(without - KOBZA.effect.share, 12);
    const node = CULTURE_NODES[0] ?? fail('content: no node');
    expect(culturePrice(node, 0, withIt).toNumber()).toBeCloseTo(culturePrice(node, 0, without).toNumber() * withIt, 6);
    const src = modifierSources(raidState({ relics: ['kobza'] })).filter((x) => x.source.kind === 'relic');
    expect(src).toEqual([
      { field: 'cultureCostMult', source: { kind: 'relic', id: 'kobza' }, share: KOBZA.effect.share },
    ]);
  });
});
