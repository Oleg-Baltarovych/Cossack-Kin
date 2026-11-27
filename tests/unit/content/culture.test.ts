// Culture and hero content integrity (plan M4-02, SPEC §3.5 «Модель M4», ADR 013, rules/content.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CULTURE_BRANCH_IDS,
  CULTURE_BRANCHES,
  CULTURE_NODE_IDS,
  CULTURE_NODES,
  type CultureNode,
} from '../../../src/content/culture.ts';
import { OFFLINE } from '../../../src/content/economy.ts';
import { EFFECT_FLOORS, EFFECT_KINDS, EFFECT_TARGETS, type EffectKind } from '../../../src/content/effects.ts';
import { HERO_IDS, HEROES } from '../../../src/content/heroes.ts';
import { RAIDS } from '../../../src/content/raids.ts';
import { RELIC_DEFS } from '../../../src/content/relics.ts';
import { STORY_BEATS } from '../../../src/content/story.ts';

const locale = (lang: 'uk' | 'en'): Record<string, unknown> =>
  JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')) as Record<string, unknown>;

const unique = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;
const nodesOf = (branch: string): CultureNode[] => CULTURE_NODES.filter((n) => n.branch === branch);
const rowOf = (branch: string, row: number): CultureNode[] => nodesOf(branch).filter((n) => n.row === row);

/**
 * Σ of `kind` at full ranks over every node, every hero at levelMax and every relic found (M4-06: «Кобза діда» lowers
 * the culture price too): the most the content can ever add.
 */
const maxSum = (kind: EffectKind): number =>
  CULTURE_NODES.reduce(
    (s, n) => s + n.effects.reduce((a, e) => a + (e.kind === kind ? e.perRank : 0), 0) * n.maxRank,
    0,
  ) +
  HEROES.reduce((s, h) => s + h.effects.reduce((a, e) => a + (e.kind === kind ? e.perRank : 0), 0) * h.levelMax, 0) +
  RELIC_DEFS.reduce((s, r) => s + (r.effect.kind === kind ? r.effect.share : 0), 0);

// Floating sums of shares (0.01 × 25) must not fail a bound they meet exactly.
const EPS = 1e-9;

describe('culture branches (M4-02, ADR 013)', () => {
  it('ids are unique and listed in CULTURE_BRANCH_IDS order', () => {
    expect(CULTURE_BRANCHES.map((b) => b.id)).toEqual([...CULTURE_BRANCH_IDS]);
    expect(unique(CULTURE_BRANCH_IDS)).toBe(true);
  });

  it('«Музика» opens with the tavern; «Звичаї» with the church — the same condition as «Освячення Покрови» (Q4)', () => {
    const music = CULTURE_BRANCHES.find((b) => b.id === 'music');
    const customs = CULTURE_BRANCHES.find((b) => b.id === 'customs');
    const pokrova = STORY_BEATS.find((b) => b.id === 'khortytsia.pokrova');
    expect(music?.unlock).toEqual({ kind: 'building', id: 'tavern', level: 1 });
    expect(customs?.unlock).toEqual(pokrova?.trigger);
  });
});

