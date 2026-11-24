// Raid formulas (SPEC §3.4, §2.6; plan M3-03; ADR 012). Pure functions; the state types below are persisted in save v4
// (M3-04, gate in state.ts); the start, the claim and the return (`startRaid`, `claimRaid`, `returnRaids`, M3-05) are
// called by actions.ts and advance/offline. Numbers are in content/raids.ts and content/relics.ts.
//   power   = ArmyPower at the steady rates (a snapshot: the army stays home, Q1)
//   start   only when power ≥ minPowerShare × P
//   chance  = clamp(power / P, chanceMin, 1)
//   loot    = max(rate × lootSec, REWARD floor) × lootMult (ducats; glory alike with gloryLootSec) at steadyModifiers,
//             so the loot shown on the card is the loot granted (Q4); a failure gives failShare of it, never 0
//   success → pysanky (chance per tier) and a relic (chance per tier × relicChanceMult, only among the unfound ones,
//             sure on the pityThreshold-th qualifying success; all found → the relic chance goes to the pysanky)
// lootMult and relicChanceMult are the steady Modifiers' (treasury, relics: only via collectModifiers) + the rumour's
// share. Relic and pysanky chances are clamped to 1 after the multipliers. Everything random is drawn once at start from
// `state.rng`, always the same number of draws in the same order (ROLL_DRAWS) — that order is frozen (golden test).
// The daily board is not state: a pure function of (seed, day), day = the quest day (`questDay`, §3.9).
import {
  BOARD,
  isRaidTierId,
  RAID_TIER_IDS,
  tierRank,
  RAID_TIERS,
  RAIDS,
  REGIONS,
  type RaidTier,
  type RaidTierId,
  type RegionId,
  type RumorEffect,
  type RumorId,
} from '../../content/raids.ts';
import { RELIC_DEFS, RELICS, pityThreshold, type RelicId } from '../../content/relics.ts';
import { Big } from '../big.ts';
import type { GameEvent } from '../events.ts';
import { steadyModifiers, villageOf } from '../modifiers.ts';
import { hash32, next, pickStable, type Rng } from '../rng.ts';
import type { GameState } from '../state.ts';
import { armyPower } from './army.ts';
import { questDay } from './quests.ts';
import { rewardAmount, rewardRates } from './reward.ts';

/** ms per second (raid times are absolute ms; durations in content are seconds). */
export const MS_PER_SEC = 1000;
const SEC_PER_MIN = 60;

// --- state (persisted in save v4, M3-04) -----------------------------------------------------------------------

export interface RaidLoot {
  readonly ducats: Big;
  readonly glory: Big;
  readonly pysanky: number;
  readonly relic: RelicId | null;
}

/** Everything a raid will bring, rolled once at start and stored (ADR 012). */
export interface RaidRoll {
  readonly region: RegionId;
  readonly tier: RaidTierId;
  /** ms */
  readonly startedAt: number;
  /** ms, absolute (§3.8) */
  readonly returnAt: number;
  readonly success: boolean;
  /** Whether the rumour of the day was used by this start. */
  readonly rumor: boolean;
  readonly loot: RaidLoot;
}

export type RaidSlot =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly raid: RaidRoll }
  | { readonly kind: 'returned'; readonly raid: RaidRoll };

export interface RaidsState {
  /** Length RAIDS.maxSlots; slots past the open ones are idle. */
  readonly slots: readonly RaidSlot[];
  /** The quest day whose rumour was used (−1: never). */
  readonly rumorDay: number;
  /** Qualifying successes without a relic since the last find (Q5, Q16). */
  readonly pity: number;
}

// --- content lookups -------------------------------------------------------------------------------------------

export function raidTier(id: RaidTierId): RaidTier {
  const t = RAID_TIERS.find((x) => x.id === id);
  // RAID_TIERS lists every RaidTierId (content test M3-02).
  if (!t) throw new Error(`raids: no tier ${id}`);
  return t;
}

/** Whether successes of `tier` count towards the pity and are guaranteed by it. */
function pityCounts(tier: RaidTierId): boolean {
  return tierRank(tier) >= tierRank(RELICS.pityMinTier);
}

function rumorShare(rumor: RumorId | null, kind: RumorEffect['kind']): number {
  const effect = BOARD.rumors.find((r) => r.id === rumor)?.effect;
  return effect?.kind === kind ? effect.share : 0;
}

// --- power, chance, start ----------------------------------------------------------------------------------------

/** The army power a raid takes as its snapshot (steady rates: no wind of the moment). */
export function raidPower(state: GameState): number {
  return armyPower(state, steadyModifiers(state));
}

