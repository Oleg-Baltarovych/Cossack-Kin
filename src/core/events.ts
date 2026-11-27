// Domain events (SPEC §9.2; plan §0): a discriminated union of plain data. The core returns them with every state
// change; the store forwards them to render and audio, which react but never write state. Grows with M1-11/12.
import type { CultureNodeId } from '../content/culture.ts';
import type { HeroId } from '../content/heroes.ts';
import type { SichBuildingId } from '../content/sich.ts';
import type { StoryBeatId } from '../content/story.ts';
import type { RaidTierId, RegionId } from '../content/raids.ts';
import type { RelicId } from '../content/relics.ts';
import type { FarmBuildingId, WindLevel } from '../content/villages/khortytsia.ts';
import type { Big } from './big.ts';
import type { ReturnReport } from './state.ts';
import type { QuestId, QuestKind } from './systems/quests.ts';
import type { Granted } from './systems/reward.ts';

/** The currencies a raid claim credited. */
export interface RaidGranted {
  readonly ducats: Big;
  readonly glory: Big;
  readonly pysanky: number;
}

/** Why an action did nothing (the UI explains it; the state is `advance(s, now).state` — nothing else changes). */
export type RejectReason =
  | 'ducats'
  | 'glory'
  | 'locked'
  | 'max'
  | 'kharch'
  | 'count'
  | 'noReport'
  | 'notDone'
  | 'range'
  /** buyCulture: the node's prerequisites (a node of the row above at rank ≥ 1, or both for the top) do not hold. */
  | 'prereq'
  /** startRaid: the slot is running or returned (claim it first). */
  | 'slotBusy'
  /** startRaid: ArmyPower < minPowerShare × P. */
  | 'power'
  /** claimRaid / claimAllRaids: nothing returned in the slot (idle or still on its way). */
  | 'notReturned';

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
  /** A story beat fired (once); its reward, if any, is already credited (SPEC §2.5). */
  | { readonly type: 'StoryBeatReached'; readonly id: StoryBeatId; readonly granted: Granted | null }
  /** A hero arrived at level 1 with his story beat (right after its StoryBeatReached; may come from time — M4-04). */
  | { readonly type: 'HeroJoined'; readonly id: HeroId }
  /** A culture rank was learnt (from the buyCulture action only: one rank, `to` = `from` + 1). */
  | { readonly type: 'CultureBought'; readonly id: CultureNodeId; readonly from: number; readonly to: number }
  /** A hero was levelled (from the levelHero action only). */
  | { readonly type: 'HeroLevelled'; readonly id: HeroId; readonly from: number; readonly to: number }
  /** A quest's goal was reached (once per quest); its reward waits for `claimQuest` (SPEC §3.10). */
  | { readonly type: 'QuestCompleted'; readonly kind: QuestKind; readonly id: QuestId }
  /** A finished quest was claimed; `granted` is null for a chore past the day's reward limit. */
  | { readonly type: 'QuestClaimed'; readonly kind: QuestKind; readonly id: QuestId; readonly granted: Granted | null }
  /** A raid left (from the startRaid action only); its result stays hidden until the claim (§0.1 П4). */
  | {
      readonly type: 'RaidStarted';
      readonly slot: number;
      readonly region: RegionId;
      readonly tier: RaidTierId;
      readonly returnAt: number;
    }
  /** A raid came back (from time: a tick, an absence, a load), exactly once per raid (ADR 012). */
  | { readonly type: 'RaidReturned'; readonly slot: number; readonly region: RegionId; readonly success: boolean }
  /** A returned raid was claimed (action only): `granted` is exactly what was rolled at the start. */
  | {
      readonly type: 'RaidClaimed';
      readonly slot: number;
      /** The raid claimed (the chest window names it; the slot is idle by the time the event arrives — M3-12). */
      readonly tier: RaidTierId;
      readonly region: RegionId;
      readonly success: boolean;
      readonly granted: RaidGranted;
      readonly relic: RelicId | null;
    }
  /** «Ще раз» claimed the raid but could not start it again (the claim stands; action only). */
  | {
      readonly type: 'RaidAgainRefused';
      readonly slot: number;
      readonly tier: RaidTierId;
      readonly reason: 'range' | 'slotBusy' | 'power';
    }
  /** A relic joined the collection (with its RaidClaimed; action only). */
  | { readonly type: 'RelicFound'; readonly id: RelicId }
  | { readonly type: 'ActionRejected'; readonly action: string; readonly reason: RejectReason }
  /** The whole state was replaced (a loaded save or a reset): listeners re-read it from scratch. */
  | { readonly type: 'StateReplaced' };
