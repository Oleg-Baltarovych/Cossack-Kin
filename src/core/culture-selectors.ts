// Culture and hero view selectors (SPEC §3.5 «Модель M4», §10.3; plan M4-07, §0.1 П1/П3/П4/П8; ADR 013): what the
// «Культура» tab, the buff breakdown and the scene read. Pure reads of the state at its own clock (`time.lastSeen`).
// The preview of a purchase is computed on the state the action would leave (a rank or levels more), through the same
// functions the HUD, the offline cap and the raid card use — so «after» is what the player sees once he buys (test).
// The breakdown reads `modifierSources`, the list the engine folds: its value is the field by construction. Data only:
// the UI formats the numbers (`effect.<kind>` with `{value}`, `formatBig`, `formatDuration`).
import {
  CULTURE_BRANCHES,
  CULTURE_NODES,
  type CultureBranchId,
  type CultureNode,
  type CultureNodeId,
  type CulturePrereq,
  type CultureUnlock,
} from '../content/culture.ts';
import type { EffectKind, RankedEffect } from '../content/effects.ts';
import { HEROES, type HeroDef, type HeroId } from '../content/heroes.ts';
import { RAID_TIER_IDS, type RaidTierId } from '../content/raids.ts';
import { STORY_BEATS, type StoryTrigger } from '../content/story.ts';
import type { FarmBuildingId } from '../content/villages/khortytsia.ts';
import type { Big } from './big.ts';
import type { BuyMode } from './economy.ts';
import {
  collectModifiers,
  cultureBranchOpen,
  cultureNodeOpen,
  farmIncomeRate,
  foldSources,
  heroBeat,
  heroLevel,
  modifierSources,
  reducingField,
  steadyModifiers,
  villageOf,
  WIND_BUILDING,
  type ModSource,
  type Modifiers,
  type ModSourceRef,
  type ScalarField,
} from './modifiers.ts';
import { effectPercent } from './percent.ts';
import { raidSuggested } from './raid-selectors.ts';
import { offer } from './selectors.ts';
import type { GameState } from './state.ts';
import { armyPower, gloryRate } from './systems/army.ts';
import { CULTURE_PRICE_SCALE, culturePrereqMet, culturePrice } from './systems/culture.ts';
import { MS_PER_SEC, previewRaid } from './systems/raids.ts';
import { windLookAt } from './systems/village-mechanics/wind.ts';

/** How a share reads: a percent (`effectPercent`) or seconds (the caps; the UI formats a duration). */
export type ShareUnit = 'percent' | 'seconds';

const FIELD_UNIT: Readonly<Record<ScalarField, ShareUnit>> = {
  incomeMult: 'percent',
  costMult: 'percent',
  cultureCostMult: 'percent',
  gloryMult: 'percent',
  powerMult: 'percent',
  offlineMult: 'percent',
  offlineCapSec: 'seconds',
  gloryCapSec: 'seconds',
  lootMult: 'percent',
  relicChanceMult: 'percent',
  raidTimeMult: 'percent',
};

const KIND_UNIT: Readonly<Record<EffectKind, ShareUnit>> = {
  income: 'percent',
  foodIncome: 'percent',
  glory: 'percent',
  power: 'percent',
  loot: 'percent',
  relicChance: 'percent',
  offline: 'percent',
  offlineCapSec: 'seconds',
  gloryCapSec: 'seconds',
  cost: 'percent',
  cultureCost: 'percent',
  raidTime: 'percent',
};

/** The absolute number a card shows next to the percent (П4), by the quantity it names. */
type BigMetric = 'ducatsPerSec' | 'offlineDucatsPerSec' | 'gloryPerSec';
type NumberMetric = 'power' | 'offlineCapSec' | 'gloryCapSec' | 'raidSec';

/**
 * Which quantity each kind moves: income per second (food buildings too), offline income per second, glory per second,
 * army power, the offline cap and the glory store in seconds, the suggested raid's duration. Null: the percent is the
 * whole story (loot and relic chances are on the raid card, prices on each row).
 */
const KIND_METRIC: Readonly<Record<EffectKind, BigMetric | NumberMetric | null>> = {
  income: 'ducatsPerSec',
  foodIncome: 'ducatsPerSec',
  glory: 'gloryPerSec',
  power: 'power',
  loot: null,
  relicChance: null,
  offline: 'offlineDucatsPerSec',
  offlineCapSec: 'offlineCapSec',
  gloryCapSec: 'gloryCapSec',
  cost: null,
  cultureCost: null,
  raidTime: 'raidSec',
};

/** The absolute number now and after the purchase (null after: at the max). */
export type EffectAmount =
  | { readonly unit: BigMetric; readonly now: Big; readonly after: Big | null }
  | { readonly unit: NumberMetric; readonly now: number; readonly after: number | null };

