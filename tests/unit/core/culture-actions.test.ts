// Culture and hero actions (plan M4-05, SPEC §3.5 «Модель M4», ADR 013): `buyCulture` (one rank), `levelHero` (the
// shared ×1/×10/×25/Max picker), their events and refusals, and the culture/hero sources of `modifierSources` — only
// open branches and heroes that came count, a crafted save gains nothing. Every hero has his beat (M4-08), so every
// effect kind has its case (M4-06).
import { describe, expect, it } from 'vitest';
import { CULTURE_BRANCHES, CULTURE_NODES, type CultureNode, type CultureNodeId } from '../../../src/content/culture.ts';
import {
  EFFECT_FLOORS,
  EFFECT_KINDS,
  EFFECT_TARGETS,
  type EffectKind,
  type RankedEffect,
} from '../../../src/content/effects.ts';
import { HEROES, type HeroDef, type HeroId } from '../../../src/content/heroes.ts';
import { STORY_BEAT_IDS, STORY_BEATS } from '../../../src/content/story.ts';
import { FARM_BUILDING_IDS, KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import { bulkCost } from '../../../src/core/economy.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import {
  collectModifiers,
  modifierSources,
  steadyModifiers,
  type Modifiers,
  type ScalarField,
} from '../../../src/core/modifiers.ts';
import { applyOffline } from '../../../src/core/offline.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { culturePrice, heroPrice } from '../../../src/core/systems/culture.ts';

const T0 = 1_763_400_000_000;
const HOUR = 3600 * 1000;
const LOTS = 1e15;

const nodeOf = (id: CultureNodeId): CultureNode => {
  const n = CULTURE_NODES.find((x) => x.id === id);
  if (!n) throw new Error(`content: ${id}`);
  return n;
};
const heroOf = (id: HeroId): HeroDef => {
  const h = HEROES.find((x) => x.id === id);
  if (!h) throw new Error(`content: ${id}`);
  return h;
};
/** Heroes some story beat brings (since M4-08: all of them). */
const ARRIVING = new Set(STORY_BEATS.flatMap((b) => (b.reward?.kind === 'unlock' ? [b.reward.hero] : [])));

/**
 * A late game: every beat seen, both branches open (the farm at 25 unlocks the church, the tavern stands), the heroes
 * that can come here at level 1, `glory` in the purse. `culture`/`heroes` override.
 */
function late({
  glory = LOTS,
  culture = {},
  heroes,
  farm = 25,
  church = 1,
}: {
  glory?: number;
  culture?: GameState['culture'];
  heroes?: GameState['heroes'];
  farm?: number;
  church?: number;
} = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  const levels = { ...s.village.levels };
  for (const id of FARM_BUILDING_IDS) levels[id] = farm;
  return {
    ...s,
    story: { seen: [...STORY_BEAT_IDS] },
    currencies: { ...s.currencies, glory: Big.from(glory) },
    village: { ...s.village, levels, sichLevels: { ...s.village.sichLevels, church } },
    culture,
    heroes: heroes ?? Object.fromEntries([...ARRIVING].map((id) => [id, 1])),
  };
}

const relDiff = (a: Big, b: Big): number => (b.isZero() ? (a.isZero() ? 0 : 1) : Math.abs(a.sub(b).div(b).toNumber()));
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
const NOW = T0 + 5000; // a gap: the refusal must still be the advanced state

function expectRefused(s: GameState, action: Action, reason: string): void {
  const r = applyAction(s, action, NOW);
  const adv = advance(s, NOW);
  expect(r.state).toEqual(adv.state);
  expect(r.events).toEqual([...adv.events, { type: 'ActionRejected', action: action.type, reason }]);
}
const mine = (events: readonly GameEvent[]): GameEvent[] =>
  events.filter((e) => e.type === 'CultureBought' || e.type === 'HeroLevelled');

describe('culturePrice / heroPrice (plan §0)', () => {
  it('a rank costs base × growth^rank × cultureCostMult; a hero level base × growth^level', () => {
    const n = nodeOf('music.maidan');
    expect(relDiff(culturePrice(n, 0, 1), Big.from(n.base))).toBeLessThan(1e-12);
    expect(relDiff(culturePrice(n, 2, 1), Big.from(n.base * n.growth ** 2))).toBeLessThan(1e-12);
    expect(relDiff(culturePrice(n, 2, 0.8), Big.from(n.base * n.growth ** 2 * 0.8))).toBeLessThan(1e-12);
    const h = heroOf('otaman');
    expect(relDiff(heroPrice(h, 1, 1), Big.from(h.base * h.growth))).toBeLessThan(1e-12);
    expect(relDiff(heroPrice(h, 1, 3), bulkCost(h, 1, 3, 1))).toBeLessThan(1e-12);
  });
});

