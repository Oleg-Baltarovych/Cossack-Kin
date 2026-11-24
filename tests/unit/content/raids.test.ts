// Raid and relic content integrity (plan M3-02, SPEC §3.4/§2.6, ADR 012, rules/content.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENT_BUDGET } from '../../../src/content/agents.ts';
import { ARMY, SICH } from '../../../src/content/economy.ts';
import { RAID_REVEAL } from '../../../src/content/juice.ts';
import {
  BOARD,
  RAID_MAP,
  RAID_TIER_IDS,
  RAID_TIERS,
  RAIDS,
  REGIONS,
  type RaidTierId,
} from '../../../src/content/raids.ts';
import { pityThreshold, RELIC_DEFS, RELIC_IDS, RELICS } from '../../../src/content/relics.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { collectModifiers } from '../../../src/core/modifiers.ts';
import { createInitialState } from '../../../src/core/state.ts';

const locale = (lang: 'uk' | 'en'): Record<string, unknown> =>
  JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')) as Record<string, unknown>;

const tierIndex = (id: RaidTierId): number => RAID_TIER_IDS.indexOf(id);
const unique = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

describe('raid tiers (M3-02, SPEC §3.4)', () => {
  it('ids are unique and listed in RAID_TIER_IDS order', () => {
    expect(RAID_TIERS.map((t) => t.id)).toEqual([...RAID_TIER_IDS]);
    expect(unique(RAID_TIER_IDS)).toBe(true);
  });

  it('duration and P grow strictly with the tier; loot is positive and less than the raid takes', () => {
    for (let i = 1; i < RAID_TIERS.length; i += 1) {
      const [prev, cur] = [RAID_TIERS[i - 1], RAID_TIERS[i]];
      expect(cur?.durationSec ?? 0, cur?.id).toBeGreaterThan(prev?.durationSec ?? Infinity);
      expect(cur?.power ?? 0, cur?.id).toBeGreaterThan(prev?.power ?? Infinity);
    }
    for (const t of RAID_TIERS) {
      for (const sec of [t.lootSec, t.gloryLootSec]) {
        expect(sec, t.id).toBeGreaterThan(0);
        // A raid pays a share of its time in income, never more than staying home for it would.
        expect(sec, t.id).toBeLessThan(t.durationSec);
      }
    }
  });

  it('chances are in [0, 1]; pysanky only from 1 h up (Q6); relics only from the pity tier up', () => {
    const pityFrom = tierIndex(RELICS.pityMinTier);
    expect(pityFrom).toBeGreaterThanOrEqual(0);
    for (const [i, t] of RAID_TIERS.entries()) {
      for (const p of [t.pysankyChance, t.relicChance]) {
        expect(p, t.id).toBeGreaterThanOrEqual(0);
        expect(p, t.id).toBeLessThanOrEqual(1);
      }
      expect(t.pysankyChance > 0, t.id).toBe(t.durationSec >= 3600);
      // The silhouette hint «шукати в походах від 30 хв» (M3-12) is true only if relics and pity share one bound.
      expect(t.relicChance > 0, t.id).toBe(i >= pityFrom);
    }
    expect(Number.isInteger(RAIDS.pysanky.min)).toBe(true);
    expect(RAIDS.pysanky.min).toBeGreaterThanOrEqual(1);
    expect(RAIDS.pysanky.max).toBeGreaterThanOrEqual(RAIDS.pysanky.min);
  });

  it('Q19: the 5-minute tier is a sure success for one Cossack (P ≤ his power, powerMult ≥ 1)', () => {
    const first = RAID_TIERS[0];
    expect(first?.id).toBe('m5');
    const oneCossack = ARMY.infantry.power;
    expect(first?.power ?? Infinity).toBeLessThanOrEqual(oneCossack);
    // So it can start (≥ minPowerShare × P) and its chance clamp(power / P, chanceMin, 1) is 1.
    expect(Math.min(1, oneCossack / (first?.power ?? Infinity))).toBe(1);
  });
});

