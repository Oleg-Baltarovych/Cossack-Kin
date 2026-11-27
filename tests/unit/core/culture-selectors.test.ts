// Culture and hero selectors (plan M4-07, §0.1 П1/П3/П4/П8; SPEC §3.5 «Модель M4», §10.3; ADR 013): what the
// «Культура» tab, the buff breakdown and the scene read. The preview of a purchase is the state after the real action;
// the breakdown folds to the very field the economy uses; the red dot lights only for something new.
import { describe, expect, it } from 'vitest';
import { CULTURE_NODES, type CultureNode, type CultureNodeId } from '../../../src/content/culture.ts';
import { EFFECT_KINDS, type EffectKind } from '../../../src/content/effects.ts';
import { HERO_IDS, HEROES, type HeroId } from '../../../src/content/heroes.ts';
import { QUEST_CHAIN } from '../../../src/content/quests.ts';
import { RELIC_IDS } from '../../../src/content/relics.ts';
import { STORY_BEAT_IDS, STORY_BEATS } from '../../../src/content/story.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import {
  cultureClaimable,
  cultureView,
  heroesSceneView,
  heroesView,
  modifierBreakdown,
  type BreakdownField,
  type CultureNodeView,
  type EffectAmount,
  type EffectPreview,
  type HeroView,
} from '../../../src/core/culture-selectors.ts';
import {
  collectModifiers,
  foldSources,
  modifierSources,
  type ModSource,
  type ScalarField,
} from '../../../src/core/modifiers.ts';
import { effectPercent, wholePercent } from '../../../src/core/percent.ts';
import { raidBoardView, raidSuggested } from '../../../src/core/raid-selectors.ts';
import { hudView, questTarget } from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { culturePrice } from '../../../src/core/systems/culture.ts';
import { randomState } from './modifier-samples.ts';

const T0 = 1_763_400_000_000;
const LOTS = 1e9;
const ARRIVING = new Set(STORY_BEATS.flatMap((b) => (b.reward?.kind === 'unlock' ? [b.reward.hero] : [])));
const SCALARS: readonly ScalarField[] = Object.keys(foldSources([], 1)).filter(
  (k): k is ScalarField => k !== 'buildingMult',
);

/**
 * A late game: every beat seen, both branches open, the heroes at `heroes` (default: all at 1), `glory` in the purse.
 */
function late({
  glory = LOTS,
  culture = {},
  heroes,
  tavern = 25,
  church = 1,
}: {
  glory?: number;
  culture?: GameState['culture'];
  heroes?: GameState['heroes'];
  tavern?: number;
  church?: number;
} = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  const levels = { ...s.village.levels };
  for (const id of FARM_BUILDING_IDS) levels[id] = 25;
  levels.tavern = tavern;
  return {
    ...s,
    story: { seen: [...STORY_BEAT_IDS] },
    currencies: { ...s.currencies, glory: Big.from(glory) },
    village: { ...s.village, levels, sichLevels: { ...s.village.sichLevels, church, maidan: 10 } },
    army: { infantry: 40 },
    culture,
    heroes: heroes ?? Object.fromEntries([...ARRIVING].map((id) => [id, 1])),
  };
}

/** A fresh game with the tavern standing (the «Музика» branch open) and `glory`. */
function early(glory: number, extra: Partial<GameState> = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    village: { ...s.village, levels: { ...s.village.levels, tavern: 1 } },
    currencies: { ...s.currencies, glory: Big.from(glory) },
    ...extra,
  };
}

/** Every node at rank 1 but the tops (maxRank 1, so rank 1 is their max): every row below them is learnable. */
const RANK1: GameState['culture'] = Object.fromEntries(
  CULTURE_NODES.filter((n) => n.maxRank > 1).map((n) => [n.id, 1]),
);

const nodeView = (s: GameState, id: CultureNodeId): CultureNodeView => {
  const v = cultureView(s)
    .branches.flatMap((b) => b.nodes)
    .find((n) => n.id === id);
  if (!v) throw new Error(`no view of ${id}`);
  return v;
};
const heroView = (s: GameState, id: HeroId, mode: 1 | 10 | 'max' = 1): HeroView => {
  const v = heroesView(s, mode).find((h) => h.id === id);
  if (!v) throw new Error(`no view of ${id}`);
  return v;
};
/** A hero's level cap, from content. */
const heroMax = (id: HeroId): number => HEROES.find((h) => h.id === id)?.levelMax ?? Number.NaN;

