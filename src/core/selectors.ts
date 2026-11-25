// View selectors for the UI (SPEC §6.1; plan M1-17). Pure reads of the state at its own clock (`time.lastSeen`): the
// UI shows what the core computes — prices, incomes, why a button is off — and never does economy itself. Each row
// is a small plain object, so the UI can skip re-rendering a row whose view did not change.
// A click is applied at the platform's `now`, which runs ahead of `lastSeen` by at most one loop tick (100 ms; a page
// coming back ticks on `visibilitychange` first). If a wind change falls inside that gap the click can disagree with
// the button; the reducer then refuses with ActionRejected and nothing is lost. Accepted (M1-17 review).
import { DEFENCE, FARM, FOOD, SICH, TIER_LEVELS, type Milestone } from '../content/economy.ts';
import { SICH_BUILDINGS, type SichBuildingId, type SichUnlock } from '../content/sich.ts';
import type { FarmBuildingId, WindLevel } from '../content/villages/khortytsia.ts';
import { Big } from './big.ts';
import { bulkCost, buyCount, prodRate, tier, type BuyMode, type Priced } from './economy.ts';
import {
  collectModifiers,
  defence,
  farmIncomeRate,
  kharch,
  maxCossacks,
  sichUnlocked,
  villageOf,
} from './modifiers.ts';
import type { GameEvent } from './events.ts';
import type { GameState } from './state.ts';
import { armyPower, gloryRate, hireLimit, INFANTRY } from './systems/army.ts';
import { windLookAt } from './systems/village-mechanics/wind.ts';
import { PLOT_VARIANTS, VARIANT_SALT, type VariantPlot } from '../content/variants.ts';
import { pickStable } from './rng.ts';
import { AGENT_BUDGET, CART_PERIOD, VILLAGER_GROWTH } from '../content/agents.ts';
import type { QuestGoal } from '../content/quests.ts';
import type { Reward } from '../content/rewards.ts';
import { STORY_BEATS, type PortraitId, type StoryBeatId } from '../content/story.ts';
import {
  chainQuest,
  choreQuest,
  choreRewardsLeft,
  generatedTarget,
  type QuestId,
  type QuestKind,
} from './systems/quests.ts';
import { raidSlotsView, type RaidSlotView } from './raid-selectors.ts';

const PERCENT = 100;
const FARM_MILESTONES = FARM.milestones.map((m) => m.level);

export interface HudView {
  readonly ducats: Big;
  readonly glory: Big;
  readonly ducatsPerSec: Big;
  readonly gloryPerSec: Big;
  readonly kharch: number;
  readonly cossacks: number;
  readonly maxCossacks: number;
  /** ArmyPower (SPEC §3.4) with every modifier («Пернач» included). */
  readonly power: number;
  /** Income bonus from defence, in percent. */
  readonly defencePct: number;
  readonly wind: WindLevel;
}

export function hudView(state: GameState): HudView {
  const mods = collectModifiers(state, state.time.lastSeen);
  return {
    ducats: state.currencies.ducats,
    glory: state.currencies.glory,
    ducatsPerSec: farmIncomeRate(state, mods),
    gloryPerSec: gloryRate(state, mods),
    kharch: kharch(state),
    cossacks: state.army.infantry,
    maxCossacks: maxCossacks(state),
    // = the raid board's power (steady mods): the wind moves only the windmill's income, never powerMult.
    power: armyPower(state, mods),
    defencePct: defence(state) * DEFENCE.incomePerPoint * PERCENT,
    wind: windLookAt(state.seed, state.time.lastSeen, villageOf(state)).id,
  };
}

/** Why a buy button is off (null = it can be pressed). */
export type BuyBlock = 'ducats' | 'glory' | 'max' | 'locked' | null;

interface Offer {
  /** Levels the button buys (MAX with too little money shows one level). 0 only at the cap. */
  readonly count: number;
  readonly price: Big;
  readonly affordable: boolean;
}