describe('raid rules (M3-02, SPEC §3.4, plan §0)', () => {
  it('open slots fit the stored ones; shares are proper fractions, so a failure pays less than a success but > 0', () => {
    expect(Number.isInteger(RAIDS.slots) && Number.isInteger(RAIDS.maxSlots)).toBe(true);
    expect(RAIDS.slots).toBeGreaterThan(0);
    expect(RAIDS.slots).toBeLessThanOrEqual(RAIDS.maxSlots);
    for (const share of [RAIDS.minPowerShare, RAIDS.chanceMin, RAIDS.failShare]) {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(1);
    }
  });

  it('merged alerts (Q18): a window shorter than the long tiers, so two night raids are not always one alert', () => {
    expect(RAIDS.alertMergeSec).toBeGreaterThan(0);
    expect(RAIDS.alertMergeSec).toBeLessThan(RAID_TIERS[RAID_TIERS.length - 1]?.durationSec ?? 0);
  });

  it('the squad leaves from the Cossacks on the scene: within the agent budget (R3: at most half of it)', () => {
    expect(Number.isInteger(RAIDS.squadSize)).toBe(true);
    expect(RAIDS.squadSize).toBeGreaterThan(0);
    expect(RAIDS.squadSize).toBeLessThanOrEqual(AGENT_BUDGET.cossack / 2);
  });

  it('every slot claimed at once brings at most a full glory store (claims bypass gloryCapSec, SPEC §3.8)', () => {
    // A claim's glory goes straight in; the store caps passive and offline accrual only. The bound keeps raids from
    // out-earning the store they bypass: maxSlots × the longest gloryLootSec × the strongest lootMult — the real one
    // of collectModifiers (the treasury, every relic) plus the strongest loot rumour (M3-06). The treasury raises both
    // sides, so the bound is checked over its levels.
    const rumour = Math.max(0, ...BOARD.rumors.map((r) => (r.effect.kind === 'loot' ? r.effect.share : 0)));
    const longest = Math.max(...RAID_TIERS.map((t) => t.gloryLootSec));
    const s0 = createInitialState({ seed: 1, now: 0 });
    for (const treasury of [0, 1, 10, 25, SICH.levelMax]) {
      const s = {
        ...s0,
        relics: [...RELIC_IDS],
        village: { ...s0.village, sichLevels: { ...s0.village.sichLevels, treasury } },
      };
      const mods = collectModifiers(s, 0);
      expect(mods.lootMult, String(treasury)).toBeGreaterThan(1);
      expect(RAIDS.maxSlots * longest * (mods.lootMult + rumour), String(treasury)).toBeLessThanOrEqual(
        mods.gloryCapSec,
      );
    }
  });

  it('the treasury adds loot per level (SPEC §3.2.1)', () => {
    const treasury = SICH_BUILDINGS.find((b) => b.id === 'treasury');
    expect(treasury?.effects.lootPerLevel ?? 0).toBeGreaterThan(0);
  });
});

describe('regions and the board (M3-02, SPEC §2.6, Q12)', () => {
  const regions = REGIONS.khortytsia;

  it('land 1 has ~6 regions with unique ids, inside the map with room for a marker', () => {
    expect(regions.length).toBeGreaterThanOrEqual(5);
    expect(unique(regions.map((r) => r.id))).toBe(true);
    for (const r of regions) {
      expect(Number.isInteger(r.x) && Number.isInteger(r.y), r.id).toBe(true);
      expect(r.x, r.id).toBeGreaterThanOrEqual(RAID_MAP.marginPx);
      expect(r.x, r.id).toBeLessThanOrEqual(RAID_MAP.w - RAID_MAP.marginPx);
      expect(r.y, r.id).toBeGreaterThanOrEqual(RAID_MAP.marginPx);
      expect(r.y, r.id).toBeLessThanOrEqual(RAID_MAP.h - RAID_MAP.marginPx);
    }
  });

  it('the board salt is frozen (changing it reshuffles every player’s board)', () => {
    expect(BOARD.salt).toBe(0x7a1d);
  });

  it('rumours: unique ids, positive bonuses, offered only on tiers where the bonus means something', () => {
    expect(BOARD.rumors.length).toBeGreaterThan(0);
    expect(unique(BOARD.rumors.map((r) => r.id))).toBe(true);
    for (const r of BOARD.rumors) expect(r.effect.share, r.id).toBeGreaterThan(0);
    expect(BOARD.rumorTiers.length).toBeGreaterThan(0);
    for (const id of BOARD.rumorTiers) {
      expect(RAID_TIER_IDS).toContain(id);
      // A relic rumour on a tier without relics would promise nothing.
      expect(RAID_TIERS[tierIndex(id)]?.relicChance ?? 0, id).toBeGreaterThan(0);
    }
  });

  it('headroom: under the strongest relic rumour every chance stays ≤ 1, also once relics turn into pysanky', () => {
    const relicMult =
      1 + Math.max(0, ...BOARD.rumors.filter((r) => r.effect.kind === 'relic').map((r) => r.effect.share));
    for (const t of RAID_TIERS) {
      const relic = t.relicChance * relicMult;
      expect(relic, t.id).toBeLessThanOrEqual(1);
      // All relics found: the relic chance becomes a pysanky chance (Q5), on top of the tier's own.
      expect(t.pysankyChance + relic, t.id).toBeLessThanOrEqual(1);
    }
  });
});