/** One effect line of a card: «+8 % → +12 % доходу · 1,2тис./с → 1,3тис./с». */
export interface EffectPreview {
  readonly kind: EffectKind;
  /** The shared line, filled with `{value}` (plan M4-02). */
  readonly key: `effect.${EffectKind}`;
  readonly unit: ShareUnit;
  /** This node's / hero's own share now and after the purchase, as shown; `after` null at the max. */
  readonly now: number;
  readonly after: number | null;
  /** Null for a kind without its own quantity, or while the node's branch is closed / the hero has not come. */
  readonly amount: EffectAmount | null;
}

/** Why «Вивчити» is off — exactly `buyCulture`'s refusal, in its order (null: it can be pressed). */
export type CultureBlock = 'locked' | 'max' | 'prereq' | 'glory' | null;

export interface CultureNodeView {
  readonly id: CultureNodeId;
  readonly branch: CultureBranchId;
  readonly row: CultureNode['row'];
  /** The prerequisite lines of the tree. */
  readonly requires: CulturePrereq;
  readonly nameKey: string;
  readonly textKey: string;
  readonly factKey: string;
  readonly rank: number;
  readonly maxRank: number;
  /** Glory for the next rank (`cultureCostMult` included); null at the max. */
  readonly price: Big | null;
  readonly blocked: CultureBlock;
  readonly effects: readonly EffectPreview[];
}

export interface CultureBranchView {
  readonly id: CultureBranchId;
  readonly nameKey: string;
  readonly unlockKey: string;
  readonly unlock: CultureUnlock;
  readonly open: boolean;
  readonly nodes: readonly CultureNodeView[];
}

export interface CultureView {
  readonly branches: readonly CultureBranchView[];
}

/** Why a hero's button is off — exactly `levelHero`'s refusal (null: it can be pressed). */
export type HeroBlock = 'locked' | 'max' | 'glory' | null;

export interface HeroView {
  readonly id: HeroId;
  readonly nameKey: string;
  readonly titleKey: string;
  readonly phraseKey: string;
  readonly factKey: string;
  readonly unlockKey: string;
  /** The trigger of the beat that brings him («Прийде, коли…», `{n}`); null while no beat does. */
  readonly unlock: StoryTrigger | null;
  /** 0 until he came. */
  readonly level: number;
  readonly levelMax: number;
  /** Levels the button of the picker's mode buys (as a building's button); 0 not come or at the max. */
  readonly count: number;
  /** Glory for those levels; null not come (he comes for free) or at the max. */
  readonly price: Big | null;
  readonly blocked: HeroBlock;
  /** Not come: now 0, after = what he brings at level 1 (no amount). */
  readonly effects: readonly EffectPreview[];
}

/** Shown value of a share. */
function shown(unit: ShareUnit, share: number): number {
  return unit === 'percent' ? effectPercent(share) : share;
}

/** The absolute numbers of one state, each measured at most once (a view builds many previews of one state). */
interface Meter {
  big(metric: BigMetric): Big;
  num(metric: NumberMetric): number;
}

function meter(state: GameState, tier: RaidTierId): Meter {
  // Folded only when a metric is read (a card of relative-only effects reads none).
  let folded: Modifiers | undefined;
  const mods = (): Modifiers => (folded ??= collectModifiers(state, state.time.lastSeen));
  const bigs = new Map<BigMetric, Big>();
  const nums = new Map<NumberMetric, number>();
  const measureBig = (metric: BigMetric): Big => {
    switch (metric) {
      case 'ducatsPerSec':
        return farmIncomeRate(state, mods());
      case 'offlineDucatsPerSec':
        return farmIncomeRate(state, mods()).mul(mods().offlineMult);
      case 'gloryPerSec':
        return gloryRate(state, mods());
    }
  };
  const measureNum = (metric: NumberMetric): number => {
    switch (metric) {
      case 'power':
        return armyPower(state, mods());
      case 'offlineCapSec':
        return mods().offlineCapSec;
      case 'gloryCapSec':
        return mods().gloryCapSec;
      case 'raidSec':
        return previewRaid(state, tier).durationMs / MS_PER_SEC;
    }
  };
  return {
    big(metric) {
      const v = bigs.get(metric) ?? measureBig(metric);
      bigs.set(metric, v);
      return v;
    },
    num(metric) {
      const v = nums.get(metric) ?? measureNum(metric);
      nums.set(metric, v);
      return v;
    },
  };
}

