import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARMY, BLOOM, FARM, FOOD, OFFLINE, SICH, TAP } from '../../../src/content/economy.ts';
import { PACING } from '../../../src/content/pacing.ts';
import { SICH_BUILDING_IDS, SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS, KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';

const locale = (lang: 'uk' | 'en'): Record<string, string> =>
  JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')) as Record<string, string>;
const UK = locale('uk');
const EN = locale('en');

/** Every string value anywhere under `value` whose key ends in `Key` (nameKey, descKey, …). */
function i18nKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) i18nKeys(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.endsWith('Key') && typeof v === 'string') out.push(v);
      else i18nKeys(v, out);
    }
  }
  return out;
}

const finitePositive = (n: number): boolean => Number.isFinite(n) && n > 0;

describe('land 1 content (M1-03)', () => {
  it('has the 8 farm/suburb buildings of SPEC §3.2, unique, in order, 5 farm + 3 suburb', () => {
    const ids = KHORTYTSIA.buildings.map((b) => b.id);
    expect(ids).toEqual([...FARM_BUILDING_IDS]);
    expect(new Set(ids).size).toBe(8);
    expect(KHORTYTSIA.buildings.filter((b) => b.zone === 'farm')).toHaveLength(5);
    expect(KHORTYTSIA.buildings.filter((b) => b.zone === 'suburb')).toHaveLength(3);
  });

  it('keeps the §3.2 numbers sane: positive, growth in [1.10, 1.30], each building dearer and richer than the last', () => {
    let prev: (typeof KHORTYTSIA.buildings)[number] | null = null;
    for (const b of KHORTYTSIA.buildings) {
      expect(finitePositive(b.base) && finitePositive(b.baseProd), b.id).toBe(true);
      expect(b.growth, b.id).toBeGreaterThanOrEqual(1.1);
      expect(b.growth, b.id).toBeLessThanOrEqual(1.3);
      if (prev) {
        expect(b.base, b.id).toBeGreaterThan(prev.base);
        expect(b.baseProd, b.id).toBeGreaterThan(prev.baseProd);
      }
      prev = b;
    }
  });

  it('food buildings (field, garden, apiary, windmill) give kharch; the rest do not', () => {
    const food = KHORTYTSIA.buildings.filter((b) => b.kharchPerLevel !== undefined).map((b) => b.id);
    expect(food).toEqual(['field', 'garden', 'apiary', 'windmill']);
    for (const b of KHORTYTSIA.buildings)
      if (b.kharchPerLevel !== undefined) expect(b.kharchPerLevel).toBeGreaterThan(0);
  });

  it('has the 7 Sich buildings of SPEC §3.2.1 with resolvable unlocks', () => {
    expect(SICH_BUILDINGS.map((b) => b.id)).toEqual([...SICH_BUILDING_IDS]);
    for (const b of SICH_BUILDINGS) {
      expect(finitePositive(b.base), b.id).toBe(true);
      expect(b.growth, b.id).toBeGreaterThanOrEqual(1.1);
      expect(b.growth, b.id).toBeLessThanOrEqual(1.3);
      expect(b.effects.defencePerLevel, b.id).toBeGreaterThanOrEqual(0);
      if (b.unlock.kind === 'farmAll') expect(b.unlock.level).toBeLessThanOrEqual(FARM.levelMax);
      if (b.unlock.kind === 'land') expect(b.unlock.land).toBeGreaterThan(KHORTYTSIA.number);
    }
    // Land 1: the cannon foundry is defined but locked (plan Q5); six can be opened.
    const open = SICH_BUILDINGS.filter((b) => b.unlock.kind !== 'land' || b.unlock.land <= KHORTYTSIA.number);
    expect(open).toHaveLength(6);
  });

  it('wind: three levels with positive weights, calm < breeze < storm for the windmill', () => {
    const [calm, breeze, storm] = KHORTYTSIA.wind.levels;
    expect([calm?.id, breeze?.id, storm?.id]).toEqual(['calm', 'breeze', 'storm']);
    for (const l of KHORTYTSIA.wind.levels) expect(l.weight).toBeGreaterThan(0);
    expect((calm?.windmillMult ?? 0) < (breeze?.windmillMult ?? 0)).toBe(true);
    expect((breeze?.windmillMult ?? 0) < (storm?.windmillMult ?? 0)).toBe(true);
    expect(KHORTYTSIA.bloomGoal.windmillLevel).toBeLessThanOrEqual(FARM.levelMax);
  });

  it('milestones ascend and end at the level cap; economy limits are consistent', () => {
    const levels = FARM.milestones.map((m) => m.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(levels.at(-1)).toBe(FARM.levelMax);
    expect(SICH.milestones.at(-1)).toBe(SICH.levelMax);
    expect(BLOOM.farmLevel).toBeLessThanOrEqual(FARM.levelMax);
    expect(BLOOM.sichLevel).toBeLessThanOrEqual(SICH.levelMax);
    expect(OFFLINE.capSec).toBeLessThanOrEqual(OFFLINE.ceilingSec);
    expect(OFFLINE.onlineGapSec).toBeLessThan(OFFLINE.returnMinSec);
    expect(TAP.maxPerSec).toBeGreaterThan(0);
    expect(FOOD.kharchPerCossack).toBeGreaterThan(0);
    expect(ARMY.hireGrowth).toBeGreaterThan(1);
    expect(PACING.bloomDays.min).toBeLessThan(PACING.bloomDays.max);
  });

  it('every i18n key the content uses exists in uk and en, and the two locales have the same keys', () => {
    const keys = i18nKeys([KHORTYTSIA, SICH_BUILDINGS]);
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) {
      expect(UK[key], `uk: ${key}`).toBeTruthy();
      expect(EN[key], `en: ${key}`).toBeTruthy();
    }
    expect(Object.keys(UK).sort()).toEqual(Object.keys(EN).sort());
  });

  it('no Ukrainian word mixes Cyrillic and Latin letters (a Latin "e"/"i"/"o" hidden in a word)', () => {
    for (const [key, text] of Object.entries(UK)) {
      for (const word of text.split(/[^\p{L}]+/u)) {
        const mixed = /\p{Script=Cyrillic}/u.test(word) && /\p{Script=Latin}/u.test(word);
        expect(mixed, `${key}: "${word}"`).toBe(false);
      }
    }
  });
});