/** What the buy button of `mode` offers for a building at `level`. */
function offer(
  b: Priced,
  level: number,
  levelMax: number,
  money: Big,
  scale: number,
  mode: BuyMode,
  mult: number,
): Offer {
  const room = Math.max(0, levelMax - level);
  if (room === 0) return { count: 0, price: Big.ZERO, affordable: false };
  const can = buyCount(b, level, money, scale, levelMax, mode, mult);
  const count = can > 0 ? can : mode === 'max' ? 1 : Math.min(mode, room);
  return { count, price: bulkCost(b, level, count, scale, mult), affordable: can > 0 };
}

/** The next income milestone above `level` (null past the last one). */
function nextMilestone(level: number): Milestone | null {
  return FARM.milestones.find((m) => m.level > level) ?? null;
}

export interface FarmRowView {
  readonly id: FarmBuildingId;
  /** i18n key of the building's name. */
  readonly nameKey: string;
  readonly level: number;
  readonly levelMax: number;
  readonly tier: number;
  /** The next milestone: at that level the income is multiplied by `mult`. */
  readonly nextMilestone: Milestone | null;
  readonly count: number;
  readonly price: Big;
  /** Ducats per second of this building now and after the purchase (modifiers and wind included). */
  readonly incomeNow: Big;
  readonly incomeAfter: Big;
  /** A farm building is never locked (every one is open from the start). */
  readonly blocked: Exclude<BuyBlock, 'locked' | 'glory'>;
}

export function farmRowView(state: GameState, id: FarmBuildingId, mode: BuyMode): FarmRowView {
  const village = villageOf(state);
  const b = village.buildings.find((x) => x.id === id);
  if (!b) throw new Error(`selectors: no farm building ${id} in ${village.id}`);
  const mods = collectModifiers(state, state.time.lastSeen);
  const level = state.village.levels[id];
  const o = offer(b, level, FARM.levelMax, state.currencies.ducats, village.scale, mode, mods.costMult);
  const mult = mods.buildingMult[id] * mods.incomeMult;
  return {
    id,
    nameKey: b.nameKey,
    level,
    levelMax: FARM.levelMax,
    tier: tier(level, FARM_MILESTONES),
    nextMilestone: nextMilestone(level),
    count: o.count,
    price: o.price,
    incomeNow: Big.from(prodRate(b, level, village.scale, mult)),
    incomeAfter: Big.from(prodRate(b, level + o.count, village.scale, mult)),
    blocked: o.count === 0 ? 'max' : o.affordable ? null : 'ducats',
  };
}

/** Sich buildings shown in this land: one locked to a later land (the cannon foundry in land 1) is hidden (plan Q5). */
export function visibleSichIds(state: GameState): readonly SichBuildingId[] {
  const land = villageOf(state).number;
  return SICH_BUILDINGS.filter((b) => b.unlock.kind !== 'land' || land >= b.unlock.land).map((b) => b.id);
}

export interface SichRowView {
  readonly id: SichBuildingId;
  /** i18n keys; the land's own building takes them from the land. */
  readonly nameKey: string;
  readonly descKey: string;
  readonly level: number;
  readonly levelMax: number;
  readonly tier: number;
  readonly count: number;
  /** In glory. */
  readonly price: Big;
  readonly unlock: SichUnlock;
  readonly blocked: BuyBlock;
}

export function sichRowView(state: GameState, id: SichBuildingId, mode: BuyMode): SichRowView {
  const b = SICH_BUILDINGS.find((x) => x.id === id);
  if (!b) throw new Error(`selectors: no Sich building ${id}`);
  const village = villageOf(state);
  const level = state.village.sichLevels[id];
  const o = offer(b, level, SICH.levelMax, state.currencies.glory, village.gloryScale, mode, 1);
  const blocked: BuyBlock = !sichUnlocked(b, state) ? 'locked' : o.count === 0 ? 'max' : o.affordable ? null : 'glory';
  const keys = id === 'special' ? village.sichSpecial : b;
  return {
    id,
    nameKey: keys.nameKey,
    descKey: keys.descKey,
    level,
    levelMax: SICH.levelMax,
    tier: tier(level, SICH.milestones),
    count: o.count,
    price: o.price,
    unlock: b.unlock,
    blocked,
  };
}