describe('culture nodes (M4-02, plan §3, SPEC §3.5)', () => {
  it('ids are unique, listed in CULTURE_NODE_IDS order, and named <branch>.<node>', () => {
    expect(CULTURE_NODES.map((n) => n.id)).toEqual([...CULTURE_NODE_IDS]);
    expect(unique(CULTURE_NODE_IDS)).toBe(true);
    for (const n of CULTURE_NODES) expect(n.id.startsWith(`${n.branch}.`), n.id).toBe(true);
  });

  it('each branch: at least 6 nodes (SPEC §3.5 «6–8»), one root in row 1, a single top in its last row', () => {
    for (const branch of CULTURE_BRANCH_IDS) {
      const nodes = nodesOf(branch);
      const last = Math.max(...nodes.map((n) => n.row));
      expect(nodes.length, branch).toBeGreaterThanOrEqual(6);
      expect(
        rowOf(branch, 1).map((n) => n.requires),
        branch,
      ).toEqual([{ kind: 'root' }]);
      expect(rowOf(branch, last).length, branch).toBe(1);
      // No gaps: every row between the root and the top has a node.
      for (let row = 1; row <= last; row += 1)
        expect(rowOf(branch, row).length, `${branch} ${String(row)}`).toBeGreaterThan(0);
    }
  });

  it('prerequisites name only the row above in the same branch (so no cycles); the top needs all of it', () => {
    for (const n of CULTURE_NODES) {
      const r = n.requires;
      if (n.row === 1) {
        expect(r.kind, n.id).toBe('root');
        continue;
      }
      if (r.kind === 'root') throw new Error(`${n.id}: only row 1 may be a root`);
      expect(r.ids.length, n.id).toBeGreaterThan(0);
      for (const id of r.ids) {
        const m = CULTURE_NODES.find((x) => x.id === id);
        expect(m?.branch, `${n.id} → ${id}`).toBe(n.branch);
        expect(m?.row, `${n.id} → ${id}`).toBe(n.row - 1);
      }
      const last = Math.max(...nodesOf(n.branch).map((m) => m.row));
      if (n.row === last) {
        expect(r.kind, n.id).toBe('allOf');
        expect([...r.ids].sort(), n.id).toEqual(
          rowOf(n.branch, n.row - 1)
            .map((m) => m.id)
            .sort(),
        );
      } else expect(r.kind, n.id).toBe('anyOf');
    }
  });

  it('ranks 1–5; costs: base > 0, growth > 1, finite at the last rank, no row cheaper than the row above', () => {
    for (const n of CULTURE_NODES) {
      expect(Number.isInteger(n.maxRank) && n.maxRank >= 1 && n.maxRank <= 5, n.id).toBe(true);
      expect(n.base, n.id).toBeGreaterThan(0);
      expect(n.growth, n.id).toBeGreaterThan(1);
      expect(Number.isFinite(n.base * n.growth ** (n.maxRank - 1)), n.id).toBe(true);
      for (const m of rowOf(n.branch, n.row - 1)) expect(n.base, `${n.id} vs ${m.id}`).toBeGreaterThanOrEqual(m.base);
    }
  });

  it('every effect is positive and of a known kind; a node never names a kind twice', () => {
    for (const n of CULTURE_NODES) {
      expect(n.effects.length, n.id).toBeGreaterThan(0);
      expect(unique(n.effects.map((e) => e.kind)), n.id).toBe(true);
      for (const e of n.effects) {
        expect(EFFECT_KINDS, n.id).toContain(e.kind);
        expect(e.perRank, n.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('heroes (M4-02, plan §3, Q6)', () => {
  it('ids are unique and listed in HERO_IDS order', () => {
    expect(HEROES.map((h) => h.id)).toEqual([...HERO_IDS]);
    expect(unique(HERO_IDS)).toBe(true);
  });

  it('levels 1…levelMax; costs: base > 0, growth > 1, finite at levelMax; effects positive, known, one per kind', () => {
    for (const h of HEROES) {
      expect(Number.isInteger(h.levelMax) && h.levelMax >= 1, h.id).toBe(true);
      expect(h.base, h.id).toBeGreaterThan(0);
      expect(h.growth, h.id).toBeGreaterThan(1);
      expect(Number.isFinite(h.base * h.growth ** h.levelMax), h.id).toBe(true);
      expect(h.effects.length, h.id).toBeGreaterThan(0);
      expect(unique(h.effects.map((e) => e.kind)), h.id).toBe(true);
      for (const e of h.effects) {
        expect(EFFECT_KINDS, h.id).toContain(e.kind);
        expect(e.perRank, h.id).toBeGreaterThan(0);
      }
    }
  });

  it('an unlock reward names a real hero, and no hero arrives through two beats', () => {
    const unlocked = STORY_BEATS.flatMap((b) => (b.reward?.kind === 'unlock' ? [b.reward.hero] : []));
    for (const hero of unlocked) expect(HERO_IDS).toContain(hero);
    expect(unique(unlocked)).toBe(true);
  });
});

describe('effect targets (ADR 013, §9.6)', () => {
  it('no two kinds share a target, so a breakdown line names one effect kind', () => {
    const targets = EFFECT_KINDS.map((k) => {
      const t = EFFECT_TARGETS[k];
      return t.to === 'field' ? t.field : t.to;
    });
    expect(unique(targets)).toBe(true);
  });
});

describe('bounds of the stacked effects (ADR 013)', () => {
  it('raid time: the most every source can cut stays within the save gate, Σ ≤ 1 − RAIDS.minTimeMult', () => {
    expect(RAIDS.minTimeMult).toBeGreaterThan(0);
    expect(RAIDS.minTimeMult).toBeLessThan(1);
    expect(maxSum('raidTime')).toBeGreaterThan(0);
    expect(maxSum('raidTime')).toBeLessThanOrEqual(1 - RAIDS.minTimeMult + EPS);
  });

  it('every reducing kind targets one scalar field, never the food buildings (a building multiplier only grows)', () => {
    for (const kind of Object.keys(EFFECT_FLOORS) as EffectKind[]) expect(EFFECT_TARGETS[kind].to, kind).toBe('field');
  });

  it('every reduction stays above its floor: Σ max share ≤ 1 − floor (the floor never binds)', () => {
    // The relics count too: «Кобза діда» stacks with the Кобзар on the culture price (M4-06).
    expect(RELIC_DEFS.some((r) => r.effect.kind === 'cultureCost')).toBe(true);
    for (const [kind, floor] of Object.entries(EFFECT_FLOORS) as [EffectKind, number][]) {
      expect(floor, kind).toBeGreaterThan(0);
      expect(floor, kind).toBeLessThan(1);
      expect(maxSum(kind), kind).toBeLessThanOrEqual(1 - floor + EPS);
    }
  });

  it('the offline limit with every hour of culture stays within the 24 h ceiling (SPEC §3.8)', () => {
    expect(maxSum('offlineCapSec')).toBeGreaterThan(0);
    expect(OFFLINE.capSec + maxSum('offlineCapSec')).toBeLessThanOrEqual(OFFLINE.ceilingSec);
  });

  it('second-valued effects are whole minutes; shares are whole percents per node rank, half percents per hero level', () => {
    // A node card shows the share of a rank; a hero's total is level × share (1.5 % × an even level is whole).
    const secKinds: readonly EffectKind[] = ['offlineCapSec', 'gloryCapSec'];
    const steps = (x: { effects: CultureNode['effects'] }, perPercent: number): number[] =>
      x.effects.map((e) => (secKinds.includes(e.kind) ? e.perRank / 60 : e.perRank * 100 * perPercent));
    const whole = (v: number): boolean => Number.isInteger(Math.round(v * 1e6) / 1e6);
    for (const n of CULTURE_NODES) for (const v of steps(n, 1)) expect(whole(v), `${n.id} ${String(v)}`).toBe(true);
    for (const h of HEROES) for (const v of steps(h, 2)) expect(whole(v), `${h.id} ${String(v)}`).toBe(true);
  });
});

describe('culture and hero i18n (M4-02, SPEC §11)', () => {
  const keys = [
    ...CULTURE_BRANCHES.flatMap((b) => [b.nameKey, b.unlockKey]),
    ...CULTURE_NODES.flatMap((n) => [n.nameKey, n.textKey, n.factKey]),
    ...HEROES.flatMap((h) => [h.nameKey, h.titleKey, h.phraseKey, h.factKey, h.unlockKey]),
    ...EFFECT_KINDS.map((k) => `effect.${k}`),
  ];

  it('keys follow culture.<branch>.name|unlock, culture.<node>.name|text|fact, hero.<id>.name|title|phrase|fact|unlock', () => {
    for (const b of CULTURE_BRANCHES)
      expect([b.nameKey, b.unlockKey]).toEqual([`culture.${b.id}.name`, `culture.${b.id}.unlock`]);
    for (const n of CULTURE_NODES)
      expect([n.nameKey, n.textKey, n.factKey]).toEqual([
        `culture.${n.id}.name`,
        `culture.${n.id}.text`,
        `culture.${n.id}.fact`,
      ]);
    for (const h of HEROES)
      expect([h.nameKey, h.titleKey, h.phraseKey, h.factKey, h.unlockKey]).toEqual(
        ['name', 'title', 'phrase', 'fact', 'unlock'].map((part) => `hero.${h.id}.${part}`),
      );
  });

  it('every key is a non-empty string in uk and en', () => {
    for (const lang of ['uk', 'en'] as const) {
      const table = locale(lang);
      const missing = keys.filter((k) => typeof table[k] !== 'string' || table[k].trim() === '');
      expect(missing, lang).toEqual([]);
    }
  });

  it('an effect line shows its size through {value}; node texts carry no numbers of their own', () => {
    for (const lang of ['uk', 'en'] as const) {
      const table = locale(lang);
      for (const k of EFFECT_KINDS) expect(String(table[`effect.${k}`]), `${lang} effect.${k}`).toContain('{value}');
      for (const n of CULTURE_NODES) expect(/\d/.test(String(table[n.textKey])), `${lang} ${n.textKey}`).toBe(false);
    }
  });

  it('a hero’s arrival hint takes its threshold from the beat through {n}, not a number of its own', () => {
    for (const lang of ['uk', 'en'] as const) {
      const table = locale(lang);
      for (const h of HEROES) {
        const text = String(table[h.unlockKey]);
        expect(text, `${lang} ${h.unlockKey}`).toContain('{n}');
        expect(/\d/.test(text), `${lang} ${h.unlockKey}`).toBe(false);
      }
    }
  });
});
