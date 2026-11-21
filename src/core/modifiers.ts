// Food, defence and the single modifier collector (SPEC §3.0, §3.2, §3.2.1, §9.6; plan M1-06). Every multiplier the
// systems use comes from `collectModifiers(state, now)` — systems never read buff buildings directly. Sich effects
// count only for unlocked buildings: the save gate does not enforce unlocks, so a crafted save with a level on a
// locked building gains nothing from it (security review M1-04). No cache yet (measure first, plan §0).
import { ARMY, DEFENCE, FOOD, OFFLINE } from '../content/economy.ts';
import { SICH_BUILDINGS, type SichBuilding } from '../content/sich.ts';
import { FARM_BUILDING_IDS, KHORTYTSIA, type FarmBuildingId, type Village } from '../content/villages/khortytsia.ts';
import type { Big } from './big.ts';
import { incomeRate } from './economy.ts';
import type { GameState, VillageState } from './state.ts';
import { windLookAt } from './systems/village-mechanics/wind.ts';

export interface Modifiers {
  /** Farm and suburb income (defence: «спокій на хуторах»). */
  readonly incomeMult: number;
  /** Per-building income multiplier (the land passive and the wind on the windmill). */
  readonly buildingMult: Readonly<Record<FarmBuildingId, number>>;
  readonly costMult: number;
  readonly gloryMult: number;
  /** Army power (the smithy, the maidan, …). */
  readonly powerMult: number;
  readonly offlineMult: number;
  readonly offlineCapSec: number;
  /** How many seconds of glory income the store holds (the treasury raises it). */
  readonly gloryCapSec: number;
}

const VILLAGES: Readonly<Record<GameState['village']['id'], Village>> = { khortytsia: KHORTYTSIA };

/** The content record of the state's land. */
export function villageOf(state: { readonly village: Pick<VillageState, 'id'> }): Village {
  return VILLAGES[state.village.id];
}

/** Whether a Sich building can be bought (and its effects count) in this state. */
export function sichUnlocked(
  b: SichBuilding,
  state: { readonly village: Pick<VillageState, 'id' | 'levels'> },
): boolean {
  const u = b.unlock;
  switch (u.kind) {
    case 'start':
      return true;
    case 'farmAll':
      return FARM_BUILDING_IDS.every((id) => state.village.levels[id] >= u.level);
    case 'land':
      return villageOf(state).number >= u.land;
  }
}

/** Sum of `perLevel(b) × level` over the unlocked Sich buildings. */
function sichSum(state: GameState, perLevel: (b: SichBuilding) => number | undefined): number {
  let sum = 0;
  for (const b of SICH_BUILDINGS) {
    const p = perLevel(b);
    if (p !== undefined && sichUnlocked(b, state)) sum += p * state.village.sichLevels[b.id];
  }
  return sum;
}

/** «Харч» (SPEC §3.0): Σ level × kharchPerLevel over the food buildings. */
export function kharch(state: GameState): number {
  let sum = 0;
  for (const b of villageOf(state).buildings) {
    if (b.kharchPerLevel !== undefined) sum += state.village.levels[b.id] * b.kharchPerLevel;
  }
  return sum;
}

/** The Cossack limit: what the food feeds plus the kurins' places. */
export function maxCossacks(state: GameState): number {
  return Math.floor(kharch(state) / FOOD.kharchPerCossack) + sichSum(state, (b) => b.effects.cossacksPerLevel);
}

/** «Оборона» points (SPEC §3.0). */
export function defence(state: GameState): number {
  return sichSum(state, (b) => b.effects.defencePerLevel);
}

/** Σ level × perLevel of the farm buildings whose effect is `kind`. */
function farmEffect(state: GameState, kind: 'armyPower' | 'glory'): number {
  let sum = 0;
  for (const b of villageOf(state).buildings) {
    if (b.effect?.kind === kind) sum += b.effect.perLevel * state.village.levels[b.id];
  }
  return sum;
}

/** All multipliers in force at `now` (ms) (SPEC §9.6): the wind on the windmill depends on the time. */
export function collectModifiers(state: GameState, now: number): Modifiers {
  return modifiersUnder(state, windLookAt(state.seed, now, villageOf(state)).windmillMult);
}

/**
 * The multipliers without the wind of the moment (the windmill at ×1, a breeze): the rate a reward in minutes is
 * measured by, so it does not depend on when it is granted (plan M2-22: online = offline).
 */
export function steadyModifiers(state: GameState): Modifiers {
  return modifiersUnder(state, 1);
}

function modifiersUnder(state: GameState, windmillMult: number): Modifiers {
  const village = villageOf(state);
  const buildingMult = Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, 1])) as Record<FarmBuildingId, number>;
  buildingMult.windmill *= village.passive.mult * windmillMult;
  return {
    incomeMult: 1 + defence(state) * DEFENCE.incomePerPoint,
    buildingMult,
    costMult: 1,
    gloryMult: 1 + farmEffect(state, 'glory') + sichSum(state, (b) => b.effects.gloryPerLevel),
    powerMult: 1 + farmEffect(state, 'armyPower') + sichSum(state, (b) => b.effects.powerPerLevel),
    offlineMult: OFFLINE.mult,
    offlineCapSec: OFFLINE.capSec,
    gloryCapSec: ARMY.gloryCapSec + sichSum(state, (b) => b.effects.gloryCapSecPerLevel),
  };
}

/** Ducats per second of the farm and suburb under `mods`. */
export function farmIncomeRate(state: GameState, mods: Modifiers): Big {
  // incomeMult folded into the per-building number product: one Big conversion per call (M1-09 review).
  return incomeRate(state.village.levels, villageOf(state), (id) => mods.buildingMult[id] * mods.incomeMult);
}