/** Success chance at `power` against the recommended power `p` (SPEC §3.4). */
export function chance(power: number, p: number): number {
  return Math.min(1, Math.max(RAIDS.chanceMin, power / p));
}

export type StartCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'range' | 'slotBusy' | 'power' };

/** Whether `power` may start `tier` at all (≥ minPowerShare × P; the slot is the caller's business). */
export function powerEnough(power: number, tier: RaidTierId): boolean {
  return power >= RAIDS.minPowerShare * raidTier(tier).power;
}

/**
 * Whether the army can start a raid at all: power enough for the lowest tier (busy slots do not count — they come
 * back by themselves). Quests offer raid chores only then (plan M3-07 review: no chore the player cannot begin).
 */
export function raidReady(state: GameState): boolean {
  const lowest = Math.min(...RAID_TIERS.map((t) => t.power));
  return raidPower(state) >= RAIDS.minPowerShare * lowest;
}

/** Whether a raid of `tier` can start in `slot` (the startRaid action applies it, M3-05). */
export function canStart(state: GameState, slot: number, tier: RaidTierId): StartCheck {
  if (!Number.isInteger(slot) || slot < 0 || slot >= RAIDS.slots) return { ok: false, reason: 'range' };
  if (state.raids.slots[slot]?.kind !== 'idle') return { ok: false, reason: 'slotBusy' };
  if (!powerEnough(raidPower(state), tier)) return { ok: false, reason: 'power' };
  return { ok: true };
}

// --- the daily board ---------------------------------------------------------------------------------------------

export interface RaidOffer {
  readonly tier: RaidTierId;
  readonly region: RegionId;
  /** The rumour of the day sits on exactly one offer. */
  readonly rumor: RumorId | null;
}

/**
 * The board of `day` (SPEC §2.6): one offer per tier, in tier order, each in a region of its own — tier i picks
 * among the regions the earlier tiers left (`pickStable`, keyed by the day) — and one rumour on a `BOARD.rumorTiers`
 * tier. Streams of `hash32(seed, BOARD.salt)`: i < tiers — the tier's region, tiers — the rumour's tier, tiers + 1 —
 * which rumour.
 */
export function raidBoard(seed: number, day: number): readonly RaidOffer[] {
  const board = hash32(seed, BOARD.salt);
  const n = RAID_TIER_IDS.length;
  const rumorTiers: readonly RaidTierId[] = BOARD.rumorTiers;
  const rumorTier = rumorTiers[pickStable(hash32(board, n), day, rumorTiers.length)];
  const rumor = BOARD.rumors[pickStable(hash32(board, n + 1), day, BOARD.rumors.length)]?.id;
  // BOARD lists at least one rumour and one rumour tier (content test M3-02).
  if (rumorTier === undefined || rumor === undefined) throw new Error('raids: no rumour on the board');
  const left: RegionId[] = REGIONS.khortytsia.map((r) => r.id);
  return RAID_TIER_IDS.map((tier, i) => {
    const [region] = left.splice(pickStable(hash32(board, i), day, left.length), 1);
    // REGIONS has more regions than there are tiers (content test M3-02).
    if (region === undefined) throw new Error('raids: fewer regions than tiers');
    return { tier, region, rumor: tier === rumorTier ? rumor : null };
  });
}

/** The offer of `tier` on today's board and whether its rumour is still unused today (Q3). */
function offerOf(state: GameState, tier: RaidTierId): { offer: RaidOffer; rumor: RumorId | null } {
  const day = questDay(state);
  const offer = raidBoard(state.seed, day).find((o) => o.tier === tier);
  if (!offer) throw new Error(`raids: no offer for ${tier}`);
  return { offer, rumor: state.raids.rumorDay === day ? null : offer.rumor };
}

// --- loot and chances ---------------------------------------------------------------------------------------------

export interface LootAmounts {
  readonly ducats: Big;
  readonly glory: Big;
}

/** Ducats and glory of `tier` on success and on failure, at the steady rates (Q4) and `lootMult`. */
export function lootOf(
  state: GameState,
  tier: RaidTierId,
  lootMult: number,
): { readonly success: LootAmounts; readonly failure: LootAmounts } {
  const t = raidTier(tier);
  const rates = rewardRates(state);
  const land = villageOf(state);
  const ducats = rewardAmount({ kind: 'incomeMinutes', minutes: t.lootSec / SEC_PER_MIN }, rates, land);
  const glory = rewardAmount({ kind: 'gloryMinutes', minutes: t.gloryLootSec / SEC_PER_MIN }, rates, land);
  const success = { ducats: Big.from(ducats.amount).mul(lootMult), glory: Big.from(glory.amount).mul(lootMult) };
  return {
    success,
    failure: { ducats: success.ducats.mul(RAIDS.failShare), glory: success.glory.mul(RAIDS.failShare) },
  };
}