function amountOf(metric: BigMetric | NumberMetric, now: Meter, after: Meter | null): EffectAmount {
  switch (metric) {
    case 'ducatsPerSec':
    case 'offlineDucatsPerSec':
    case 'gloryPerSec':
      return { unit: metric, now: now.big(metric), after: after ? after.big(metric) : null };
    case 'power':
    case 'offlineCapSec':
    case 'gloryCapSec':
    case 'raidSec':
      return { unit: metric, now: now.num(metric), after: after ? after.num(metric) : null };
  }
}

/**
 * The lines of `effects` from rank `from` to `to` (null: at the max). `measured`: the meters of the state now and
 * after (null: the owner gives nothing in this state — no absolute number).
 */
function previews(
  effects: readonly RankedEffect[],
  from: number,
  to: number | null,
  measured: { readonly now: Meter; readonly after: Meter | null } | null,
): EffectPreview[] {
  return effects.map((e) => {
    const unit = KIND_UNIT[e.kind];
    const metric = KIND_METRIC[e.kind];
    return {
      kind: e.kind,
      key: `effect.${e.kind}`,
      unit,
      now: shown(unit, e.perRank * from),
      after: to === null ? null : shown(unit, e.perRank * to),
      amount: metric === null || measured === null ? null : amountOf(metric, measured.now, measured.after),
    };
  });
}

/** Whether any of `effects` has an absolute number (else no «after» state is measured at all). */
function measurable(effects: readonly RankedEffect[]): boolean {
  return effects.some((e) => KIND_METRIC[e.kind] !== null);
}

/** The raid tier whose duration a raid-time line shows: the one the map opens on (the same before and after). */
function shownTier(state: GameState): RaidTierId {
  return raidSuggested(state) ?? RAID_TIER_IDS[0];
}

/**
 * A node's rank, its next rank's price (null at the max) and `buyCulture`'s refusal in its order — the one reading the
 * card and the red dot share.
 */
function nodeState(
  node: CultureNode,
  state: GameState,
  cultureCostMult: number,
): { readonly rank: number; readonly price: Big | null; readonly blocked: CultureBlock } {
  const rank = state.culture[node.id] ?? 0;
  const price = rank >= node.maxRank ? null : culturePrice(node, rank, cultureCostMult);
  const blocked: CultureBlock = !cultureNodeOpen(node, state)
    ? 'locked'
    : price === null
      ? 'max'
      : !culturePrereqMet(node, state)
        ? 'prereq'
        : state.currencies.glory.lt(price)
          ? 'glory'
          : null;
  return { rank, price, blocked };
}

export function cultureView(state: GameState): CultureView {
  const mult = steadyModifiers(state).cultureCostMult;
  const tier = shownTier(state);
  const now = meter(state, tier);
  const nodeView = (node: CultureNode): CultureNodeView => {
    const { rank, price, blocked } = nodeState(node, state, mult);
    const to = price === null ? null : rank + 1;
    // A closed branch's node gives nothing: no absolute number, so nothing to measure.
    const counts = cultureNodeOpen(node, state) && measurable(node.effects);
    const after =
      counts && to !== null ? meter({ ...state, culture: { ...state.culture, [node.id]: to } }, tier) : null;
    return {
      id: node.id,
      branch: node.branch,
      row: node.row,
      requires: node.requires,
      nameKey: node.nameKey,
      textKey: node.textKey,
      factKey: node.factKey,
      rank,
      maxRank: node.maxRank,
      price,
      blocked,
      effects: previews(node.effects, rank, to, counts ? { now, after } : null),
    };
  };
  return {
    branches: CULTURE_BRANCHES.map((b) => ({
      id: b.id,
      nameKey: b.nameKey,
      unlockKey: b.unlockKey,
      unlock: b.unlock,
      open: cultureBranchOpen(b, state),
      nodes: CULTURE_NODES.filter((n) => n.branch === b.id).map(nodeView),
    })),
  };
}

/** The trigger of the beat that brings `id`, or null. */
function heroUnlock(id: HeroId): StoryTrigger | null {
  const beat = heroBeat(id);
  return STORY_BEATS.find((b) => b.id === beat)?.trigger ?? null;
}

