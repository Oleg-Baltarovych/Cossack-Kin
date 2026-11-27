// Story content integrity (plan M2-22, SPEC §2.5, rules/content.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FARM, SICH } from '../../../src/content/economy.ts';
import { HERO_IDS } from '../../../src/content/heroes.ts';
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

  it('land 1: the four Q7 beats, then the M4 heroes (tavern 10, raids won); bloom (resettling) waits for M5', () => {
    expect(STORY_BEATS.map((b) => [b.id, b.trigger])).toEqual([
      ['khortytsia.shore', { kind: 'start' }],
      ['khortytsia.messenger', { kind: 'hired', count: 3 }],
      ['khortytsia.council', { kind: 'sich', id: 'maidan', level: 10 }],
      ['khortytsia.pokrova', { kind: 'sich', id: 'church', level: 1 }],
      // M4-08 (Q4, Q5): appended — ids are only ever appended, like chores.
      ['khortytsia.kobzar', { kind: 'building', id: 'tavern', level: 10 }],
      // The count is a balance number (M4-08: 15), checked to be a positive integer below.
      ['khortytsia.kharakternyk', { kind: 'raidsWon', count: expect.any(Number) as number }],
    ]);
  });

  it('every hero comes with exactly one beat (M4-08: the Кобзар and the Характерник too)', () => {
    const brought = STORY_BEATS.flatMap((b) => (b.reward?.kind === 'unlock' ? [b.reward.hero] : []));
    expect([...brought].sort()).toEqual([...HERO_IDS].sort());
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
      if (t.kind === 'raidsWon') expect(Number.isInteger(t.count) && t.count > 0, b.id).toBe(true);
      const r = b.reward;
      if (r?.kind === 'incomeMinutes' || r?.kind === 'gloryMinutes') expect(r.minutes, b.id).toBeGreaterThan(0);
      if (r?.kind === 'pysanky') expect(Number.isInteger(r.n) && r.n > 0, b.id).toBe(true);
    }
  });

  it('a hero beat is due only right after an action (M4-05): a building, a Sich level, hires or raids won', () => {
    // A hero raises rates from his arrival on; a beat that time could make due (storms, bloom) would bring him inside
    // an `advance` gap, at its end in one 8 h call but early in 0.1 s ticks — online ≠ offline. An action checks the
    // story at once, so an action-met trigger never stays due across a gap. `raidsWon` is raised by the claim (M4-08),
    // never by the return, so it is an action's too.
    const ACTION_MET = new Set(['building', 'sich', 'hired', 'raidsWon']);
    const heroBeats = STORY_BEATS.filter((b) => b.reward?.kind === 'unlock');
    expect(heroBeats.length).toBeGreaterThan(0);
    for (const b of heroBeats) expect(ACTION_MET.has(b.trigger.kind), b.id).toBe(true);
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
