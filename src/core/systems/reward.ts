// Granting a `Reward` (SPEC §2.5, §3.10; plan M2-22) — shared by story beats and quests (M2-23).
//   incomeMinutes m → ducats = max(m × 60 × incomeRate, m × REWARD.minPerMinute.ducats × scale)
//   gloryMinutes  m → glory  = max(m × 60 × gloryRate,  m × REWARD.minPerMinute.glory  × gloryScale)
//   pysanky       n → n pysanky
// The rates are the steady ones (`steadyModifiers`: no wind of the moment), so a reward is the same whenever it is
// checked — online after a tick or offline at the end of an absence. Granted ducats count into the land's lifetime
// like any earned ducat; the glory store cap is the offline one and does not apply.
import { REWARD, type Reward } from '../../content/rewards.ts';
import type { Village } from '../../content/villages/khortytsia.ts';
import { Big } from '../big.ts';
import { farmIncomeRate, steadyModifiers, villageOf } from '../modifiers.ts';
import type { GameState } from '../state.ts';
import { gloryRate } from './army.ts';

const SEC_PER_MIN = 60;

/** What a reward came to (the event carries it for the UI). */
export type Granted =
  | { readonly currency: 'ducats' | 'glory'; readonly amount: Big }
  | { readonly currency: 'pysanky'; readonly amount: number };

/** Per-second rates a reward in minutes is measured by. */
export interface RewardRates {
  readonly income: Big;
  readonly glory: Big;
}

export function rewardRates(state: GameState): RewardRates {
  const mods = steadyModifiers(state);
  return { income: farmIncomeRate(state, mods), glory: gloryRate(state, mods) };
}

/** The amount of `reward` at `rates` in a land of `scale` / `gloryScale`. */
export function rewardAmount(reward: Reward, rates: RewardRates, land: Pick<Village, 'scale' | 'gloryScale'>): Granted {
  switch (reward.kind) {
    case 'incomeMinutes': {
      const floor = Big.from(reward.minutes * REWARD.minPerMinute.ducats * land.scale);
      return { currency: 'ducats', amount: Big.max(rates.income.mul(reward.minutes * SEC_PER_MIN), floor) };
    }
    case 'gloryMinutes': {
      const floor = Big.from(reward.minutes * REWARD.minPerMinute.glory * land.gloryScale);
      return { currency: 'glory', amount: Big.max(rates.glory.mul(reward.minutes * SEC_PER_MIN), floor) };
    }
    case 'pysanky':
      return { currency: 'pysanky', amount: reward.n };
  }
}

/** Credits `reward` to `state` now. */
export function grantReward(state: GameState, reward: Reward): { state: GameState; granted: Granted } {
  const granted = rewardAmount(reward, rewardRates(state), villageOf(state));
  const c = state.currencies;
  switch (granted.currency) {
    case 'ducats':
      return {
        state: {
          ...state,
          currencies: { ...c, ducats: c.ducats.add(granted.amount) },
          village: { ...state.village, lifetimeDucats: state.village.lifetimeDucats.add(granted.amount) },
        },
        granted,
      };
    case 'glory':
      return { state: { ...state, currencies: { ...c, glory: c.glory.add(granted.amount) } }, granted };
    case 'pysanky':
      return { state: { ...state, currencies: { ...c, pysanky: c.pysanky + granted.amount } }, granted };
  }
}