describe('buyCulture (M4-05)', () => {
  it('one rank: the price paid in glory, CultureBought, cultureRanks + 1', () => {
    const n = nodeOf('music.dumy');
    const s = late({ culture: { 'music.dumy': 2 } });
    const r = applyAction(s, { type: 'buyCulture', id: n.id }, T0);
    const price = culturePrice(n, 2, collectModifiers(s, T0).cultureCostMult);
    expect(r.state.culture).toEqual({ 'music.dumy': 3 });
    expect(relDiff(r.state.currencies.glory, s.currencies.glory.sub(price))).toBeLessThan(1e-12);
    expect(r.state.stats.cultureRanks).toBe(s.stats.cultureRanks + 1);
    expect(mine(r.events)).toEqual([{ type: 'CultureBought', id: n.id, from: 2, to: 3 }]);
    expect(r.state.heroes).toEqual(s.heroes);
  });

  it('exact glory buys it (≤), a whisker less does not', () => {
    const n = nodeOf('customs.vechornytsi');
    const price = culturePrice(n, 0, steadyModifiers(late()).cultureCostMult).toNumber();
    expect(applyAction(late({ glory: price }), { type: 'buyCulture', id: n.id }, T0).state.culture).toEqual({
      [n.id]: 1,
    });
    expectRefused(late({ glory: price * 0.999 }), { type: 'buyCulture', id: n.id }, 'glory');
  });

  it('refusals = advance(s, now) + ActionRejected: locked branch, prereq (anyOf, allOf), max, glory', () => {
    const tavernLess = { ...late(), village: { ...late().village, levels: { ...late().village.levels, tavern: 0 } } };
    expectRefused(tavernLess, { type: 'buyCulture', id: 'music.dumy' }, 'locked');
    expectRefused(late({ church: 0 }), { type: 'buyCulture', id: 'customs.vechornytsi' }, 'locked');
    // A church level with the church still locked (farm below 25): a crafted level opens nothing.
    expectRefused(late({ farm: 24 }), { type: 'buyCulture', id: 'customs.vechornytsi' }, 'locked');
    expectRefused(late(), { type: 'buyCulture', id: 'music.maidan' }, 'prereq');
    expectRefused(
      late({ culture: { 'music.dumy': 1, 'music.maidan': 1, 'music.bandura': 1 } }),
      { type: 'buyCulture', id: 'music.great' },
      'prereq',
    );
    const top = nodeOf('music.dumy');
    expectRefused(late({ culture: { 'music.dumy': top.maxRank } }), { type: 'buyCulture', id: top.id }, 'max');
    expectRefused(late({ glory: 0 }), { type: 'buyCulture', id: 'music.dumy' }, 'glory');
  });

  it('prerequisites met: anyOf by either node, allOf by both', () => {
    const a = applyAction(late({ culture: { 'music.dumy': 1 } }), { type: 'buyCulture', id: 'music.campaign' }, T0);
    expect(a.state.culture['music.campaign']).toBe(1);
    const both = { 'music.dumy': 1, 'music.maidan': 1, 'music.bandura': 1, 'music.lirnyky': 1 } as const;
    const t = applyAction(late({ culture: both }), { type: 'buyCulture', id: 'music.great' }, T0);
    expect(t.state.culture['music.great']).toBe(1);
  });
});

