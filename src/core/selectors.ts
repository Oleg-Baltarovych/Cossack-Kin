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
import type { GameState } from './state.ts';
import { canHire, gloryRate, hireCost } from './systems/army.ts';
import { windLookAt } from './systems/village-mechanics/wind.ts';

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
  /** Ducats for the next Cossack (one at a time: the buy-amount picker does not apply to hiring in M1). */
  readonly price: Big;
  readonly cossacks: number;
  readonly maxCossacks: number;
  readonly kharchPerCossack: number;
  readonly blocked: 'kharch' | 'ducats' | null;
}

export function hireView(state: GameState): HireView {
  const check = canHire(state, 1, state.time.lastSeen);
  const mods = collectModifiers(state, state.time.lastSeen);
  const price = check.ok ? check.cost : hireCost(state.army.infantry, villageOf(state).scale, mods.costMult);
  return {
    price,
    cossacks: state.army.infantry,
    maxCossacks: maxCossacks(state),
    kharchPerCossack: FOOD.kharchPerCossack,
    // n = 1 is a whole positive count, so the only refusals left are food and money.
    blocked: check.ok ? null : check.reason === 'kharch' ? 'kharch' : 'ducats',
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