const nodeOf = (id: CultureNodeId): CultureNode => {
  const n = CULTURE_NODES.find((x) => x.id === id);
  if (!n) throw new Error(`content: ${id}`);
  return n;
};

const heroShare = (id: HeroId, kind: EffectKind): number => {
  const e = HEROES.find((h) => h.id === id)?.effects.find((x) => x.kind === kind);
  if (!e) throw new Error(`content: ${id} ${kind}`);
  return e.perRank;
};

/** The first owner of an effect kind: a node that can rise past rank 1, else a hero. */
type Owner = { readonly kind: 'node'; readonly id: CultureNodeId } | { readonly kind: 'hero'; readonly id: HeroId };
function ownerOf(kind: EffectKind): Owner {
  const n = CULTURE_NODES.find((x) => x.maxRank > 1 && x.effects.some((e) => e.kind === kind));
  if (n) return { kind: 'node', id: n.id };
  const h = HEROES.find((x) => x.effects.some((e) => e.kind === kind));
  if (!h) throw new Error(`no owner of ${kind}`);
  return { kind: 'hero', id: h.id };
}

const previewOf = (s: GameState, o: Owner, kind: EffectKind): EffectPreview => {
  const effects = o.kind === 'node' ? nodeView(s, o.id).effects : heroView(s, o.id).effects;
  const e = effects.find((x) => x.kind === kind);
  if (!e) throw new Error(`no ${kind} preview`);
  return e;
};
const actionOf = (o: Owner): Action =>
  o.kind === 'node' ? { type: 'buyCulture', id: o.id } : { type: 'levelHero', id: o.id, mode: 1 };

/** Relative difference of two Big values (glory 1e15 − a price loses the low digits). */
const relDiff = (a: Big, b: Big | null): number => {
  if (b === null) return Infinity;
  return b.isZero() ? (a.isZero() ? 0 : 1) : Math.abs(a.sub(b).div(b).toNumber());
};

const amountNum = (a: EffectAmount, which: 'now' | 'after'): number => {
  const v = a[which];
  if (v === null) throw new Error('no after');
  return v instanceof Big ? v.toNumber() : v;
};

/** The kinds whose absolute number is the percent itself (no own quantity on a card). */
const RELATIVE_ONLY: ReadonlySet<EffectKind> = new Set(['loot', 'relicChance', 'cost', 'cultureCost']);

describe('effectPercent (M4-07): half-percent steps, floored', () => {
  it('hero and defence shares keep their half percent; whole shares as wholePercent', () => {
    expect(effectPercent(0.015)).toBe(1.5);
    expect(effectPercent(0.015 * 3)).toBe(4.5);
    expect(effectPercent(0.005 * 7)).toBe(3.5);
    expect(effectPercent(0.29)).toBe(29);
    expect(effectPercent(0.999)).toBe(99.5);
    expect(effectPercent(0.0049)).toBe(0);
    // wholePercent (raid chances) is unchanged.
    expect(wholePercent(0.29)).toBe(29);
    expect(wholePercent(0.045)).toBe(4);
  });
});

