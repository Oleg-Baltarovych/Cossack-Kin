// Infantry and passive glory (SPEC §3.4; plan M1-08, Q1 — raids stay in M3). Pure functions; the hire action that
// applies `canHire` is M1-10.
//   hire price of Cossack n = unitBase × scale × hireGrowth^n × costMult   (n = how many are already hired)
//   ArmyPower               = infantry × power × powerMult                  (smithy, maidan …: collectModifiers)
//   glory / s               = ArmyPower × gloryPerPower × gloryMult
// Glory accrues linearly while the store has room: `gloryGain` caps it at `gloryCapSec` of income (the treasury
// raises it), so a long absence fills the store and stops.
import { ARMY } from '../../content/economy.ts';
import { Big } from '../big.ts';
import { bulkCost, cost, type Priced } from '../economy.ts';
import { collectModifiers, maxCossacks, villageOf, type Modifiers } from '../modifiers.ts';
import type { GameState } from '../state.ts';

const INFANTRY: Priced = { base: ARMY.infantry.unitBase, growth: ARMY.hireGrowth };

/** Price of the Cossack hired when `count` are already in the army. */
export function hireCost(count: number, scale: number, costMult = 1): Big {
  return cost(INFANTRY, count, scale, costMult);
}

export type HireCheck =
  { readonly ok: true; readonly cost: Big } | { readonly ok: false; readonly reason: 'count' | 'kharch' | 'ducats' };

/** Whether `n` more Cossacks can be hired now, and for how much (the hire action applies it, M1-10). */
export function canHire(state: GameState, n: number, now = state.time.lastSeen): HireCheck {
  if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: 'count' };
  if (state.army.infantry + n > maxCossacks(state)) return { ok: false, reason: 'kharch' };
  const mods = collectModifiers(state, now);
  const price = bulkCost(INFANTRY, state.army.infantry, n, villageOf(state).scale, mods.costMult);
  if (price.gt(state.currencies.ducats)) return { ok: false, reason: 'ducats' };
  return { ok: true, cost: price };
}

/** ArmyPower (SPEC §3.4) under `mods`. */
export function armyPower(state: GameState, mods: Modifiers): number {
  return state.army.infantry * ARMY.infantry.power * mods.powerMult;
}

/** Glory per second under `mods`. */
export function gloryRate(state: GameState, mods: Modifiers): Big {
  return Big.from(armyPower(state, mods) * ARMY.gloryPerPower * mods.gloryMult);
}

/** Glory earned over `durationSec` at `rate`: linear, but no more than `capSec` of income (the store is full). */
export function gloryGain(rate: Big, durationSec: number, capSec: number): Big {
  return rate.mul(Math.max(0, Math.min(durationSec, capSec)));
}