export interface HireView {
  /** Cossacks the button hires (the shared buy-amount picker applies, M2-14); at the food limit 0. */
  readonly count: number;
  /** Ducats for those `count` Cossacks. */
  readonly price: Big;
  readonly cossacks: number;
  readonly maxCossacks: number;
  readonly kharchPerCossack: number;
  readonly blocked: 'kharch' | 'ducats' | null;
}

/**
 * The hire button of `mode`: the same offer as a building's button (`offer`), with the food limit as the cap. The UI
 * dispatches `{ type: 'hire', n: count }` exactly when `blocked` is null.
 */
export function hireView(state: GameState, mode: BuyMode): HireView {
  const have = state.army.infantry;
  const mods = collectModifiers(state, state.time.lastSeen);
  const scale = villageOf(state).scale;
  const o = offer(INFANTRY, have, hireLimit(state), state.currencies.ducats, scale, mode, mods.costMult);
  return {
    count: o.count,
    price: o.price,
    cossacks: have,
    maxCossacks: maxCossacks(state),
    kharchPerCossack: FOOD.kharchPerCossack,
    blocked: o.count === 0 ? 'kharch' : o.affordable ? null : 'ducats',
  };
}

/**
 * Visual tier per building (SPEC §6.5; plans M1-19, M2-05): 0 = empty plot, then the tier levels reached
 * (content TIER_LEVELS: I at level 1). Render draws a plot's look from this alone (layout `TierSprite`).
 */
export type VisualTiers = Readonly<Record<FarmBuildingId | SichBuildingId, number>>;

export function visualTiers(state: GameState): VisualTiers {
  const out: Partial<Record<FarmBuildingId | SichBuildingId, number>> = {};
  for (const b of villageOf(state).buildings) out[b.id] = tier(state.village.levels[b.id], TIER_LEVELS.farm);
  for (const b of SICH_BUILDINGS) {
    // Like collectModifiers: a locked building's level (only a crafted save can hold one) counts for nothing.
    out[b.id] = sichUnlocked(b, state) ? tier(state.village.sichLevels[b.id], TIER_LEVELS.sich) : 0;
  }
  // Every farm id of the land and every Sich id was written above.
  return out as VisualTiers;
}

/** Who lives in the scene (plan M2-19, Q11): what render may show of the game's people. */
export interface PopulationView {
  /** Cossacks walking the scene: one per hired infantryman, up to the scene budget (the rest stay abstract). */
  readonly cossacks: number;
  /**
   * Villagers walking the scene (M2-29 D, content `VILLAGER_GROWTH`): the base household, more with the total of
   * building levels, up to the scene budget. Render shows the first that many villager spawns in authored order.
   */
  readonly villagers: number;
  /**
   * Seconds between food carts leaving the farm for the Sich gate (plan M2-20): shorter with more kharch, within the
   * content limits; `null` while the farm grows no food (no carts).
   */
  readonly cartPeriodS: number | null;
}

export function populationView(state: GameState): PopulationView {
  const food = kharch(state);
  let levels = 0;
  for (const id of Object.keys(state.village.levels) as FarmBuildingId[]) levels += state.village.levels[id];
  // Like visualTiers: a locked Sich building's level (only a crafted save can hold one) counts for nothing.
  for (const b of SICH_BUILDINGS) if (sichUnlocked(b, state)) levels += state.village.sichLevels[b.id];
  const grown = VILLAGER_GROWTH.base + Math.floor(VILLAGER_GROWTH.perSqrtLevel * Math.sqrt(levels));
  return {
    cossacks: Math.min(state.army.infantry, AGENT_BUDGET.cossack),
    villagers: Math.min(grown, AGENT_BUDGET.villager),
    cartPeriodS: food <= 0 ? null : Math.min(CART_PERIOD.maxS, Math.max(CART_PERIOD.minS, CART_PERIOD.kharchS / food)),
  };
}