/** The hero cards for the shared picker's `mode` (×1/×10/×25/Max), in content order. */
export function heroesView(state: GameState, mode: BuyMode): readonly HeroView[] {
  const tier = shownTier(state);
  const now = meter(state, tier);
  return HEROES.map((h): HeroView => {
    const level = heroLevel(h.id, state);
    const base = {
      id: h.id,
      nameKey: h.nameKey,
      titleKey: h.titleKey,
      phraseKey: h.phraseKey,
      factKey: h.factKey,
      unlockKey: h.unlockKey,
      unlock: heroUnlock(h.id),
      level,
      levelMax: h.levelMax,
    };
    if (level === 0) {
      return { ...base, count: 0, price: null, blocked: 'locked', effects: previews(h.effects, 0, 1, null) };
    }
    if (level >= h.levelMax) {
      return { ...base, count: 0, price: null, blocked: 'max', effects: previews(h.effects, level, null, null) };
    }
    const o = offer(h, level, h.levelMax, state.currencies.glory, CULTURE_PRICE_SCALE, mode, 1);
    const to = level + o.count;
    const counts = measurable(h.effects);
    const after = counts ? meter({ ...state, heroes: { ...state.heroes, [h.id]: to } }, tier) : null;
    return {
      ...base,
      count: o.count,
      price: o.price,
      blocked: o.affordable ? null : 'glory',
      effects: previews(h.effects, level, to, counts ? { now, after } : null),
    };
  });
}

/**
 * The red dot on «Культура» (П8, Q13): something new can be taken — a node never learned (rank 0) that can be learned
 * now (open branch, prerequisites, glory), or a hero who came and was never levelled (level 1) whose first level is
 * affordable. Derived, no «seen» state: the first purchase of that node or hero clears it, and further ranks or levels
 * never light it. Each node and hero lights it at most once a game.
 */
export function cultureClaimable(state: GameState): boolean {
  const mult = steadyModifiers(state).cultureCostMult;
  const node = CULTURE_NODES.some((n) => {
    const x = nodeState(n, state, mult);
    return x.rank === 0 && x.blocked === null;
  });
  return node || HEROES.some((h) => heroNew(h, state));
}

/** Came, never levelled, and the ×1 button of his card can be pressed (the card's own offer). */
function heroNew(h: HeroDef, state: GameState): boolean {
  if (heroLevel(h.id, state) !== 1) return false;
  return offer(h, 1, h.levelMax, state.currencies.glory, CULTURE_PRICE_SCALE, 1, 1).affordable;
}

/** A scalar field, or one farm building's multiplier. */
export type BreakdownField = ScalarField | { readonly building: FarmBuildingId };

export interface BreakdownSource {
  readonly source: ModSourceRef;
  /** Raw, as folded (positive; a reducing field subtracts it). */
  readonly share: number;
  /** As the player reads it (percent or seconds). */
  readonly shown: number;
}

/** «Звідки цей множник» (П3, Q15): the field = base ± Σ shares (in list order), × the wind on its building. */
export interface ModifierBreakdown {
  readonly unit: ShareUnit;
  readonly reducing: boolean;
  readonly base: number;
  /** The wind of the moment on the wind's building; 1 elsewhere. */
  readonly wind: number;
  /** The field the economy uses at `lastSeen` (= `collectModifiers`). */
  readonly value: number;
  /**
   * The rows the player reads: every source of the field whose shown value is not 0. Content shares are multiples of
   * `PERCENT_STEP` (content test), so the rows add up to `shownTotal` exactly.
   */
  readonly sources: readonly BreakdownSource[];
  /** Σ shares as shown (the bonus or reduction the sources make together). */
  readonly shownTotal: number;
}

export function modifierBreakdown(state: GameState, field: BreakdownField): ModifierBreakdown {
  const at = state.time.lastSeen;
  const mods = collectModifiers(state, at);
  const bare = foldSources([], 1);
  const mine = (s: ModSource): boolean =>
    typeof field === 'string' ? s.field === field : s.field === 'buildingMult' && s.building === field.building;
  const list = modifierSources(state).filter(mine);
  const unit = typeof field === 'string' ? FIELD_UNIT[field] : 'percent';
  let total = 0;
  for (const s of list) total += s.share;
  const common = {
    unit,
    sources: list
      .map((s) => ({ source: s.source, share: s.share, shown: shown(unit, s.share) }))
      .filter((s) => s.shown !== 0),
    shownTotal: shown(unit, total),
  };
  if (typeof field === 'string') {
    return { ...common, reducing: reducingField(field), base: bare[field], wind: 1, value: mods[field] };
  }
  const wind = field.building === WIND_BUILDING ? windLookAt(state.seed, at, villageOf(state)).windmillMult : 1;
  return {
    ...common,
    reducing: false,
    base: bare.buildingMult[field.building],
    wind,
    value: mods.buildingMult[field.building],
  };
}

/** Who of the heroes render may show (M4-15): the ones who came — no levels, no numbers. */
export interface HeroesSceneView {
  readonly present: Readonly<Record<HeroId, boolean>>;
}

export function heroesSceneView(state: GameState): HeroesSceneView {
  const present: Partial<Record<HeroId, boolean>> = {};
  for (const h of HEROES) present[h.id] = heroLevel(h.id, state) > 0;
  // Every hero id was written above.
  return { present: present as Record<HeroId, boolean> };
}