/**
 * The relics a roll must not give again: the found ones and those already rolled into a running or returned slot
 * (two slots must not bring the same relic; what a card showed is what the claim grants, so no dedupe at claim).
 */
export function heldRelics(state: GameState): readonly RelicId[] {
  const held = new Set<RelicId>(state.relics);
  for (const slot of state.raids.slots) {
    if (slot.kind !== 'idle' && slot.raid.loot.relic !== null) held.add(slot.raid.loot.relic);
  }
  return [...held];
}

/** The relics not held, in content order. */
function unfound(held: readonly RelicId[]): readonly RelicId[] {
  // M5: filter by `village` (the land of the raid) once land 2 has relics; every relic is land 1's until then.
  return RELIC_DEFS.filter((r) => !held.includes(r.id)).map((r) => r.id);
}

/** A relic among those not `held` by `u` ∈ [0, 1); null when all are held (no duplicates, Q5). */
export function pickRelic(held: readonly RelicId[], u: number): RelicId | null {
  const left = unfound(held);
  return left[Math.min(left.length - 1, Math.floor(u * left.length))] ?? null;
}

interface Odds {
  /** Relic chance on a success (0 when all are found). */
  readonly relic: number;
  /** Pysanky chance on a success. */
  readonly pysanky: number;
  /** A success is certain to give a relic (the pity). */
  readonly relicSure: boolean;
  /** A success without a relic moves the pity counter (tier ≥ pityMinTier and a relic left to find). */
  readonly pityCounts: boolean;
}

/** Chances on a success after the multipliers, each clamped to 1 (ADR 012). */
function oddsOf(state: GameState, tier: RaidTierId, rumor: RumorId | null): Odds {
  const t = raidTier(tier);
  const held = heldRelics(state);
  const relic = t.relicChance * (steadyModifiers(state).relicChanceMult + rumorShare(rumor, 'relic'));
  if (unfound(held).length === 0) {
    return { relic: 0, pysanky: Math.min(1, t.pysankyChance + relic), relicSure: false, pityCounts: false };
  }
  const counts = pityCounts(tier);
  const relicSure = counts && state.raids.pity >= pityThreshold(held.length) - 1;
  return {
    relic: relicSure ? 1 : Math.min(1, relic),
    pysanky: Math.min(1, t.pysankyChance),
    relicSure,
    pityCounts: counts,
  };
}

/** lootMult of a start: the modifiers' (the treasury, the relics) + the rumour's share. */
function lootMultOf(state: GameState, rumor: RumorId | null): number {
  return steadyModifiers(state).lootMult + rumorShare(rumor, 'loot');
}

// --- the card and the roll ------------------------------------------------------------------------------------------

/** What the offer card shows before the start (§0.1 П3, П5): exactly what `rollRaid` would store. */
export interface RaidPreview {
  readonly tier: RaidTierId;
  readonly region: RegionId;
  /** The recommended power P. */
  readonly p: number;
  readonly power: number;
  readonly chance: number;
  /** Why the start is off (the slot is the slot card's business). */
  readonly blocked: 'power' | null;
  /** The rumour this start would use (null: none on this offer, or used today). */
  readonly rumor: RumorId | null;
  readonly success: LootAmounts;
  readonly failure: LootAmounts;
  /** Chances on a success. */
  readonly relicChance: number;
  readonly pysankyChance: number;
  /** A success is certain to give a relic («Старі козаки кажуть: реліквія близько»). */
  readonly relicSure: boolean;
  /** A success without a relic moves the pity counter. */
  readonly pityCounts: boolean;
}

/**
 * The card of `tier`. `state` must already be advanced to the moment shown: the day of the board and of the rumour is
 * `questDay(state)`, from `maxSeen`.
 */
export function previewRaid(state: GameState, tier: RaidTierId): RaidPreview {
  const { offer, rumor } = offerOf(state, tier);
  const power = raidPower(state);
  const p = raidTier(tier).power;
  const odds = oddsOf(state, tier, rumor);
  const loot = lootOf(state, tier, lootMultOf(state, rumor));
  return {
    tier,
    region: offer.region,
    p,
    power,
    chance: chance(power, p),
    blocked: powerEnough(power, tier) ? null : 'power',
    rumor,
    success: loot.success,
    failure: loot.failure,
    relicChance: odds.relic,
    pysankyChance: odds.pysanky,
    relicSure: odds.relicSure,
    pityCounts: odds.pityCounts,
  };
}

