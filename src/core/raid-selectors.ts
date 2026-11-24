// Raid view selectors (SPEC §3.4, §6.1; plan M3-06, §0, §0.1 П3–П6): what the Sich tab, the map, the return window,
// the treasury and the scene read of raids. Pure reads of the state at its own clock (`time.lastSeen`); the slot
// countdown and «returned» take the live `now` the UI already ticks the HUD with (core does not tick for a timer).
// A running slot's view carries no result: success and loot are rolled at start but stay hidden until «Забрати» (П4) —
// enforced by the type, not by the UI's discipline. The scene's view has no economy numbers at all.
import { RAID_TIER_IDS, RAIDS, type RaidTierId, type RegionId, type RumorId } from '../content/raids.ts';
import { RELIC_DEFS, type RelicId } from '../content/relics.ts';
import { MS_PER_SEC, previewRaid, raidTier, type LootAmounts, type RaidSlot } from './systems/raids.ts';
import type { GameState } from './state.ts';

const PERCENT = 100;

/** The open slots of the state (closed ones are always idle, the save gate; M4+ open more). */
function openSlots(state: GameState): readonly RaidSlot[] {
  return state.raids.slots.slice(0, RAIDS.slots);
}

export type RaidSlotView =
  | { readonly kind: 'idle'; readonly slot: number }
  | {
      readonly kind: 'running';
      readonly slot: number;
      readonly tier: RaidTierId;
      readonly region: RegionId;
      /** ms */
      readonly startedAt: number;
      /** ms, absolute: the UI shows «повернуться о 21:40» from it (П10). */
      readonly returnAt: number;
      /** Whole seconds left, rounded up (never 0 while on the road). */
      readonly leftSec: number;
      /** Share of the road behind, [0, 1) (the road bar). */
      readonly progress: number;
    }
  | {
      readonly kind: 'returned';
      readonly slot: number;
      readonly tier: RaidTierId;
      readonly region: RegionId;
      readonly returnAt: number;
    };

/**
 * One view per open slot at `now` (ms). A running raid whose `returnAt ≤ now` shows as returned before the store
 * advances (the core turns it so on the next tick, `returnRaids`); the result is revealed only by the claim's event.
 */
export function raidSlotsView(state: GameState, now: number): readonly RaidSlotView[] {
  return openSlots(state).map((x, slot): RaidSlotView => {
    if (x.kind === 'idle') return { kind: 'idle', slot };
    const { tier, region, startedAt, returnAt } = x.raid;
    if (x.kind === 'returned' || returnAt <= now) return { kind: 'returned', slot, tier, region, returnAt };
    const span = returnAt - startedAt;
    return {
      kind: 'running',
      slot,
      tier,
      region,
      startedAt,
      returnAt,
      leftSec: Math.ceil((returnAt - now) / MS_PER_SEC),
      progress: span > 0 ? Math.max(0, (now - startedAt) / span) : 0,
    };
  });
}

/** Why an offer's «Вирушити» is off: no free open slot, or too little power (≥ minPowerShare × P). */
export type RaidOfferBlock = 'slotBusy' | 'power' | null;

/** An offer card (§0.1 П3, П5): exactly the numbers the start would roll (`previewRaid`: shown = granted). */
export interface RaidOfferView {
  readonly tier: RaidTierId;
  readonly region: RegionId;
  readonly durationSec: number;
  /** The recommended power P. */
  readonly p: number;
  readonly power: number;
  readonly chance: number;
  /** Power still missing for chance 1, whole and rounded up; 0 at chance 1. */
  readonly powerToFull: number;
  /** The rumour this start would use (null: none on this offer, or used today). */
  readonly rumor: RumorId | null;
  readonly success: LootAmounts;
  readonly failure: LootAmounts;
  /** Chances on a success. */
  readonly relicChance: number;
  readonly pysankyChance: number;
  /** «Старі козаки кажуть: реліквія близько»: a success of this raid is certain to give a relic. */
  readonly relicSure: boolean;
  readonly blocked: RaidOfferBlock;
}

export interface RaidBoardView {
  /** The first idle open slot — where «Вирушити» sends (null: all busy). */
  readonly freeSlot: number | null;
  /** Today's board, one offer per tier in tier order. */
  readonly offers: readonly RaidOfferView[];
}

export function raidBoardView(state: GameState): RaidBoardView {
  const free = openSlots(state).findIndex((x) => x.kind === 'idle');
  const freeSlot = free < 0 ? null : free;
  const offers = RAID_TIER_IDS.map((tier): RaidOfferView => {
    const pre = previewRaid(state, tier);
    return {
      tier,
      region: pre.region,
      durationSec: raidTier(tier).durationSec,
      p: pre.p,
      power: pre.power,
      chance: pre.chance,
      powerToFull: pre.chance >= 1 ? 0 : Math.ceil(pre.p - pre.power),
      rumor: pre.rumor,
      success: pre.success,
      failure: pre.failure,
      relicChance: pre.relicChance,
      pysankyChance: pre.pysankyChance,
      relicSure: pre.relicSure,
      blocked: freeSlot === null ? 'slotBusy' : pre.blocked,
    };
  });
  return { freeSlot, offers };
}

/** A «загін повернувся» notification (the M6 platform schedules them, §3.9). */
export interface RaidAlert {
  /** ms: the last return of the group, so every raid it counts is home. */
  readonly at: number;
  readonly count: number;
}

/**
 * The notification hook (§0.1 П6, Q18): running raids in return order, each group of returns within
 * `RAIDS.alertMergeSec` of its first one merged into one alert. Returned and idle slots need none.
 */
export function raidAlerts(state: GameState): readonly RaidAlert[] {
  const times = state.raids.slots.flatMap((x) => (x.kind === 'running' ? [x.raid.returnAt] : [])).sort((a, b) => a - b);
  const out: { first: number; at: number; count: number }[] = [];
  for (const t of times) {
    const last = out[out.length - 1];
    if (last && t - last.first <= RAIDS.alertMergeSec * MS_PER_SEC) {
      last.at = t;
      last.count++;
    } else {
      out.push({ first: t, at: t, count: 1 });
    }
  }
  return out.map(({ at, count }) => ({ at, count }));
}

/** A relic of the collection («Ще → Скарбниця»): found, or a silhouette with its hint. */
export interface RelicView {
  readonly id: RelicId;
  readonly found: boolean;
  readonly nameKey: string;
  /** Fills `{value}` with `value`. */
  readonly textKey: string;
  readonly factKey: string;
  /** The bonus in whole percent (share × 100; content test: shares are whole percents). */
  readonly value: number;
}

export function relicsView(state: GameState): readonly RelicView[] {
  return RELIC_DEFS.map((r) => ({
    id: r.id,
    found: state.relics.includes(r.id),
    nameKey: r.nameKey,
    textKey: r.textKey,
    factKey: r.factKey,
    value: Math.round(r.effect.share * PERCENT),
  }));
}

/** What render may know of raids (plan §0): which open slots' squads are away or back — no economy numbers. */
export interface RaidSceneView {
  readonly slots: readonly ('idle' | 'away' | 'back')[];
}

export function raidSceneView(state: GameState): RaidSceneView {
  return {
    slots: openSlots(state).map((x) => (x.kind === 'idle' ? 'idle' : x.kind === 'running' ? 'away' : 'back')),
  };
}