describe('levelHero (M4-05)', () => {
  const otaman = heroOf('otaman');

  it('×1 / ×10 / ×25 / max: the picker semantics of buildings, HeroLevelled, heroLevels + n', () => {
    const one = applyAction(late(), { type: 'levelHero', id: 'otaman', mode: 1 }, T0);
    expect(one.state.heroes.otaman).toBe(2);
    expect(mine(one.events)).toEqual([{ type: 'HeroLevelled', id: 'otaman', from: 1, to: 2 }]);
    expect(one.state.stats.heroLevels).toBe(1);
    expect(relDiff(one.state.currencies.glory, Big.from(LOTS).sub(heroPrice(otaman, 1, 1)))).toBeLessThan(1e-12);

    // ×10 from level 1: ten levels, or the rest to the cap (read from content).
    const tenTo = Math.min(1 + 10, otaman.levelMax);
    const ten = applyAction(late(), { type: 'levelHero', id: 'otaman', mode: 10 }, T0);
    expect(ten.state.heroes.otaman).toBe(tenTo);
    expect(ten.state.stats.heroLevels).toBe(tenTo - 1);
    // ×25 a few levels below the cap: the rest up to the cap (read from content, whatever the cap is).
    const near = otaman.levelMax - 5;
    const all = applyAction(late({ heroes: { otaman: near } }), { type: 'levelHero', id: 'otaman', mode: 25 }, T0);
    expect(all.state.heroes.otaman).toBe(otaman.levelMax);
    expect(
      relDiff(all.state.currencies.glory, Big.from(LOTS).sub(heroPrice(otaman, near, otaman.levelMax - near))),
    ).toBeLessThan(1e-12);
    // Max: as many as the glory covers.
    const purse = heroPrice(otaman, 1, 4).toNumber() * 1.0001;
    const max = applyAction(late({ glory: purse }), { type: 'levelHero', id: 'otaman', mode: 'max' }, T0);
    expect(max.state.heroes.otaman).toBe(5);
    expect(mine(max.events)).toEqual([{ type: 'HeroLevelled', id: 'otaman', from: 1, to: 5 }]);
  });

  it('refusals = advance(s, now) + ActionRejected: not come, crafted without his beat, max, glory', () => {
    expectRefused(late({ heroes: {} }), { type: 'levelHero', id: 'otaman', mode: 1 }, 'locked');
    const unseen = { ...late(), story: { seen: [] } };
    expectRefused(unseen, { type: 'levelHero', id: 'otaman', mode: 1 }, 'locked');
    expectRefused(late({ heroes: { otaman: otaman.levelMax } }), { type: 'levelHero', id: 'otaman', mode: 1 }, 'max');
    expectRefused(late({ glory: 0 }), { type: 'levelHero', id: 'otaman', mode: 1 }, 'glory');
    expectRefused(late({ glory: 0 }), { type: 'levelHero', id: 'otaman', mode: 'max' }, 'glory');
    // ×10 needs all ten affordable.
    const nine = heroPrice(otaman, 1, 9).toNumber() * 1.0001;
    expectRefused(late({ glory: nine }), { type: 'levelHero', id: 'otaman', mode: 10 }, 'glory');
  });
});

// ---- effects: a rank/level changes exactly its field(s) by perRank ----
type Entity = { readonly kind: 'node'; readonly def: CultureNode } | { readonly kind: 'hero'; readonly def: HeroDef };
const ENTITIES: readonly Entity[] = [
  ...CULTURE_NODES.map((def) => ({ kind: 'node', def }) as const),
  ...HEROES.filter((h) => ARRIVING.has(h.id)).map((def) => ({ kind: 'hero', def }) as const),
];
const REDUCING = new Set<EffectKind>(Object.keys(EFFECT_FLOORS) as EffectKind[]);
const FOOD = KHORTYTSIA.buildings.filter((b) => b.kharchPerLevel !== undefined).map((b) => b.id);

/** A state with everything `e` needs before one more rank (its prerequisites at rank 1, its level 1 for a hero). */
function before(e: Entity): GameState {
  if (e.kind === 'hero') return late();
  const culture: Partial<Record<CultureNodeId, number>> = {};
  const need = (n: CultureNode): void => {
    if (n.requires.kind === 'root') return;
    for (const id of n.requires.ids) {
      culture[id] = 1;
      need(nodeOf(id));
    }
  };
  need(e.def);
  return late({ culture });
}
const actionOf = (e: Entity): Action =>
  e.kind === 'node' ? { type: 'buyCulture', id: e.def.id } : { type: 'levelHero', id: e.def.id, mode: 1 };

/** Every field of `m` as a flat map (`buildingMult.<id>` for the per-building one). */
function flat(m: Modifiers): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === 'number') out[k] = v;
  }
  for (const id of FARM_BUILDING_IDS) out[`buildingMult.${id}`] = m.buildingMult[id];
  return out;
}
/** The flat keys an effect moves and its signed step. */
function moves(eff: RankedEffect): [string, number][] {
  const t = EFFECT_TARGETS[eff.kind];
  const step = REDUCING.has(eff.kind) ? -eff.perRank : eff.perRank;
  return t.to === 'field' ? [[t.field, step]] : FOOD.map((id) => [`buildingMult.${id}`, step]);
}

const BY_KIND = EFFECT_KINDS.flatMap((kind) => {
  const e = ENTITIES.find((x) => x.def.effects.some((f) => f.kind === kind));
  return e ? [[kind, e] as const] : [];
});

describe('a rank / a level changes exactly its fields by perRank (one case per effect kind)', () => {
  it.each(BY_KIND)('%s', (_, e) => {
    const s = before(e);
    const r = applyAction(s, actionOf(e), T0);
    expect(r.events.some((x) => x.type === 'ActionRejected')).toBe(false);
    const was = flat(steadyModifiers(s));
    const now = flat(steadyModifiers(r.state));
    const want = { ...was };
    for (const eff of e.def.effects) for (const [k, step] of moves(eff)) want[k] = (want[k] ?? Number.NaN) + step;
    for (const k of Object.keys(want)) expect(close(now[k] ?? Number.NaN, want[k] ?? Number.NaN), k).toBe(true);
  });

  it('every effect kind is covered', () => {
    expect(HEROES.every((h) => ARRIVING.has(h.id))).toBe(true);
    const covered = new Set(BY_KIND.map(([k]) => k));
    for (const kind of EFFECT_KINDS) expect(covered.has(kind), kind).toBe(true);
  });
});