describe('preview = the state after the real action (M4-07, П4)', () => {
  it.each(EFFECT_KINDS.map((k) => [k] as const))('%s', (kind) => {
    const o = ownerOf(kind);
    const s = late({ culture: RANK1, heroes: Object.fromEntries(HERO_IDS.map((id) => [id, 2])) });
    const before = previewOf(s, o, kind);
    const r = applyAction(s, actionOf(o), s.time.lastSeen);
    expect(r.events.some((e) => e.type === 'ActionRejected')).toBe(false);
    const after = previewOf(r.state, o, kind);
    expect(before.key).toBe(`effect.${kind}`);
    // The percent / seconds line: «now» after the action = «after» before it, and it moved.
    expect(after.now).toBe(before.after);
    expect(before.after).not.toBe(before.now);
    if (RELATIVE_ONLY.has(kind)) {
      expect(before.amount).toBeNull();
      return;
    }
    if (!before.amount || !after.amount) throw new Error(`${kind}: no amount`);
    expect(after.amount.unit).toBe(before.amount.unit);
    expect(amountNum(after.amount, 'now')).toBe(amountNum(before.amount, 'after'));
    expect(amountNum(before.amount, 'after')).not.toBe(amountNum(before.amount, 'now'));
  });

  it('the shown line is the own share: effectPercent(perRank × rank), seconds for the caps', () => {
    // A rank below the max (read from content): the line shows it now and the next one after.
    const dumyRank = nodeOf('music.dumy').maxRank - 1;
    const s = late({
      culture: { ...RANK1, 'music.dumy': dumyRank },
      heroes: { otaman: 1, kobzar: 3, kharakternyk: 1 },
    });
    const dumyShare = nodeOf('music.dumy').effects[0]?.perRank ?? 0;
    const dumy = nodeView(s, 'music.dumy').effects[0];
    expect(dumy).toMatchObject({
      kind: 'income',
      unit: 'percent',
      now: effectPercent(dumyShare * dumyRank),
      after: effectPercent(dumyShare * (dumyRank + 1)),
    });
    // The Кобзар's glory moves in half percents (content test): level 3 keeps its .5.
    const kobzarShare = heroShare('kobzar', 'glory');
    const kobzar = heroView(s, 'kobzar').effects.find((e) => e.kind === 'glory');
    expect(kobzar).toMatchObject({
      unit: 'percent',
      now: effectPercent(kobzarShare * 3),
      after: effectPercent(kobzarShare * 4),
    });
    expect(effectPercent(kobzarShare * 3) % 1).not.toBe(0);
    const vech = nodeOf('customs.vechornytsi');
    const cap = nodeView(s, vech.id).effects[0];
    const perRank = vech.effects[0]?.perRank ?? 0;
    expect(cap).toMatchObject({ kind: 'offlineCapSec', unit: 'seconds', now: perRank, after: 2 * perRank });
  });

  it('the absolute «now» is the number the HUD, the cap and the raid card show', () => {
    const s = late({ culture: RANK1, heroes: Object.fromEntries(HERO_IDS.map((id) => [id, 2])) });
    const hud = hudView(s);
    const mods = collectModifiers(s, s.time.lastSeen);
    const amount = (o: Owner, kind: EffectKind): EffectAmount => {
      const a = previewOf(s, o, kind).amount;
      if (!a) throw new Error(`${kind}: no amount`);
      return a;
    };
    expect(amount(ownerOf('income'), 'income')).toMatchObject({ unit: 'ducatsPerSec' });
    expect(amountNum(amount(ownerOf('income'), 'income'), 'now')).toBe(hud.ducatsPerSec.toNumber());
    expect(amountNum(amount(ownerOf('foodIncome'), 'foodIncome'), 'now')).toBe(hud.ducatsPerSec.toNumber());
    expect(amountNum(amount(ownerOf('glory'), 'glory'), 'now')).toBe(hud.gloryPerSec.toNumber());
    expect(amount(ownerOf('power'), 'power')).toMatchObject({ unit: 'power', now: hud.power });
    expect(amountNum(amount(ownerOf('offline'), 'offline'), 'now')).toBe(
      hud.ducatsPerSec.mul(mods.offlineMult).toNumber(),
    );
    expect(amount(ownerOf('offlineCapSec'), 'offlineCapSec')).toMatchObject({ now: mods.offlineCapSec });
    expect(amount(ownerOf('gloryCapSec'), 'gloryCapSec')).toMatchObject({ now: mods.gloryCapSec });
    const tier = raidSuggested(s);
    const card = raidBoardView(s).offers.find((x) => x.tier === tier);
    expect(amount(ownerOf('raidTime'), 'raidTime')).toMatchObject({ unit: 'raidSec', now: card?.durationSec });
  });

  it('a hero preview follows the picker: ×10 shows ten levels at their summed price', () => {
    const s = late({ heroes: { otaman: 1 } });
    const v = heroView(s, 'otaman', 10);
    expect(v.count).toBe(10);
    const r = applyAction(s, { type: 'levelHero', id: 'otaman', mode: 10 }, s.time.lastSeen);
    expect(relDiff(s.currencies.glory.sub(r.state.currencies.glory), v.price)).toBeLessThan(1e-6);
    expect(heroView(r.state, 'otaman').effects[0]?.now).toBe(v.effects[0]?.after);
  });

  it('at the max there is no «after» and no price', () => {
    const v = nodeView(late({ culture: { ...RANK1, 'music.great': 1 } }), 'music.great');
    expect(v.blocked).toBe('max');
    expect(v.price).toBeNull();
    expect(v.effects.every((e) => e.after === null && (e.amount === null || e.amount.after === null))).toBe(true);
  });

  it('a node of a closed branch shows its first rank (П1) but no absolute number (it would give nothing)', () => {
    const v = nodeView(late({ church: 0 }), 'customs.vechornytsi');
    expect(v.blocked).toBe('locked');
    expect(v.effects[0]).toMatchObject({ now: 0, after: nodeOf('customs.vechornytsi').effects[0]?.perRank });
    expect(v.effects[0]?.amount).toBeNull();
  });

  it('a hero not come shows what he brings at arrival, no price, no absolute', () => {
    const v = heroView(late({ heroes: {} }), 'kobzar');
    expect(v).toMatchObject({ level: 0, count: 0, price: null, blocked: 'locked' });
    expect(v.effects.find((e) => e.kind === 'glory')).toMatchObject({
      now: 0,
      after: effectPercent(heroShare('kobzar', 'glory')),
      amount: null,
    });
    expect(v.unlock).not.toBeNull();
  });
});

