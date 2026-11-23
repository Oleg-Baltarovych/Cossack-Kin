// Raid formulas (SPEC §3.4, §2.6; plan M3-03; ADR 012). Pure functions; the actions, `advance` and the save fields
// that use them are M3-04/M3-05. Numbers are in content/raids.ts and content/relics.ts.
//   power   = ArmyPower at the steady rates (a snapshot: the army stays home, Q1)
//   start   only when power ≥ minPowerShare × P
//   chance  = clamp(power / P, chanceMin, 1)
//   loot    = max(rate × lootSec, REWARD floor) × lootMult (ducats; glory alike with gloryLootSec) at steadyModifiers,
//             so the loot shown on the card is the loot granted (Q4); a failure gives failShare of it, never 0
//   success → pysanky (chance per tier) and a relic (chance per tier × relicChanceMult, only among the unfound ones,
//             sure on the pityThreshold-th qualifying success; all found → the relic chance goes to the pysanky)
// Relic and pysanky chances are clamped to 1 after the multipliers. Everything random is drawn once at start from
// `state.rng`, always the same number of draws in the same order (ROLL_DRAWS) — that order is frozen (golden test).
// The daily board is not state: a pure function of (seed, day), day = the quest day (`questDay`, §3.9).
import {
  BOARD,
  RAID_TIER_IDS,
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
import { steadyModifiers, villageOf } from '../modifiers.ts';
import { hash32, next, pickStable, type Rng } from '../rng.ts';
import type { GameState } from '../state.ts';
import { armyPower } from './army.ts';
import { questDay } from './quests.ts';
import { rewardAmount, rewardRates } from './reward.ts';

const MS_PER_SEC = 1000;
const SEC_PER_MIN = 60;

// --- state (persisted from save v4, M3-04) ---------------------------------------------------------------------

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

/** What the raid formulas read: the game state plus the v4 raid fields (GameState v4 satisfies it, M3-04). */
export type RaidFacts = GameState & { readonly raids: RaidsState; readonly relics: readonly RelicId[] };

// --- content lookups -------------------------------------------------------------------------------------------

export function raidTier(id: RaidTierId): RaidTier {
  const t = RAID_TIERS.find((x) => x.id === id);
  // RAID_TIERS lists every RaidTierId (content test M3-02).
  if (!t) throw new Error(`raids: no tier ${id}`);
  return t;
}

const tierRank = (id: RaidTierId): number => RAID_TIER_IDS.indexOf(id);

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

function powerEnough(power: number, tier: RaidTierId): boolean {
  return power >= RAIDS.minPowerShare * raidTier(tier).power;
}

/** Whether a raid of `tier` can start in `slot` (the startRaid action applies it, M3-05). */
export function canStart(state: RaidFacts, slot: number, tier: RaidTierId): StartCheck {
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
function offerOf(state: RaidFacts, tier: RaidTierId): { offer: RaidOffer; rumor: RumorId | null } {
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
export function heldRelics(state: RaidFacts): readonly RelicId[] {
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
function oddsOf(state: RaidFacts, tier: RaidTierId, rumor: RumorId | null): Odds {
  const t = raidTier(tier);
  const held = heldRelics(state);
  // M3-06: × Modifiers.relicChanceMult (relics, heroes) as well.
  const relic = t.relicChance * (1 + rumorShare(rumor, 'relic'));
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

/** lootMult of a start: 1 + the rumour (M3-06: + Modifiers.lootMult — the treasury and the relics). */
function lootMultOf(rumor: RumorId | null): number {
  return 1 + rumorShare(rumor, 'loot');
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
export function previewRaid(state: RaidFacts, tier: RaidTierId): RaidPreview {
  const { offer, rumor } = offerOf(state, tier);
  const power = raidPower(state);
  const p = raidTier(tier).power;
  const odds = oddsOf(state, tier, rumor);
  const loot = lootOf(state, tier, lootMultOf(rumor));
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
  state: RaidFacts,
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
      // M3-06: × Modifiers.raidTimeMult (Характерник, M4).
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