describe('a crafted save: a rank in a closed branch or a hero whose beat is unseen gains nothing', () => {
  it('ranks in a closed branch: no culture source, the modifiers of a state without them', () => {
    const maxed = Object.fromEntries(CULTURE_NODES.map((n) => [n.id, n.maxRank]));
    const closed = late({ church: 0, culture: maxed });
    const tavernLess = { ...closed, village: { ...closed.village, levels: { ...closed.village.levels, tavern: 0 } } };
    expect(modifierSources(tavernLess).some((x) => x.source.kind === 'culture')).toBe(false);
    expect(steadyModifiers(tavernLess)).toStrictEqual(steadyModifiers({ ...tavernLess, culture: {} }));
    // Music open, customs closed: only music counts.
    const kinds = new Set(
      modifierSources(closed).flatMap((x) => (x.source.kind === 'culture' ? [nodeOf(x.source.id).branch] : [])),
    );
    expect([...kinds]).toEqual(['music']);
    expect(CULTURE_BRANCHES.map((b) => b.id)).toContain('customs');
  });

  it('a hero no seen beat brought: no hero source', () => {
    const levels = Object.fromEntries(HEROES.map((h) => [h.id, 10]));
    const unseen = { ...late({ heroes: levels }), story: { seen: [] } };
    expect(modifierSources(unseen).some((x) => x.source.kind === 'hero')).toBe(false);
    // Heroes no beat brings in this build count in no state.
    const seen = late({ heroes: levels });
    const heroes = modifierSources(seen).flatMap((x) => (x.source.kind === 'hero' ? [x.source.id] : []));
    expect(new Set(heroes)).toEqual(ARRIVING);
  });
});

describe('time never buys (M4-05)', () => {
  it('advance and applyOffline over 8 h emit no CultureBought / HeroLevelled and change no rank or level', () => {
    const s = late({ culture: { 'music.dumy': 1 } });
    for (const r of [advance(s, T0 + 8 * HOUR), applyOffline(s, T0 + 8 * HOUR)]) {
      expect(mine(r.events)).toEqual([]);
      expect(r.state.culture).toEqual(s.culture);
      expect(r.state.heroes).toEqual(s.heroes);
      expect(r.state.stats.cultureRanks).toBe(s.stats.cultureRanks);
      expect(r.state.stats.heroLevels).toBe(s.stats.heroLevels);
    }
  });
});

describe('offline equivalence with bought nodes and heroes', () => {
  it('8 h in one advance ≈ 0.1 s ticks (< 0.1 %)', () => {
    let s = late({ glory: 0 });
    s = {
      ...s,
      army: { infantry: 20 },
      culture: {
        'music.dumy': 3,
        'music.maidan': 2,
        'customs.vechornytsi': 1,
        'customs.toloka': 1,
        'customs.obzhynky': 2,
      },
      heroes: { ...s.heroes, otaman: 7 },
    };
    expect(
      modifierSources(s).filter((x) => x.source.kind === 'culture' || x.source.kind === 'hero').length,
    ).toBeGreaterThan(5);
    const end = T0 + 8 * HOUR;
    const once = advance(s, end).state;
    let ticked = s;
    for (let t = T0 + 100; t <= end; t += 100) ticked = advance(ticked, t).state;
    expect(relDiff(ticked.currencies.ducats, once.currencies.ducats)).toBeLessThan(1e-3);
    expect(relDiff(ticked.currencies.glory, once.currencies.glory)).toBeLessThan(1e-3);
  });
});

describe('the content floors hold with everything bought', () => {
  it('each reducing field = base − Σ max shares, never below its floor', () => {
    const maxed = Object.fromEntries(CULTURE_NODES.map((n) => [n.id, n.maxRank]));
    const heroes = Object.fromEntries([...ARRIVING].map((id) => [id, heroOf(id).levelMax]));
    const m = steadyModifiers(late({ culture: maxed, heroes }));
    for (const [kind, floor] of Object.entries(EFFECT_FLOORS) as [EffectKind, number][]) {
      const t = EFFECT_TARGETS[kind];
      if (t.to !== 'field') throw new Error('content');
      const field: ScalarField = t.field;
      const sum = ENTITIES.flatMap((e) =>
        e.def.effects
          .filter((f) => f.kind === kind)
          .map((f) => f.perRank * (e.kind === 'node' ? e.def.maxRank : e.def.levelMax)),
      ).reduce((a, b) => a + b, 0);
      expect(m[field], kind).toBeGreaterThanOrEqual(floor);
      expect(close(m[field], 1 - sum), kind).toBe(true);
    }
  });
});
