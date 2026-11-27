// Ranked effects of culture nodes and heroes (SPEC §3.5 «Модель M4», §9.6; ADR 013). An effect adds `perRank` × rank
// (a node's rank, a hero's level) to the one `Modifiers` field its kind names, 1:1 — no effect spans two fields, so the
// modifier breakdown (M4-07) can name every source of a field. Data only: `modifierSources` (core, M4-03/05) folds it.

import { RAIDS } from './raids.ts';

/**
 * Effect kind → `Modifiers` field: `income` → incomeMult, `foodIncome` → buildingMult of the food buildings (those with
 * `kharchPerLevel`), `glory` → gloryMult, `power` → powerMult, `loot` → lootMult, `relicChance` → relicChanceMult,
 * `offline` → offlineMult, `offlineCapSec` → offlineCapSec, `gloryCapSec` → gloryCapSec, `cost` → costMult (buildings
 * and hires), `cultureCost` → cultureCostMult, `raidTime` → raidTimeMult. Shares for multipliers (0.04 = +4 %),
 * seconds for the two caps. Append only; each kind has the UI line `effect.<kind>` (uk, en).
 */
export const EFFECT_KINDS = [
  'income',
  'foodIncome',
  'glory',
  'power',
  'loot',
  'relicChance',
  'offline',
  'offlineCapSec',
  'gloryCapSec',
  'cost',
  'cultureCost',
  'raidTime',
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Always positive: a reducing kind (`EFFECT_FLOORS`) subtracts its share, every other kind adds it. */
export interface RankedEffect {
  readonly kind: EffectKind;
  readonly perRank: number;
}

/**
 * The reducing kinds and the least their field may fall to: the field is `1 − Σ share`, and a content test keeps the
 * largest possible Σ ≤ 1 − floor, so the floor never binds. `raidTime` is the save gate's bound (`RAIDS.minTimeMult`,
 * ADR 013); the two price floors: гіпотеза (M4-09), room for later sources (relics, heroes 4–8).
 */
export const EFFECT_FLOORS = {
  cost: 0.5,
  cultureCost: 0.5,
  raidTime: RAIDS.minTimeMult,
} as const satisfies Partial<Record<EffectKind, number>>;
