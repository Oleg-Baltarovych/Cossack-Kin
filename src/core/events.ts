// Domain events (SPEC §9.2; plan §0): a discriminated union of plain data. The core returns them with every state
// change; the store forwards them to render and audio, which react but never write state. Grows with M1-11/12.
import type { SichBuildingId } from '../content/sich.ts';
import type { FarmBuildingId, WindLevel } from '../content/villages/khortytsia.ts';
import type { Big } from './big.ts';
import type { ReturnReport } from './state.ts';

/** Why an action did nothing (the UI explains it; the state is unchanged). */
export type RejectReason = 'ducats' | 'glory' | 'locked' | 'max' | 'kharch' | 'count' | 'noReport';

export type GameEvent =
  /** The wind changed at time `at` (ms). */
  | { readonly type: 'WindChanged'; readonly at: number; readonly from: WindLevel; readonly to: WindLevel }
  | { readonly type: 'BuildingUpgraded'; readonly id: FarmBuildingId; readonly from: number; readonly to: number }
  | { readonly type: 'SichUpgraded'; readonly id: SichBuildingId; readonly from: number; readonly to: number }
  /** A building reached a new visual tier (a milestone). */
  | {
      readonly type: 'TierReached';
      readonly zone: 'farm' | 'sich';
      readonly id: FarmBuildingId | SichBuildingId;
      readonly tier: number;
    }
  | { readonly type: 'CossackHired'; readonly n: number; readonly total: number }
  | { readonly type: 'Tapped'; readonly amount: Big }
  | { readonly type: 'ReturnClaimed'; readonly ducats: Big; readonly glory: Big }
  /** The player came back: the absence was counted into `report` (waiting for claimReturn). */
  | { readonly type: 'OfflineApplied'; readonly report: ReturnReport }
  | { readonly type: 'ActionRejected'; readonly action: string; readonly reason: RejectReason };