/** Cosmetic variant per plot (plan M2-10, SPEC §2.6): which add-on set of the layout each plot shows. */
export type PlotVariants = Readonly<Record<VariantPlot, number>>;

/**
 * The add-on set `plot` shows in a game with `seed`: 0 … options − 1, a pure function of the seed (no state). A stable
 * pick: adding an option later moves a game only onto the new option.
 */
export function plotVariant(seed: number, plot: VariantPlot): number {
  const { key, options } = PLOT_VARIANTS[plot];
  return pickStable(seed, VARIANT_SALT ^ key, options);
}

/** Every plot's variant for the game's seed; progress and time never change it. */
export function plotVariants(state: GameState): PlotVariants {
  const out: Partial<Record<VariantPlot, number>> = {};
  for (const p of Object.keys(PLOT_VARIANTS) as VariantPlot[]) out[p] = plotVariant(state.seed, p);
  // Every key of PLOT_VARIANTS was written above.
  return out as PlotVariants;
}

/** The «new tier» banner (plan M2-12): the building's name key and the visual tier it reached (I at level 1). */
export interface TierBannerView {
  readonly nameKey: string;
  readonly tier: number;
}

/** `null` for an id the land does not have (a crafted event): the UI shows nothing rather than crash. */
export function tierBannerView(
  state: GameState,
  e: Extract<GameEvent, { type: 'TierReached' }>,
): TierBannerView | null {
  // `TierReached.tier` counts milestones; the visual tier counts level 1 as tier I too (TIER_LEVELS).
  const tier = e.tier + 1;
  const nameKey = buildingNameKey(state, e.zone, e.id);
  return nameKey === null ? null : { nameKey, tier };
}

/** The name key of a building of `zone` in the land (the land's own Sich building takes its land's), or null. */
function buildingNameKey(state: GameState, zone: 'farm' | 'sich', id: string): string | null {
  if (zone === 'farm') return villageOf(state).buildings.find((x) => x.id === id)?.nameKey ?? null;
  if (id === 'special') return villageOf(state).sichSpecial.nameKey;
  return SICH_BUILDINGS.find((x) => x.id === id)?.nameKey ?? null;
}

/**
 * One line of the quest strip (plan M2-25, SPEC §3.10): the title key and its params (`target` fills `{count}` and
 * `{level}`, `buildingKey` the generated step's `{building}`), the progress shown (never past the target), the reward,
 * and whether claiming it pays (`rewarded`: false for a chore past the day's limit — the claim still counts it).
 */
export interface QuestLineView {
  readonly kind: QuestKind;
  readonly id: QuestId;
  readonly titleKey: string;
  readonly buildingKey: string | null;
  readonly progress: number;
  readonly target: number;
  readonly done: boolean;
  readonly reward: Reward;
  readonly rewarded: boolean;
}

/** The active quest of `kind` as a strip line; null for the chain once it is through. */
export function questLineView(state: GameState, kind: QuestKind): QuestLineView | null {
  const q = kind === 'chain' ? chainQuest(state) : choreQuest(state);
  if (!q) return null;
  const target = generatedTarget(q);
  const buildingKey = target ? buildingNameKey(state, target.kind === 'building' ? 'farm' : 'sich', target.id) : null;
  return {
    kind,
    id: q.id,
    titleKey: q.titleKey,
    buildingKey,
    progress: Math.min(Math.max(0, q.progress), q.target),
    target: q.target,
    done: q.done,
    reward: q.reward,
    rewarded: kind === 'chain' || choreRewardsLeft(state) > 0,
  };
}

/** Something waits to be claimed (the red dot): a finished chain step, or a finished chore that still pays today. */
export function questClaimable(state: GameState): boolean {
  if (chainQuest(state)?.done) return true;
  return choreQuest(state).done && choreRewardsLeft(state) > 0;
}

