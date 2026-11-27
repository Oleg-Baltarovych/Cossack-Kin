// Ranked effects of culture nodes and heroes (SPEC §3.5 «Модель M4», §9.6; ADR 013). An effect adds `perRank` × rank
// (a node's rank, a hero's level) to the one target its kind names (`EFFECT_TARGETS`) — no effect spans two targets, so
// the modifier breakdown (M4-07) can name every source of a field. Data only: `modifierSources` (core, M4-03/05) folds it.

import { RAIDS } from './raids.ts';

/** Append only; each kind has the UI line `effect.<kind>` (uk, en). Shares for multipliers (0.04 = +4 %), seconds for caps. */
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

/** The scalar `Modifiers` fields an effect can name (core checks them against `keyof Modifiers`, M4-03). */
export type EffectField =
  | 'incomeMult'
  | 'gloryMult'
  | 'powerMult'
  | 'lootMult'
  | 'relicChanceMult'
  | 'offlineMult'
  | 'offlineCapSec'
  | 'gloryCapSec'
  | 'costMult'
  | 'cultureCostMult'
  | 'raidTimeMult';

export type EffectTarget =
  /** One scalar field. `costMult` prices buildings and hires alike, so `cost` lowers both through that one field. */
  | { readonly to: 'field'; readonly field: EffectField }
  /** The one exception: `buildingMult[id]` of every food building (a farm building with `kharchPerLevel`). */
  | { readonly to: 'foodBuildings' };

/** Where each kind goes; a `Record`, so a new kind without a target is a compile error. */
export const EFFECT_TARGETS: Readonly<Record<EffectKind, EffectTarget>> = {
  income: { to: 'field', field: 'incomeMult' },
  foodIncome: { to: 'foodBuildings' },
  glory: { to: 'field', field: 'gloryMult' },
  power: { to: 'field', field: 'powerMult' },
  loot: { to: 'field', field: 'lootMult' },
  relicChance: { to: 'field', field: 'relicChanceMult' },
  offline: { to: 'field', field: 'offlineMult' },
  offlineCapSec: { to: 'field', field: 'offlineCapSec' },
  gloryCapSec: { to: 'field', field: 'gloryCapSec' },
  cost: { to: 'field', field: 'costMult' },
  cultureCost: { to: 'field', field: 'cultureCostMult' },
  raidTime: { to: 'field', field: 'raidTimeMult' },
};

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
