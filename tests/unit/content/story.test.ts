// Story content integrity (plan M2-22, SPEC §2.5, rules/content.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FARM, SICH } from '../../../src/content/economy.ts';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';
import { STORY_BEAT_IDS, STORY_BEATS } from '../../../src/content/story.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';

const locale = (lang: 'uk' | 'en'): Record<string, unknown> =>
  JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')) as Record<string, unknown>;

describe('story beats of land 1 (M2-22, Q7)', () => {
  it('ids are unique, listed in STORY_BEAT_IDS order, and named <land>.<beat>', () => {
    expect(STORY_BEATS.map((b) => b.id)).toEqual([...STORY_BEAT_IDS]);
    for (const b of STORY_BEATS) expect(b.id.startsWith(`${b.land}.`), b.id).toBe(true);
  });

  it('M2 has the four Q7 beats: start, 3 hired, maidan 10, the church; bloom (resettling) waits for M5', () => {
    expect(STORY_BEATS.map((b) => b.trigger)).toEqual([
      { kind: 'start' },
      { kind: 'hired', count: 3 },
      { kind: 'sich', id: 'maidan', level: 10 },
      { kind: 'sich', id: 'church', level: 1 },
    ]);
  });

  it('triggers point at real buildings and reachable levels; rewards are positive', () => {
    for (const b of STORY_BEATS) {
      const t = b.trigger;
      if (t.kind === 'building') {
        expect(FARM_BUILDING_IDS).toContain(t.id);
        expect(t.level).toBeGreaterThan(0);
        expect(t.level).toBeLessThanOrEqual(FARM.levelMax);
      }
      if (t.kind === 'sich') {
        expect(SICH_BUILDING_IDS).toContain(t.id);
        expect(t.level).toBeGreaterThan(0);
        expect(t.level).toBeLessThanOrEqual(SICH.levelMax);
      }
      const r = b.reward;
      if (r && r.kind !== 'pysanky') expect(r.minutes, b.id).toBeGreaterThan(0);
      if (r?.kind === 'pysanky') expect(Number.isInteger(r.n) && r.n > 0, b.id).toBe(true);
    }
  });

  it('title and text keys are story.<land>.<beat>.title|text and exist in uk and en', () => {
    const uk = locale('uk');
    const en = locale('en');
    for (const b of STORY_BEATS) {
      expect(b.titleKey).toBe(`story.${b.id}.title`);
      expect(b.textKey).toBe(`story.${b.id}.text`);
      for (const key of [b.titleKey, b.textKey]) {
        expect(typeof uk[key], `uk: ${key}`).toBe('string');
        expect(typeof en[key], `en: ${key}`).toBe('string');
      }
    }
  });
});
