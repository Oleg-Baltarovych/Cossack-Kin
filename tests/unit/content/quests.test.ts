// Quest content integrity (plan M2-23, SPEC §3.10, rules/content.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FARM, SICH } from '../../../src/content/economy.ts';
import { BUILD_SYSTEMS, CHAIN, CHAIN_STEP_IDS, CHORE_IDS, CHORES, QUEST_CHAIN } from '../../../src/content/quests.ts';
import type { Reward } from '../../../src/content/rewards.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';

const locale = (lang: 'uk' | 'en'): Record<string, unknown> =>
  JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')) as Record<string, unknown>;

/** A key holds a string, or plural forms with `other` (and the `{count}` it is chosen by). */
const isText = (v: unknown): boolean =>
  typeof v === 'string' ||
  (typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>)['other'] === 'string');

const small = (r: Reward): boolean =>
  r.kind === 'pysanky' ? Number.isInteger(r.n) && r.n >= 1 && r.n <= 5 : r.minutes > 0 && r.minutes <= 15;

describe('«Наказ кошового» of land 1 (M2-23)', () => {
  it('ids are unique, in CHAIN_STEP_IDS order, ~25–40 steps', () => {
    expect(QUEST_CHAIN.map((q) => q.id)).toEqual([...CHAIN_STEP_IDS]);
    expect(QUEST_CHAIN.length).toBeGreaterThanOrEqual(25);
    expect(QUEST_CHAIN.length).toBeLessThanOrEqual(40);
  });

  it('goals point at real buildings (not the hidden foundry) and reachable levels; counts are positive', () => {
    const visible = SICH_BUILDINGS.filter((b) => b.unlock.kind !== 'land').map((b) => b.id);
    for (const q of QUEST_CHAIN) {
      const g = q.goal;
      if (g.kind === 'building') {
        expect(FARM_BUILDING_IDS).toContain(g.id);
        expect(g.level > 0 && g.level <= FARM.levelMax, q.id).toBe(true);
      }
      if (g.kind === 'sich') {
        expect(visible, q.id).toContain(g.id);
        expect(g.level > 0 && g.level <= SICH.levelMax, q.id).toBe(true);
      }
      if (g.kind === 'count') expect(g.n, q.id).toBeGreaterThan(0);
    }
  });

  it('a level goal of a building never goes down along the chain (calendar order)', () => {
    const last = new Map<string, number>();
    for (const q of QUEST_CHAIN) {
      if (q.goal.kind === 'count') continue;
      const key = `${q.goal.kind}:${q.goal.id}`;
      expect(q.goal.level, q.id).toBeGreaterThan(last.get(key) ?? 0);
      last.set(key, q.goal.level);
    }
  });

  it('rewards are small (SPEC §3.10: minutes ≤ 15, pysanky 1–5), generated ones too', () => {
    for (const q of QUEST_CHAIN) expect(small(q.reward), q.id).toBe(true);
    expect(small(CHAIN.generated.reward.building)).toBe(true);
    expect(small(CHAIN.generated.reward.sich)).toBe(true);
  });
});

describe('chores (M2-23)', () => {
  it('ids are unique and the pool is in CHORE_IDS order; rewards small', () => {
    expect(CHORES.pool.map((c) => c.id)).toEqual([...CHORE_IDS]);
    for (const c of CHORES.pool) {
      expect(c.goal.n, c.id).toBeGreaterThan(0);
      expect(small(c.reward), c.id).toBe(true);
    }
  });

  it('at least two chores need no missing system (the rotation never runs dry nor repeats)', () => {
    const offered = CHORES.pool.filter((c) => c.requires === undefined || BUILD_SYSTEMS.includes(c.requires));
    expect(offered.length).toBeGreaterThanOrEqual(2);
  });

  it('M3-07: raid chores «Відправ похід» / «Заверши 2 походи» are appended after the frozen M2 eight, need raids', () => {
    expect(CHORE_IDS.slice(0, CHORES.moduloCount)).toEqual([
      'chore.taps50',
      'chore.taps200',
      'chore.tapIncome60',
      'chore.levels10',
      'chore.levels25',
      'chore.purchases10',
      'chore.hire3',
      'chore.hire10',
    ]);
    const raid = CHORES.pool.slice(CHORES.moduloCount);
    expect(raid.map((c) => [c.id, c.goal.stat, c.goal.n, c.requires])).toEqual([
      ['chore.raid1', 'raidsSent', 1, 'raids'],
      ['chore.raids2', 'raidsDone', 2, 'raids'],
      // M4-08: appended after them.
      ['chore.culture1', 'cultureRanks', 1, 'culture'],
      ['chore.hero1', 'heroLevels', 1, 'heroes'],
    ]);
    // The M2 eight need no system: the modulo pick over them never runs dry.
    for (const c of CHORES.pool.slice(0, CHORES.moduloCount)) expect(c.requires, c.id).toBeUndefined();
  });

  it('M3-07: raids are in this build', () => {
    expect(BUILD_SYSTEMS).toContain('raids');
  });

  it('at most 10 rewards a day (SPEC §3.10)', () => {
    expect(CHORES.maxClaimsPerDay).toBe(10);
  });
});

describe('quest texts (M2-23)', () => {
  it('every title key is quest.<id>.title and exists in uk and en; count goals have plural forms', () => {
    const uk = locale('uk');
    const en = locale('en');
    const all = [...QUEST_CHAIN, ...CHORES.pool];
    for (const q of all) {
      expect(q.titleKey).toBe(`quest.${q.id}.title`);
      for (const [lang, table] of [
        ['uk', uk],
        ['en', en],
      ] as const) {
        const v = table[q.titleKey];
        expect(isText(v), `${lang}: ${q.titleKey}`).toBe(true);
        // A count above 1 is never glued to a word by hand: the key is plural.
        if (q.goal.kind === 'count' && q.goal.n > 1) expect(typeof v, `${lang}: ${q.titleKey}`).toBe('object');
      }
    }
    for (const table of [uk, en]) {
      const g = table[CHAIN.generated.titleKey];
      expect(typeof g).toBe('string');
      expect(String(g)).toContain('{building}');
      expect(String(g)).toContain('{level}');
    }
  });
});
