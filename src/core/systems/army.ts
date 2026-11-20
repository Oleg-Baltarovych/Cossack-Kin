// Infantry and passive glory (SPEC §3.4; plan M1-08, Q1 — raids stay in M3). Pure functions; the hire action that
// applies `canHire` is M1-10; the buy-amount picker on hiring (`hireCount`) is M2-14.
//   hire price of Cossack n = unitBase × scale × hireGrowth^n × costMult   (n = how many are already hired)
//   hiring n at once        = the geometric sum of those prices (economy `bulkCost`); food caps n (maxCossacks)
//   ArmyPower               = infantry × power × powerMult                  (smithy, maidan …: collectModifiers)
//   glory / s               = ArmyPower × gloryPerPower × gloryMult
// Glory accrues linearly while the store has room: `gloryGain` caps it at `gloryCapSec` of income (the treasury
// raises it), so a long absence fills the store and stops.
import { ARMY } from '../../content/economy.ts';
import { Big } from '../big.ts';
import { bulkCost, buyCount, cost, type BuyMode, type Priced } from '../economy.ts';
import { collectModifiers, maxCossacks, villageOf, type Modifiers } from '../modifiers.ts';
import type { GameState } from '../state.ts';

/** The infantry's price curve (economy `Priced`): selectors price the hire button with the same offer as a building. */
export const INFANTRY: Priced = { base: ARMY.infantry.unitBase, growth: ARMY.hireGrowth };

/** Price of the Cossack hired when `count` are already in the army. */
export function hireCost(count: number, scale: number, costMult = 1): Big {
  return cost(INFANTRY, count, scale, costMult);
}

/** Price of `n` Cossacks hired at once when `count` are already in the army (geometric sum; 0 for n = 0). */
export function hireBulkCost(count: number, n: number, scale: number, costMult = 1): Big {
  return bulkCost(INFANTRY, count, n, scale, costMult);
}

export type HireCheck =
  { readonly ok: true; readonly cost: Big } | { readonly ok: false; readonly reason: 'count' | 'kharch' | 'ducats' };

/** Whether `n` more Cossacks can be hired now, and for how much (the hire action applies it, M1-10). */
export function canHire(state: GameState, n: number, now = state.time.lastSeen): HireCheck {
  if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: 'count' };
  if (state.army.infantry + n > maxCossacks(state)) return { ok: false, reason: 'kharch' };
  const mods = collectModifiers(state, now);
  const price = hireBulkCost(state.army.infantry, n, villageOf(state).scale, mods.costMult);
  if (price.gt(state.currencies.ducats)) return { ok: false, reason: 'ducats' };
  return { ok: true, cost: price };
}

/** The army size the food allows now (never below the army already hired: a crafted save cannot go negative). */
export function hireLimit(state: GameState): number {
  return Math.max(state.army.infantry, maxCossacks(state));
}

/**
 * How many Cossacks the hire button of `mode` hires now — the same rules as a building's buy button (SPEC §3.2), with
 * the food limit as the cap: ×1/×10/×25 hire exactly n (or the rest up to the limit) only if all of it is affordable,
 * otherwise 0; Max hires as many as the ducats cover. A positive result is always accepted by `canHire`.
 */
export function hireCount(
  state: GameState,
  mode: BuyMode,
  now = state.time.lastSeen,
  mods: Modifiers = collectModifiers(state, now),
): number {
  const have = state.army.infantry;
  return buyCount(
    INFANTRY,
    have,
    state.currencies.ducats,
    villageOf(state).scale,
    hireLimit(state),
    mode,
    mods.costMult,
  );
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
