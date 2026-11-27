// Raid view selectors (SPEC §3.4, §6.1; plan M3-06, §0, §0.1 П3–П6): what the Sich tab, the map, the return window,
// the treasury and the scene read of raids. Pure reads of the state at its own clock (`time.lastSeen`); the slot
// countdown and «returned» take the live `now` the UI already ticks the HUD with (core does not tick for a timer).
// A running slot's view carries no result: success and loot are rolled at start but stay hidden until «Забрати» (П4) —
// enforced by the type, not by the UI's discipline. The scene's view has no economy numbers at all.
import { RAID_TIER_IDS, RAIDS, tierRank, type RaidTierId, type RegionId, type RumorId } from '../content/raids.ts';
import { RELIC_DEFS, RELICS, type RelicId } from '../content/relics.ts';
import {
  MS_PER_SEC,
  powerEnough,
  previewRaid,
  raidPower,
  raidReady,
  raidTier,
  relicOnTier,
  type LootAmounts,
  type RaidSlot,
} from './systems/raids.ts';
import type { GameState } from './state.ts';
import { chainQuest } from './systems/quests.ts';

const PERCENT = 100;
/**
 * Floating-point slack for a whole percent: a share written as a whole percent (0.29) is 28.999…96 after × 100 in
 * binary, and must still read 29. Far below any real difference between two chances (content shares are ≥ 0.01).
 */
const PERCENT_EPS = 1e-9;

/** A share (0…1) as the whole percent the player reads: rounded down, so a shown chance never overstates the real one. */
export function wholePercent(share: number): number {
  return Math.floor(share * PERCENT + PERCENT_EPS);
}

/** The open slots of the state (closed ones are always idle, the save gate; M4+ open more). */
function openSlots(state: GameState): readonly RaidSlot[] {
  return state.raids.slots.slice(0, RAIDS.slots);
}

/** Why a slot card's button is off: too little power (no Cossack for the lowest tier, or for «Ще раз» of its tier). */
export type RaidSlotBlock = 'power' | null;

export type RaidSlotView =
  | {
      readonly kind: 'idle';
      readonly slot: number;
      /** «Обрати похід»: 'power' while the army cannot start even the lowest tier (`raidReady`). */
      readonly blocked: RaidSlotBlock;
    }
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
      /**
       * «Ще раз» (§0.1 П12): claim, then start the same tier on today's board from this slot — 'power' when the army
       * is too weak for that tier now (the claim itself frees the slot).
       */
      readonly again: RaidSlotBlock;
    };

/**
 * One view per open slot at `now` (ms). A running raid whose `returnAt ≤ now` shows as returned before the store
 * advances (the core turns it so on the next tick, `returnRaids`); the result is revealed only by the claim's event.
 */