/** Draws of one roll, in order: success, pysanky, pysanky count, relic, which relic. Frozen (saves replay it). */
function draws(rng0: Rng): { u: readonly [number, number, number, number, number]; rng: Rng } {
  const [a, rng1] = next(rng0);
  const [b, rng2] = next(rng1);
  const [c, rng3] = next(rng2);
  const [d, rng4] = next(rng3);
  const [e, rng5] = next(rng4);
  return { u: [a, b, c, d, e], rng: rng5 };
}

/**
 * Rolls a raid of `tier` started at `now` (ms): success, pysanky and relic from `state.rng`, loot at the steady rates
 * (the card's numbers, `previewRaid`). `state` must already be advanced to `now` (the startRaid action calls it after
 * `advance`, M3-05): the board day and the rumour come from `maxSeen`. Returns the roll, the advanced RNG, the new
 * pity counter and the new `rumorDay` (the action stores all four). Does not check `canStart`.
 */
export function rollRaid(
  state: GameState,
  tier: RaidTierId,
  now: number,
): { roll: RaidRoll; rng: Rng; pity: number; rumorDay: number } {
  const pre = previewRaid(state, tier);
  const { u, rng } = draws(state.rng);
  const [uSuccess, uPysanky, uCount, uRelic, uWhich] = u;
  const success = uSuccess < pre.chance;
  const { min, max } = RAIDS.pysanky;
  const pysanky = success && uPysanky < pre.pysankyChance ? min + Math.floor(uCount * (max - min + 1)) : 0;
  const relic = success && uRelic < pre.relicChance ? pickRelic(heldRelics(state), uWhich) : null;
  const pity = relic !== null ? 0 : success && pre.pityCounts ? state.raids.pity + 1 : state.raids.pity;
  const amounts = success ? pre.success : pre.failure;
  return {
    roll: {
      region: pre.region,
      tier,
      startedAt: now,
      // Modifiers.raidTimeMult (Характерник, M4) is 1 and not applied: the v4 gate checks this to the ms (modifiers.ts).
      returnAt: now + raidTier(tier).durationSec * MS_PER_SEC,
      success,
      rumor: pre.rumor !== null,
      loot: { ducats: amounts.ducats, glory: amounts.glory, pysanky, relic },
    },
    rng,
    pity,
    rumorDay: pre.rumor !== null ? questDay(state) : state.raids.rumorDay,
  };
}

// --- start, return, claim (M3-05) ------------------------------------------------------------------------------------

const withSlot = (slots: readonly RaidSlot[], i: number, slot: RaidSlot): RaidSlot[] =>
  slots.map((x, j) => (j === i ? slot : x));

/**
 * Sends a raid of `tier` from `slot` at `at` — the action's effective time (the state is advanced to it, so `at` lies
 * in [created, maxSeen]; never a raw clock behind the game's time). Stores the roll, the RNG, pity and rumorDay of
 * `rollRaid`, counts it sent. A refusal is its reason; the caller keeps the state.
 */
export function startRaid(
  state: GameState,
  slot: number,
  tier: RaidTierId,
  at: number,
): { state: GameState; events: GameEvent[] } | 'range' | 'slotBusy' | 'power' {
  // A stale or forged tier id is refused, never a throw (raidTier would).
  if (!isRaidTierId(tier)) return 'range';
  const check = canStart(state, slot, tier);
  if (!check.ok) return check.reason;
  const { roll, rng, pity, rumorDay } = rollRaid(state, tier, at);
  return {
    state: {
      ...state,
      rng,
      raids: { slots: withSlot(state.raids.slots, slot, { kind: 'running', raid: roll }), rumorDay, pity },
      stats: { ...state.stats, raidsSent: state.stats.raidsSent + 1 },
    },
    events: [{ type: 'RaidStarted', slot, region: roll.region, tier, returnAt: roll.returnAt }],
  };
}

/** A raid back by `upTo`, with its return time (advance merges it into the time order of its events). */
export interface RaidReturn {
  readonly at: number;
  readonly event: Extract<GameEvent, { type: 'RaidReturned' }>;
}

/**
 * Every running raid with `returnAt ≤ upTo` (ms) becomes returned — the `returnAt` breakpoint of `advance` (ADR 012;
 * no rate changes, so only the state and the event). Returns in time order (slot order on a tie). The same state
 * object when nothing came back. «≤ upTo», not «∈ (lastSeen, upTo]»: the game never leaves a running raid with
 * `returnAt ≤ lastSeen` (a start is at lastSeen, every forward move returns up to its end), but the save gate does not
 * forbid one — such a raid returns on the next forward move instead of hanging (test in raid-time.test.ts).
 */