describe('relics (M3-02, Q5, Q16)', () => {
  it('ids unique in RELIC_IDS order; each is found in a land that has raid regions; bonuses are small shares', () => {
    expect(RELIC_DEFS.map((r) => r.id)).toEqual([...RELIC_IDS]);
    expect(unique(RELIC_IDS)).toBe(true);
    for (const r of RELIC_DEFS) {
      expect(REGIONS[r.village].length, r.id).toBeGreaterThan(0);
      expect(r.effect.share, r.id).toBeGreaterThan(0);
      expect(r.effect.share, r.id).toBeLessThan(1);
      // `{value}` of its text is share × 100: a whole percent, never «+12.5 %».
      expect(Number.isInteger(Math.round(r.effect.share * 100 * 1e6) / 1e6), r.id).toBe(true);
    }
  });

  it('pityThreshold (Q16, every relic): the list in order, then its last entry for ever', () => {
    expect(RELICS.pityAt.length).toBeGreaterThan(0);
    for (const n of RELICS.pityAt) {
      expect(Number.isFinite(n) && Number.isInteger(n), String(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
    }
    const last = RELICS.pityAt[RELICS.pityAt.length - 1];
    // The first relic by the 4th qualifying success: calendar S2–S5 (SPEC §2.4).
    expect(pityThreshold(0)).toBe(4);
    expect(pityThreshold(1)).toBe(RELICS.pityAt[1]);
    for (const found of [2, 3, 10, 1000]) expect(pityThreshold(found), String(found)).toBe(last);
  });
});

describe('the chest reveal timing (M3-02, plan §0.1 П4)', () => {
  it('shake ≤ 600 ms, an item ≤ 350 ms, the relic its own longer beat; distances whole px', () => {
    expect(RAID_REVEAL.shakeMs).toBeLessThanOrEqual(600);
    expect(RAID_REVEAL.shakeMs / RAID_REVEAL.shakeStepMs).toBeGreaterThanOrEqual(2);
    expect(RAID_REVEAL.itemStepMs).toBeLessThanOrEqual(350);
    expect(RAID_REVEAL.relicMs).toBeGreaterThan(RAID_REVEAL.itemStepMs);
    expect(Number.isInteger(RAID_REVEAL.shakePx)).toBe(true);
    expect(RAID_REVEAL.shakePx).toBeGreaterThan(0);
  });
});

describe('raid i18n (M3-02)', () => {
  const keys = [
    ...RAID_TIERS.flatMap((t) => [t.nameKey, t.textKey]),
    ...REGIONS.khortytsia.flatMap((r) => [r.nameKey, r.textKey]),
    ...BOARD.rumors.flatMap((r) => [r.nameKey, r.textKey]),
    ...RELIC_DEFS.flatMap((r) => [r.nameKey, r.textKey, r.factKey]),
  ];

  it('keys follow raid.tier.<id>, region.<land>.<id>, raid.rumor.<id>, relic.<id>', () => {
    for (const t of RAID_TIERS)
      expect([t.nameKey, t.textKey]).toEqual([`raid.tier.${t.id}.name`, `raid.tier.${t.id}.text`]);
    for (const r of REGIONS.khortytsia)
      expect([r.nameKey, r.textKey]).toEqual([`region.khortytsia.${r.id}.name`, `region.khortytsia.${r.id}.text`]);
    for (const r of BOARD.rumors)
      expect([r.nameKey, r.textKey]).toEqual([`raid.rumor.${r.id}.name`, `raid.rumor.${r.id}.text`]);
    for (const r of RELIC_DEFS)
      expect([r.nameKey, r.textKey, r.factKey]).toEqual([
        `relic.${r.id}.name`,
        `relic.${r.id}.text`,
        `relic.${r.id}.fact`,
      ]);
  });

  it('a relic’s text shows its bonus through {value}, not a number of its own', () => {
    for (const lang of ['uk', 'en'] as const) {
      const table = locale(lang);
      for (const r of RELIC_DEFS) {
        const text = String(table[r.textKey]);
        expect(text, `${lang} ${r.textKey}`).toContain('{value}');
        expect(/\d/.test(text), `${lang} ${r.textKey}`).toBe(false);
      }
    }
  });

  it('every key is a non-empty string in uk and en', () => {
    for (const lang of ['uk', 'en'] as const) {
      const table = locale(lang);
      const missing = keys.filter((k) => typeof table[k] !== 'string' || table[k].trim() === '');
      expect(missing, lang).toEqual([]);
    }
  });
});