describe('blocked mirrors the engine (M4-07)', () => {
  const states: readonly GameState[] = [
    early(0),
    early(LOTS),
    late({ glory: 2000, culture: { 'music.dumy': 1 } }),
    late({ culture: RANK1 }),
    late({
      church: 0,
      culture: { 'music.dumy': nodeOf('music.dumy').maxRank, 'music.campaign': nodeOf('music.campaign').maxRank },
    }),
    late({ tavern: 0, heroes: { otaman: heroMax('otaman') } }),
  ];

  it('a node: null ⇔ buyCulture is accepted, else the very refusal; the price is what it takes', () => {
    for (const s of states) {
      for (const v of cultureView(s).branches.flatMap((b) => b.nodes)) {
        const r = applyAction(s, { type: 'buyCulture', id: v.id }, s.time.lastSeen);
        const refused = r.events.find((e) => e.type === 'ActionRejected');
        expect(refused?.reason ?? null, v.id).toBe(v.blocked);
        if (v.blocked === null) {
          expect(relDiff(s.currencies.glory.sub(r.state.currencies.glory), v.price), v.id).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('a hero: null ⇔ levelHero is accepted, else the very refusal', () => {
    for (const s of states) {
      for (const mode of [1, 10, 'max'] as const) {
        for (const v of heroesView(s, mode)) {
          const r = applyAction(s, { type: 'levelHero', id: v.id, mode }, s.time.lastSeen);
          const refused = r.events.find((e) => e.type === 'ActionRejected');
          expect(refused?.reason ?? null, `${v.id} ×${String(mode)}`).toBe(v.blocked);
        }
      }
    }
  });

  it('a late-game purse (≥ 1e15): blocked, the price and what buyCulture takes', () => {
    const purse = 1e15;
    // Glory − a price at 1e15 keeps ~16 digits: the tolerance scales with the purse.
    const tol = purse * 1e-12;
    const s = late({ glory: purse, culture: RANK1 });
    const mult = collectModifiers(s, s.time.lastSeen).cultureCostMult;
    for (const v of cultureView(s).branches.flatMap((b) => b.nodes)) {
      if (v.blocked !== null) continue;
      expect(v.price?.eq(culturePrice(nodeOf(v.id), v.rank, mult)), v.id).toBe(true);
      const r = applyAction(s, { type: 'buyCulture', id: v.id }, s.time.lastSeen);
      const want = s.currencies.glory.sub(v.price ?? 0);
      expect(Math.abs(r.state.currencies.glory.sub(want).toNumber()), v.id).toBeLessThanOrEqual(tol);
    }
    expect(
      cultureView(s)
        .branches.flatMap((b) => b.nodes)
        .filter((v) => v.blocked === null).length,
    ).toBeGreaterThan(0);
  });

  it('the node price carries cultureCostMult («Кобза діда», the Кобзар)', () => {
    const s = { ...late({ heroes: { kobzar: 10 } }), relics: [...RELIC_IDS] };
    const mult = collectModifiers(s, s.time.lastSeen).cultureCostMult;
    expect(mult).toBeLessThan(1);
    expect(nodeView(s, 'music.dumy').price?.eq(culturePrice(nodeOf('music.dumy'), 0, mult))).toBe(true);
  });
});

describe('modifierBreakdown (M4-07, П3): sources with shares, folded = the field', () => {
  /** Random states with random culture ranks and hero levels (both branches open in about half of them). */
  function sample(seed: number): GameState {
    const { state, now } = randomState(seed);
    const culture = Object.fromEntries(CULTURE_NODES.map((n, i) => [n.id, (seed + i) % (n.maxRank + 1) || 1]));
    const heroes = Object.fromEntries(HERO_IDS.map((id, i) => [id, 1 + ((seed * (i + 3)) % heroMax(id))]));
    return {
      ...state,
      story: { seen: [...STORY_BEAT_IDS] },
      culture,
      heroes,
      village: {
        ...state.village,
        levels: { ...state.village.levels, tavern: Math.max(1, state.village.levels.tavern) },
      },
      time: { ...state.time, lastSeen: now, maxSeen: now },
    };
  }
  const fields: readonly BreakdownField[] = [...SCALARS, ...FARM_BUILDING_IDS.map((building) => ({ building }))];
  const same = (src: ModSource, f: BreakdownField): boolean =>
    typeof f === 'string' ? src.field === f : src.field === 'buildingMult' && src.building === f.building;

  it('for every field of 30 states: value = collectModifiers, base ± Σ shares (× wind) = value', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = sample(seed);
      const mods = collectModifiers(s, s.time.lastSeen);
      for (const f of fields) {
        const b = modifierBreakdown(s, f);
        const field = typeof f === 'string' ? mods[f] : mods.buildingMult[f.building];
        expect(b.value, JSON.stringify(f)).toBe(field);
        let folded = b.base;
        for (const x of b.sources) folded += b.reducing ? -x.share : x.share;
        expect(folded * b.wind).toBe(field);
        expect(b.sources.map((x) => x.source)).toEqual(
          modifierSources(s)
            .filter((x) => same(x, f))
            .map((x) => x.source),
        );
        for (const x of b.sources) expect(x.shown).toBe(b.unit === 'percent' ? effectPercent(x.share) : x.share);
        const total = b.sources.reduce((sum, x) => sum + x.share, 0);
        expect(b.shownTotal).toBe(b.unit === 'percent' ? effectPercent(total) : total);
        // The rows the player adds up give the total he reads (content shares are on PERCENT_STEP).
        expect(
          b.sources.reduce((sum, x) => sum + x.shown, 0),
          JSON.stringify(f),
        ).toBe(b.shownTotal);
      }
    }
  });

  it('names culture and hero sources; a closed branch is not among them', () => {
    const s = late({ church: 0, culture: { 'music.dumy': 2, 'customs.toloka': 2 }, heroes: { otaman: 3 } });
    expect(modifierBreakdown(s, 'incomeMult').sources.map((x) => x.source)).toContainEqual({
      kind: 'culture',
      id: 'music.dumy',
    });
    const share = heroShare('otaman', 'power') * 3;
    expect(modifierBreakdown(s, 'powerMult').sources).toContainEqual({
      source: { kind: 'hero', id: 'otaman' },
      share,
      shown: effectPercent(share),
    });
    expect(modifierBreakdown(s, 'costMult').sources).toEqual([]);
    expect(modifierBreakdown(s, 'costMult')).toMatchObject({ reducing: true, value: 1, base: 1 });
    expect(modifierBreakdown(s, 'offlineCapSec').unit).toBe('seconds');
  });
});

describe('cultureClaimable — the red dot only for something new (M4-07, П8, Q13)', () => {
  const dumy = nodeOf('music.dumy');
  const dumyPrice = culturePrice(dumy, 0, 1).toNumber();

  it('a fresh game: nothing (the branch is closed, no hero came)', () => {
    expect(cultureClaimable(createInitialState({ seed: 5, now: T0 }))).toBe(false);
  });

  it('a rank-0 node open and affordable lights it; too little glory does not', () => {
    expect(cultureClaimable(early(dumyPrice))).toBe(true);
    expect(cultureClaimable(early(dumyPrice * 0.99))).toBe(false);
  });

  it('the dot goes once the first rank is bought (the next row costs more than is left)', () => {
    const s = early(dumyPrice);
    const r = applyAction(s, { type: 'buyCulture', id: dumy.id }, s.time.lastSeen);
    expect(r.state.culture[dumy.id]).toBe(1);
    expect(cultureClaimable(r.state)).toBe(false);
  });

  it('a newly reachable node lights it again; a further rank of a bought node never does', () => {
    const next = culturePrice(nodeOf('music.maidan'), 0, 1).toNumber();
    expect(cultureClaimable(early(next, { culture: { 'music.dumy': 1 } }))).toBe(true);
    // Every node bought once (the tops at their max): plenty of glory for further ranks, no dot.
    const all = Object.fromEntries(CULTURE_NODES.map((n) => [n.id, 1]));
    const s = late({ culture: all, heroes: {} });
    expect(
      cultureView(s)
        .branches.flatMap((x) => x.nodes)
        .some((n) => n.blocked === null),
    ).toBe(true);
    expect(cultureClaimable(s)).toBe(false);
  });

  it('a hero who came (level 1, never levelled) lights it when his first level is affordable; levelling clears it', () => {
    const allTop = Object.fromEntries(CULTURE_NODES.map((n) => [n.id, 1]));
    const s = late({ culture: allTop, heroes: { otaman: 1 } });
    expect(cultureClaimable(s)).toBe(true);
    const r = applyAction(s, { type: 'levelHero', id: 'otaman', mode: 1 }, s.time.lastSeen);
    expect(cultureClaimable(r.state)).toBe(false);
    expect(cultureClaimable(late({ glory: 1, culture: allTop, heroes: { otaman: 1 } }))).toBe(false);
  });
});

describe('questTarget: culture1 leads to «Кобзарські думи» (M4-07)', () => {
  const step = QUEST_CHAIN.findIndex((q) => q.id === 'khortytsia.culture1');
  const onStep = (s: GameState): GameState => ({
    ...s,
    quests: { ...s.quests, chain: { kind: 'listed', index: step, base: 0 } },
  });

  it('the branch open: the root of «Музика»; closed: the same node with the branch condition', () => {
    expect(questTarget(onStep(early(0)), 'chain')).toEqual({ kind: 'culture', id: 'music.dumy', locked: null });
    expect(questTarget(onStep(createInitialState({ seed: 5, now: T0 })), 'chain')).toEqual({
      kind: 'culture',
      id: 'music.dumy',
      locked: { kind: 'building', id: 'tavern', level: 1 },
    });
  });

  it('the first node a rank can be learned of now, in content order', () => {
    const s = onStep(early(0, { culture: { 'music.dumy': nodeOf('music.dumy').maxRank } }));
    expect(questTarget(s, 'chain')).toEqual({ kind: 'culture', id: 'music.maidan', locked: null });
  });
});

describe('heroesSceneView (M4-07): who is present, no numbers', () => {
  it('only heroes who came; a stored hero without his beat is not there', () => {
    const fresh = createInitialState({ seed: 5, now: T0 });
    expect(heroesSceneView(fresh)).toEqual({ present: { otaman: false, kobzar: false, kharakternyk: false } });
    expect(heroesSceneView(late({ heroes: { otaman: 4 } }))).toEqual({
      present: { otaman: true, kobzar: false, kharakternyk: false },
    });
    expect(heroesSceneView({ ...fresh, heroes: { otaman: 1 } }).present.otaman).toBe(false);
  });
});