export function raidSlotsView(state: GameState, now: number): readonly RaidSlotView[] {
  const power = raidPower(state);
  const ready: RaidSlotBlock = raidReady(state) ? null : 'power';
  return openSlots(state).map((x, slot): RaidSlotView => {
    if (x.kind === 'idle') return { kind: 'idle', slot, blocked: ready };
    const { tier, region, startedAt, returnAt } = x.raid;
    if (x.kind === 'returned' || returnAt <= now)
      return { kind: 'returned', slot, tier, region, returnAt, again: powerEnough(power, tier) ? null : 'power' };
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

/**
 * The red dot on «Січ» (SPEC §6.7, §0.1 П1): some open slot's raid is back at `now` and waits for «Забрати». An idle
 * slot never counts — an empty slot is no debt.
 */
export function raidClaimable(state: GameState, now: number): boolean {
  return openSlots(state).some((x) => x.kind === 'returned' || (x.kind === 'running' && x.raid.returnAt <= now));
}

/** Why an offer's «Вирушити» is off: no free open slot, or too little power (≥ minPowerShare × P). */
export type RaidOfferBlock = 'slotBusy' | 'power' | null;

/** An offer card (§0.1 П3, П5): exactly the numbers the start would roll (`previewRaid`: shown = granted). */
export interface RaidOfferView {
  readonly tier: RaidTierId;
  readonly region: RegionId;
  /** The rolled duration: the tier's × the steady `raidTimeMult` (the Характерник, M4-06), as `returnAt` will store. */
  readonly durationSec: number;
  /** The recommended power P. */
  readonly p: number;
  readonly power: number;
  readonly chance: number;
  /** `chance` as the card reads it (`wholePercent`). */
  readonly chancePct: number;
  /** Power still missing for chance 1, whole and rounded up; 0 at chance 1. */
  readonly powerToFull: number;
  /** Power still missing to set off at all (≥ minPowerShare × P), whole and rounded up; 0 unless blocked by power. */
  readonly powerToStart: number;
  /** The rumour this start would use (null: none on this offer, or used today). */
  readonly rumor: RumorId | null;
  readonly success: LootAmounts;
  readonly failure: LootAmounts;
  /** Chances on a success. */
  readonly relicChance: number;
  readonly pysankyChance: number;
  readonly relicPct: number;
  readonly pysankyPct: number;
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
      durationSec: pre.durationMs / MS_PER_SEC,
      p: pre.p,
      power: pre.power,
      chance: pre.chance,
      chancePct: wholePercent(pre.chance),
      powerToFull: pre.chance >= 1 ? 0 : Math.ceil(pre.p - pre.power),
      powerToStart: pre.blocked === 'power' ? Math.ceil(RAIDS.minPowerShare * pre.p - pre.power) : 0,
      rumor: pre.rumor,
      success: pre.success,
      failure: pre.failure,
      relicChance: pre.relicChance,
      pysankyChance: pre.pysankyChance,
      relicPct: wholePercent(pre.relicChance),
      pysankyPct: wholePercent(pre.pysankyChance),
      relicSure: pre.relicSure,
      blocked: freeSlot === null ? 'slotBusy' : pre.blocked,
    };
  });
  return { freeSlot, offers };
}

/**
 * The onboarding marker (§0.1 П9, Q7): while the active step of «Наказ кошового» asks for a raid to be sent (`raid1`),
 * the map opens on the shortest tier — the sure 5-minute scouting (Q19) — and lights it; null otherwise.
 */
export function raidGuide(state: GameState): RaidTierId | null {
  const q = chainQuest(state);
  if (!q || q.done || q.goal.kind !== 'count' || q.goal.stat !== 'raidsSent') return null;
  return RAID_TIER_IDS[0];
}

/**
 * The offer the map opens on (M3-11 review): the onboarding tier (`raidGuide`); else today's rumour when the army
 * can take it (a bonus worth a look, never an obligation — П2); else the longest tier the army can take now; else (no
 * squad free, or nothing in reach) the first tier. Null only for an empty board.
 */
export function raidSuggested(state: GameState): RaidTierId | null {
  const guide = raidGuide(state);
  if (guide !== null) return guide;
  const { offers } = raidBoardView(state);
  const rumor = offers.find((o) => o.rumor !== null && o.blocked === null);
  if (rumor) return rumor.tier;
  const open = offers.filter((o) => o.blocked === null);
  return (open[open.length - 1] ?? offers[0])?.tier ?? null;
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

/** The treasury's hint under the silhouettes (§0.1 П5): where to look, and whether the pity makes the next find sure. */
export interface RelicHintView {
  /** The shortest tier that can find a relic still missing (a relic chance, or the pity): «від 30 хв походу». */
  readonly fromTier: RaidTierId;
  /**
   * «Старі козаки кажуть: реліквія близько» — the next success of a tier ≥ `fromTier` is sure to give one: the
   * same fact as the offer card's `relicSure` (one source, `previewRaid`).
   */
  readonly near: boolean;
}

/**
 * Null once every relic of the collection is found (nothing left to look for). The tier is the shortest that can find
 * one of those left (M4-06: only «Кобза діда» left → from 1 h); «близько» is that tier's `relicSure`.
 */
export function relicHint(state: GameState): RelicHintView | null {
  const left = RELIC_DEFS.filter((r) => !state.relics.includes(r.id));
  if (left.length === 0) return null;
  const pityRank = tierRank(RELICS.pityMinTier);
  const fromTier =
    RAID_TIER_IDS.find(
      (t) => (raidTier(t).relicChance > 0 || tierRank(t) >= pityRank) && left.some((r) => relicOnTier(r, t)),
    ) ?? RELICS.pityMinTier;
  return { fromTier, near: previewRaid(state, fromTier).relicSure };
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