/**
 * Which quest the one-line strip in the sheet shows (SPEC §10.3 «одним рядком»; M2-25 review): a claim waiting first —
 * the chain step, then a chore that still pays — otherwise the chain step; the chore once the chain is through. Both
 * lines in full are on the «Ще» tab.
 */
export function stripQuestKind(state: GameState): QuestKind {
  const chain = chainQuest(state);
  if (chain?.done) return 'chain';
  if (choreQuest(state).done && choreRewardsLeft(state) > 0) return 'chore';
  return chain ? 'chain' : 'chore';
}

/**
 * Where a tap on a quest leads (SPEC §10.3 «тап веде до цілі», plan M3-15): a building's row (farm or Sich list), the
 * hire row, a raid slot's card — or, for a counter with no row of its own, a hint: taps (`tap`), any purchase or level
 * (`none`, also a chain that is through). The UI maps it to a tab, a lit row and the camera; it decides nothing.
 */
export type QuestTarget =
  | { readonly kind: 'farm'; readonly id: FarmBuildingId }
  | {
      readonly kind: 'sich';
      readonly id: SichBuildingId;
      /** Its unlock while it cannot be bought (its row is locked, or not shown in this land); null when open. */
      readonly locked: SichUnlock | null;
    }
  | { readonly kind: 'hire' }
  | { readonly kind: 'raid'; readonly slot: number }
  | { readonly kind: 'tap' }
  | { readonly kind: 'none' };

/** The open slot a raid quest leads to: the first card of the first slot kind in `order` (else slot 0). */
function raidSlotIn(slots: readonly RaidSlotView[], order: readonly RaidSlotView['kind'][]): number {
  for (const kind of order) {
    const hit = slots.find((x) => x.kind === kind);
    if (hit) return hit.slot;
  }
  return 0;
}

function goalTarget(state: GameState, goal: QuestGoal): QuestTarget {
  switch (goal.kind) {
    case 'building':
      return { kind: 'farm', id: goal.id };
    case 'sich': {
      const b = SICH_BUILDINGS.find((x) => x.id === goal.id);
      return { kind: 'sich', id: goal.id, locked: b && !sichUnlocked(b, state) ? b.unlock : null };
    }
    case 'count':
      switch (goal.stat) {
        case 'hires':
          return { kind: 'hire' };
        case 'raidsSent':
        case 'raidsDone': {
          // A start wants «Обрати похід» (or «Ще раз» of a returned raid); a finish wants «Забрати» (or the road).
          const slots = raidSlotsView(state, state.time.lastSeen);
          const order: readonly RaidSlotView['kind'][] =
            goal.stat === 'raidsSent' ? ['idle', 'returned', 'running'] : ['returned', 'running', 'idle'];
          return { kind: 'raid', slot: raidSlotIn(slots, order) };
        }
        case 'taps':
        case 'tapIncomeSec':
          return { kind: 'tap' };
        case 'purchases':
        case 'levelsBought':
          return { kind: 'none' };
      }
  }
}

/** The target of the `kind` quest — by default the one the strip shows (`stripQuestKind`). */
export function questTarget(state: GameState, kind: QuestKind = stripQuestKind(state)): QuestTarget {
  const q = kind === 'chain' ? chainQuest(state) : choreQuest(state);
  return q ? goalTarget(state, q.goal) : { kind: 'none' };
}

/** What the story modal shows of a beat (plan M2-25, SPEC §2.5); the reward it came to is in its event. */
export interface StoryBeatView {
  readonly titleKey: string;
  readonly textKey: string;
  readonly portrait: PortraitId;
}

export function storyBeatView(id: StoryBeatId): StoryBeatView | null {
  const b = STORY_BEATS.find((x) => x.id === id);
  return b ? { titleKey: b.titleKey, textKey: b.textKey, portrait: b.portrait } : null;
}