export function returnRaids(state: GameState, upTo: number): { state: GameState; returns: readonly RaidReturn[] } {
  const back: { slot: number; raid: RaidRoll }[] = [];
  const slots = state.raids.slots.map((x, slot): RaidSlot => {
    if (x.kind !== 'running' || x.raid.returnAt > upTo) return x;
    back.push({ slot, raid: x.raid });
    return { kind: 'returned', raid: x.raid };
  });
  if (back.length === 0) return { state, returns: [] };
  back.sort((a, b) => a.raid.returnAt - b.raid.returnAt || a.slot - b.slot);
  return {
    state: { ...state, raids: { ...state.raids, slots } },
    returns: back.map(({ slot, raid }) => ({
      at: raid.returnAt,
      event: { type: 'RaidReturned', slot, region: raid.region, success: raid.success },
    })),
  };
}

type Claimed = { state: GameState; events: GameEvent[] };

/** Grants the returned `raid` of `slot`: its loot exactly as rolled (shown = granted), its relic; the slot is free. */
function grantRaid(state: GameState, slot: number, raid: RaidRoll): Claimed {
  const { success, loot } = raid;
  const c = state.currencies;
  const events: GameEvent[] = [
    {
      type: 'RaidClaimed',
      slot,
      tier: raid.tier,
      region: raid.region,
      success,
      granted: { ducats: loot.ducats, glory: loot.glory, pysanky: loot.pysanky },
      relic: loot.relic,
    },
  ];
  if (loot.relic !== null) events.push({ type: 'RelicFound', id: loot.relic });
  return {
    state: {
      ...state,
      currencies: {
        ...c,
        ducats: c.ducats.add(loot.ducats),
        // An action's grant goes straight in: the glory store caps passive and offline accrual only (SPEC §3.8).
        glory: c.glory.add(loot.glory),
        pysanky: c.pysanky + loot.pysanky,
      },
      village: { ...state.village, lifetimeDucats: state.village.lifetimeDucats.add(loot.ducats) },
      // `heldRelics` kept the roll off every relic found or in a slot: no duplicate to drop here.
      relics: loot.relic === null ? state.relics : [...state.relics, loot.relic],
      raids: { ...state.raids, slots: withSlot(state.raids.slots, slot, { kind: 'idle' }) },
      stats: {
        ...state.stats,
        raidsDone: state.stats.raidsDone + 1,
        raidsWon: state.stats.raidsWon + (success ? 1 : 0),
      },
    },
    events,
  };
}

/** Claims the returned raid in `slot` (`grantRaid`). */
export function claimRaid(state: GameState, slot: number): Claimed | 'range' | 'notReturned' {
  // 'range' is «no such slot in the save» (the stored array, RAIDS.maxSlots long); a closed slot is always idle (the
  // save gate), so claiming it is 'notReturned', like any slot with nothing back.
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.raids.slots.length) return 'range';
  const x = state.raids.slots[slot];
  return x?.kind === 'returned' ? grantRaid(state, slot, x.raid) : 'notReturned';
}

/**
 * «Ще раз» (§0.1 П12): claims the returned raid in `slot`, then starts its tier again from that slot at `at` (today's
 * board region). A refused start keeps the claim and adds `RaidAgainRefused` with the reason.
 */
export function claimRaidAgain(state: GameState, slot: number, at: number): Claimed | 'range' | 'notReturned' {
  const x = state.raids.slots[slot];
  const claimed = claimRaid(state, slot);
  if (typeof claimed === 'string' || x?.kind !== 'returned') return claimed;
  const tier = x.raid.tier;
  const started = startRaid(claimed.state, slot, tier, at);
  if (typeof started === 'string')
    return {
      state: claimed.state,
      events: [...claimed.events, { type: 'RaidAgainRefused', slot, tier, reason: started }],
    };
  return { state: started.state, events: [...claimed.events, ...started.events] };
}

/** «Забрати все» (Q17): every returned slot granted in slot order; 'notReturned' when none is back. */
export function claimAllRaids(state: GameState): Claimed | 'notReturned' {
  let s = state;
  const events: GameEvent[] = [];
  for (const [slot, x] of state.raids.slots.entries()) {
    if (x.kind !== 'returned') continue;
    const r = grantRaid(s, slot, x.raid);
    s = r.state;
    events.push(...r.events);
  }
  // Every grant emits its RaidClaimed: no events = no returned slot.
  return events.length === 0 ? 'notReturned' : { state: s, events };
}
