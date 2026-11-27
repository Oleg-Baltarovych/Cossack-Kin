// The balance simulator (SPEC §12.3; plan M1-14, Q10). A greedy bot plays the real core — no copy of any formula — on
// the session rhythm of src/content/pacing.ts: two 7-minute sessions a day, a tap every 2 s, offline between sessions.
// Each step it presses MAX on the best target (soonest payback incl. the wait for the price, steady income, for
// ducats; the lowest open Sich building for glory)
// and hires Cossacks while they are cheap. After every step and press it claims each finished quest — the step of
// «Наказ кошового» and the chore — through the real `claimQuest` action (M2-27; a quest claim is not an «дія», SPEC
// §12.3, so it is counted apart). Raids (M3-08): at every step it claims what came back before its purchases
// (`claimRaid`; «Забрати все» = `claimAllRaids` when two or more are back) and, after them, fills each free slot with
// the offer of the highest expected loot (`bestRaid`: the hires of the step count). «Ще раз» is immediate, like the real
// button (claim + the same tier in one tap): taken at the claim, before the purchases, when the tier that came back is
// the best at that moment — by design, not an ordering slip. A raid start and a raid claim are actions (SPEC §12.3),
// counted apart from the economy's (owner 2026-11-24: the 5–15 corridor is purchases and hires; raids have their own cap).
// It logs actions, «відчутні» purchases and novelties (SPEC §2.4: story beats, chain steps, plan Q6; the first raid,
// each relic, each raid tier), milestone times, bloom and the raid ledger. Deterministic: the same options give the
// same result, byte for byte.
import { CULTURE_BRANCHES, CULTURE_NODES } from '../../../src/content/culture.ts';
import { FARM, SICH } from '../../../src/content/economy.ts';
import { PACING, type NoveltyKind } from '../../../src/content/pacing.ts';
import { RAID_TIER_IDS, RAIDS, type RaidTierId } from '../../../src/content/raids.ts';
import type { RelicId } from '../../../src/content/relics.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import type { FarmBuildingId } from '../../../src/content/villages/khortytsia.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import { tier } from '../../../src/core/economy.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { farmIncomeRate, sichUnlocked, steadyModifiers, villageOf } from '../../../src/core/modifiers.ts';
import { tick } from '../../../src/core/offline.ts';
import { farmRowView, sichRowView, visibleSichIds } from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { canHire } from '../../../src/core/systems/army.ts';
import { bloomStatus } from '../../../src/core/systems/bloom.ts';
import { chainQuest, choreQuest, questRef } from '../../../src/core/systems/quests.ts';
import { canStart, previewRaid } from '../../../src/core/systems/raids.ts';
import { triggerMet } from '../../../src/core/systems/story.ts';
import { stormStarts } from '../../../src/core/systems/village-mechanics/wind.ts';

const MS = 1000;

const HOUR_MS = 3600 * MS;

/** The chain step the culture stand-in serves (plan M4 Q12) and the node it learns (the root of «Музика»). */
const CULTURE_STEP = 'khortytsia.culture1';
const CULTURE_ROOT = 'music.dumy';

/**
 * Stand-in: M4-05 (buyCulture) + M4-09 (bot policy) replace this (M4-04, coordinator decision (a), as `standInRaid`
 * in M3-04). On the chain step `culture1` only, learns one rank of «Кобзарські думи» the way `buyCulture` will: its
 * branch open, a rank left, the price `base × growth^rank × cultureCostMult` (plan §0, content + steady modifiers) paid
 * in glory, `culture` + 1 and `stats.cultureRanks` + 1. null when it does not apply or the glory is short.
 */
export function standInCulture(s: GameState): GameState | null {
  const q = chainQuest(s);
  if (q?.id !== CULTURE_STEP || q.done) return null;
  const node = CULTURE_NODES.find((n) => n.id === CULTURE_ROOT);
  const branch = CULTURE_BRANCHES.find((b) => b.id === node?.branch);
  if (!node || !branch || !triggerMet(s, branch.unlock)) return null;
  const rank = s.culture[node.id] ?? 0;
  if (rank >= node.maxRank) return null;
  const price = Big.from(node.base).mul(Big.from(node.growth).pow(rank)).mul(steadyModifiers(s).cultureCostMult);
  if (s.currencies.glory.lt(price)) return null;
  return {
    ...s,
    currencies: { ...s.currencies, glory: s.currencies.glory.sub(price) },
    culture: { ...s.culture, [node.id]: rank + 1 },
    stats: { ...s.stats, cultureRanks: s.stats.cultureRanks + 1 },
  };
}
const DAY_MS = 24 * HOUR_MS;
/** The bot hires while the Cossacks cost at most this share of its ducats (keeps the farm growing first). */
const HIRE_SHARE = 0.25;
/** Safety bound on presses per 2-s step (each press is one action; the loop ends when nothing is affordable). */
const MAX_PRESSES_PER_STEP = 40;
/** Monday 2026-01-05 00:00 UTC: day 0 of every run (any fixed date; only the wind schedule depends on it). */
export const DEFAULT_EPOCH = Date.UTC(2026, 0, 5);

export interface SimOptions {
  readonly seed: number;
  readonly days: number;
  readonly epoch?: number;
  /** Tap during sessions (default true). */
  readonly taps?: boolean;
  /** Start from this state at its `lastSeen` (tests); default: a new game at the first session. */
  readonly initial?: GameState;
  /** Stop at the end of the session in which bloom is reached. */
  readonly stopAtBloom?: boolean;
}

export interface Novelty {
  readonly session: number;
  /** Seconds since the start of the run. */
  readonly t: number;
  readonly kind: NoveltyKind;
  readonly ref: string;
}

export interface SessionLog {
  readonly index: number;
  /** Seconds since the start of the run. */
  readonly start: number;
  /** Economy actions: purchase presses and hires (the 5–15 corridor, SPEC §2.3). Raid actions are in `raids`. */
  readonly actions: number;
  readonly noticeable: number;
  /** Noticeable purchases made at the session's first step, i.e. from what the offline time brought. */
  readonly noticeableAtOpen: number;
  /** Quests claimed (`claimQuest`); not counted in `actions`. */
  readonly claims: { readonly chain: number; readonly chore: number };
  /** Chore claims that paid a reward (the rest, past CHORES.maxClaimsPerDay, only move the counter). */
  readonly choreRewards: number;
  /**
   * Raid actions (SPEC §12.3; not in `actions`): starts and claims (a «Забрати все» counts one per slot); `again` —
   * starts by «Ще раз» (the claimed slot sent to the same tier), `claimAll` — taps of «Забрати все».
   */
  readonly raids: {
    readonly starts: number;
    readonly claims: number;
    readonly again: number;
    readonly claimAll: number;
  };
}

/** One raid claimed by the bot. */
export interface RaidClaimLog {
  readonly session: number;
  /** Seconds since the start of the run. */
  readonly t: number;
  readonly slot: number;
  readonly tier: RaidTierId;
  readonly success: boolean;
  readonly ducats: number;
  readonly glory: number;
  readonly pysanky: number;
  readonly relic: RelicId | null;
}

/** One day of the run (its sessions and the offline time before them), sampled at the end of its last session. */
export interface DayLog {
  readonly day: number;
  /** Ducats earned that day (lifetime: income, offline returns, rewards, loot). */
  readonly earnedDucats: number;
  readonly raidDucats: number;
  readonly raidsClaimed: number;
  readonly raidsWon: number;
  readonly pysanky: number;
  /** Steady modifiers at the end of the day: loot grows with both (a raid is «seconds of income» × lootMult). */
  readonly lootMult: number;
  readonly incomeMult: number;
}

export interface SimResult {
  readonly seed: number;
  readonly days: number;
  readonly firstPurchaseSec: number | null;
  readonly firstRaidSec: number | null;
  readonly bloomSec: number | null;
  readonly bloomSession: number | null;
  readonly sessions: readonly SessionLog[];
  readonly novelties: readonly Novelty[];
  /** `<building>@<level>` → seconds since start when that milestone level was first reached. */
  readonly milestones: Readonly<Record<string, number>>;
  /** Share of all ducats earned that came from offline returns (0..1). */
  readonly offlineShare: number;
  /** Every raid the bot claimed, in order. */
  readonly raidClaims: readonly RaidClaimLog[];
  readonly dayLog: readonly DayLog[];
  /** The game at the end of the run (save fixtures are captured from it: tools/capture-save.ts). */
  readonly final: GameState;
}

/** Session start times (ms) for `days` days from `epoch`, on the pacing hours. */
export function sessionStarts(epoch: number, days: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < days; d += 1)
    for (const h of PACING.sessionStartHours) out.push(epoch + d * DAY_MS + h * HOUR_MS);
  return out;
}

/** The session (1-based) a novelty at time `t` belongs to: the one running at `t`, or the next one (an offline event is
 * seen when the player comes back). */
export function sessionOf(t: number, starts: readonly number[]): number {
  const sessionMs = PACING.sessionSec * MS;
  for (let i = 0; i < starts.length; i += 1) {
    const s = starts[i] ?? 0;
    if (t < s + sessionMs) return i + 1;
  }
  return starts.length + 1;
}

const FARM_TIERS = FARM.milestones.map((m) => m.level);

/**
 * The milestone levels a press from `from` to `to` crossed, by the core's tier rule (`TierReached` names only the
 * top one: 9 → 26 crosses 10 and 25). A tier is a novelty once it is seen, skipped or not.
 */
export function crossedTiers(from: number, to: number, milestoneLevels: readonly number[]): number[] {
  const out: number[] = [];
  for (let t = tier(from, milestoneLevels) + 1; t <= tier(to, milestoneLevels); t += 1) {
    const level = milestoneLevels[t - 1];
    if (level !== undefined) out.push(level);
  }
  return out;
}

const isNoticeable = (e: GameEvent): boolean =>
  (e.type === 'BuildingUpgraded' && e.from === 0) ||
  (e.type === 'SichUpgraded' && e.from === 0) ||
  e.type === 'TierReached' ||
  (e.type === 'CossackHired' && e.total === e.n);

/**
 * The farm building whose next level pays back soonest, counting the wait for its price: (price − ducats) / income +
 * price / gain (null when all are at the cap). Gains and income are the steady ones (`steadyModifiers`: no wind of
 * the moment). M2-27: ranked by gain per ducat alone, and with the storm's ×3, the bot saved a whole session for a 13K
 * windmill while a 10-ducat field or an affordable garden was there to buy.
 */
function bestFarm(s: GameState): FarmBuildingId | null {
  let best: FarmBuildingId | null = null;
  let bestScore = Infinity;
  const income = farmIncomeRate(s, steadyModifiers(s)).toNumber();
  const ducats = s.currencies.ducats.toNumber();
  for (const b of villageOf(s).buildings) {
    const v = farmRowView(s, b.id, 1);
    if (v.blocked === 'max') continue;
    const next: GameState = {
      ...s,
      village: { ...s.village, levels: { ...s.village.levels, [b.id]: s.village.levels[b.id] + 1 } },
    };
    const gain = farmIncomeRate(next, steadyModifiers(next)).toNumber() - income;
    const price = v.price.toNumber();
    const short = Math.max(0, price - ducats);
    const wait = short === 0 ? 0 : income > 0 ? short / income : Infinity;
    const score = gain > 0 ? wait + price / gain : Infinity;
    if (score < bestScore) {
      bestScore = score;
      best = b.id;
    }
  }
  return best;
}

/**
 * Most Cossacks the bot hires now: as many as food allows, while they cost ≤ HIRE_SHARE of the ducats. The first
 * Cossack, while the chain asks for him («Найми першого козака», SPEC §2.4), is hired as soon as he is paid for: a
 * guided player follows the highlighted step, and the scouting raid waits on him (first raid < 3 min, SPEC §2.3; M3-08).
 */
function hireCount(s: GameState, now: number): number {
  const q = chainQuest(s);
  const first = s.army.infantry === 0 && q !== null && !q.done && q.goal.kind === 'count' && q.goal.stat === 'hires';
  const asked = first ? 1 : 0;
  const budget = s.currencies.ducats.mul(HIRE_SHARE);
  let n = 0;
  for (;;) {
    const c = canHire(s, n + 1, now);
    if (!c.ok || (c.cost.gt(budget) && n + 1 > asked)) return n;
    n += 1;
  }
}

/**
 * The raid the bot sends from `slot` (null: none can start): the offer of the highest expected loot, chance ×
 * success + (1 − chance) × failure (`previewRaid`: the card's numbers, rumour included), ducats and glory each in
 * units of the 5-minute success. One raid per slot «till the next session» (SPEC §12.3): every tier (≤ 8 h) is back
 * before the next session (≈ 12 h later), so the biggest expected loot is the biggest of one raid. Relics are left out
 * of the value: the pity brings them on the raids ≥ 30 min the loot picks anyway.
 */
export function bestRaid(s: GameState, slot: number): RaidTierId | null {
  const [scout] = RAID_TIER_IDS;
  const ref = previewRaid(s, scout).success;
  // A currency whose reference is 0 has no unit to weigh it by: it is left out (the REWARD floor keeps both > 0 today).
  const refD = ref.ducats.toNumber();
  const refG = ref.glory.toNumber();
  let best: RaidTierId | null = null;
  let bestValue = -Infinity;
  for (const id of RAID_TIER_IDS) {
    if (!canStart(s, slot, id).ok) continue;
    const p = previewRaid(s, id);
    const ev = (k: 'ducats' | 'glory'): number =>
      p.chance * p.success[k].toNumber() + (1 - p.chance) * p.failure[k].toNumber();
    const value = (refD > 0 ? ev('ducats') / refD : 0) + (refG > 0 ? ev('glory') / refG : 0);
    if (value > bestValue) {
      bestValue = value;
      best = id;
    }
  }
  return best;
}

/** The next press of the bot, or null when nothing is worth pressing now. */
function nextAction(s: GameState, now: number): Action | null {
  const hire = hireCount(s, now);
  if (hire > 0) return { type: 'hire', n: hire };
  // Glory: level the open Sich evenly (bloom wants all of them at 25).
  const open = visibleSichIds(s)
    .map((id) => sichRowView(s, id, 1))
    .filter((v) => v.blocked !== 'locked' && v.blocked !== 'max')
    .sort((a, b) => a.level - b.level || a.price.cmp(b.price));
  const sich = open[0];
  if (sich && sichRowView(s, sich.id, 'max').blocked === null) return { type: 'buySich', id: sich.id, mode: 'max' };
  const farm = bestFarm(s);
  if (farm && farmRowView(s, farm, 'max').blocked === null) return { type: 'buyBuilding', id: farm, mode: 'max' };
  return null;
}

export function simulate(options: SimOptions): SimResult {
  const taps = options.taps ?? true;
  const epoch = options.initial
    ? options.initial.time.lastSeen - PACING.sessionStartHours[0] * HOUR_MS
    : (options.epoch ?? DEFAULT_EPOCH);
  const starts = sessionStarts(epoch, options.days);
  const t0 = starts[0] ?? epoch;
  let state = options.initial ?? createInitialState({ seed: options.seed, now: t0 });
  const church = SICH_BUILDINGS.find((b) => b.id === 'church');
  const sec = (t: number): number => Math.round((t - t0) / MS);

  const novelties: Novelty[] = [];
  const seen = new Set<string>();
  const milestones: Record<string, number> = {};
  const sessions: SessionLog[] = [];
  let firstPurchase: number | null = null;
  let firstRaid: number | null = null;
  const raidClaims: RaidClaimLog[] = [];
  const dayLog: DayLog[] = [];
  const day = { lifetime: state.village.lifetimeDucats.toNumber(), raidDucats: 0, claimed: 0, won: 0, pysanky: 0 };
  let bloom: number | null = null;
  let bloomSession: number | null = null;
  const bloomed = (): boolean => bloom !== null;
  let offlineDucats = 0;
  const startLifetime = state.village.lifetimeDucats.toNumber();

  const note = (t: number, kind: NoveltyKind, ref = ''): void => {
    const key = `${kind}:${ref}`;
    if (seen.has(key)) return;
    seen.add(key);
    novelties.push({ session: sessionOf(t, starts), t: sec(t), kind, ref });
  };

  /** Logs the events of one core call; returns how many of them were noticeable purchases. */
  const record = (events: readonly GameEvent[], t: number): number => {
    let noticeable = 0;
    for (const e of events) {
      if (isNoticeable(e)) noticeable += 1;
      switch (e.type) {
        case 'BuildingUpgraded':
          if (firstPurchase === null) {
            firstPurchase = sec(t);
            note(t, 'firstPurchase');
          }
          if (e.from === 0) note(t, 'building', e.id);
          for (const level of crossedTiers(e.from, e.to, FARM_TIERS)) {
            milestones[`${e.id}@${String(level)}`] ??= sec(t);
            note(t, 'tier', `${e.id}@${String(level)}`);
          }
          break;
        case 'SichUpgraded':
          if (e.from === 0) note(t, 'sichBuilding', e.id);
          for (const level of crossedTiers(e.from, e.to, SICH.milestones))
            note(t, 'sichTier', `${e.id}@${String(level)}`);
          break;
        case 'CossackHired':
          if (e.total === e.n) note(t, 'firstHire');
          break;
        case 'StoryBeatReached':
          note(t, 'storyBeat', e.id);
          break;
        case 'RaidStarted':
          if (firstRaid === null) {
            firstRaid = sec(t);
            note(t, 'firstRaid');
          }
          note(t, 'raidTier', e.tier);
          break;
        case 'RelicFound':
          note(t, 'firstRelic', e.id);
          break;
        default:
      }
    }
    return noticeable;
  };

  const afterStep = (t: number): void => {
    if (church && sichUnlocked(church, state)) note(t, 'churchOpen');
    if (bloom === null && bloomStatus(state).reached) {
      bloom = sec(t);
      bloomSession = sessionOf(t, starts);
      note(t, 'bloom');
    }
  };

  const advanceTo = (t: number): number => {
    // A storm seen with a windmill standing (on- or offline) is a novelty of the session it is seen in.
    if (!seen.has('firstStorm:') && state.village.levels.windmill > 0) {
      const storms = stormStarts(state.seed, state.time.lastSeen, t, villageOf(state));
      const first = storms[0];
      if (first !== undefined) note(first, 'firstStorm');
    }
    const r = tick(state, t);
    state = r.state;
    return record(r.events, t);
  };

  const act = (action: Action, t: number): { ok: boolean; noticeable: number } => {
    const r = applyAction(state, action, t);
    if (r.events.some((e) => e.type === 'ActionRejected')) return { ok: false, noticeable: 0 };
    state = r.state;
    return { ok: true, noticeable: record(r.events, t) };
  };

  interface RaidCounts {
    starts: number;
    claims: number;
    again: number;
    claimAll: number;
  }
  /** Logs the claim of the returned raid in `slot` of `before` (the state the claim was made on). */
  const logClaim = (before: GameState, slot: number, t: number): void => {
    const x = before.raids.slots[slot];
    if (x?.kind !== 'returned') return;
    const { success, loot, tier: tierId } = x.raid;
    const ducats = loot.ducats.toNumber();
    raidClaims.push({
      session: sessionOf(t, starts),
      t: sec(t),
      slot,
      tier: tierId,
      success,
      ducats,
      glory: loot.glory.toNumber(),
      pysanky: loot.pysanky,
      relic: loot.relic,
    });
    day.raidDucats += ducats;
    day.claimed += 1;
    day.won += success ? 1 : 0;
    day.pysanky += loot.pysanky;
  };
  /** Starts the best raid from `slot` if one can start; whether it did. */
  const sendRaid = (slot: number, t: number, counts: RaidCounts): RaidTierId | null => {
    const tierId = bestRaid(state, slot);
    if (tierId === null || !act({ type: 'startRaid', slot, tier: tierId }, t).ok) return null;
    counts.starts += 1;
    return tierId;
  };
  /**
   * Claims the raids that are back, before the purchases (their loot is spent at once): «Забрати все» when two or more
   * are; one alone is sent again at once by «Ще раз» (plan §0.1 П12) when the tier it came back from is the best right
   * now. Deliberately immediate, like the real button (one tap: claim + start): it does not wait for the step's hires,
   * so it may send the tier a post-hire `bestRaid` would have topped — a player tapping «Ще раз» does the same. Counts
   * one raid action per slot claimed and one per start (SPEC §12.3).
   */
  const claimRaids = (t: number, counts: RaidCounts): void => {
    const back = new Map<number, RaidTierId>();
    for (const [i, x] of state.raids.slots.slice(0, RAIDS.slots).entries())
      if (x.kind === 'returned') back.set(i, x.raid.tier);
    const [only] = back.keys();
    if (only !== undefined) {
      const many = back.size > 1;
      const before = state;
      if (act(many ? { type: 'claimAllRaids' } : { type: 'claimRaid', slot: only }, t).ok) {
        if (many) counts.claimAll += 1;
        counts.claims += back.size;
        for (const slot of back.keys()) logClaim(before, slot, t);
        if (!many && bestRaid(state, only) === back.get(only) && sendRaid(only, t, counts) !== null) counts.again += 1;
      }
    }
  };
  /** Fills every free open slot with the best raid, after the purchases (hires raise the power). */
  const sendRaids = (t: number, counts: RaidCounts): void => {
    for (let slot = 0; slot < RAIDS.slots; slot += 1)
      if (state.raids.slots[slot]?.kind === 'idle') sendRaid(slot, t, counts);
  };

  /** Claims every finished quest now (a claimed chain step can start one already met: claimed in turn). */
  const claimAll = (t: number, claims: { chain: number; chore: number; choreRewards: number }): void => {
    // Stand-in until M4-05/M4-09: the first culture rank on the step `culture1` (not counted as an action).
    state = standInCulture(state) ?? state;
    for (;;) {
      const q = chainQuest(state);
      if (!q?.done) break;
      const ref = questRef(q);
      if (!act({ type: 'claimQuest', kind: 'chain' }, t).ok) break;
      claims.chain += 1;
      note(t, 'chainStep', ref);
    }
    // Ends: a claim starts the next chore with `base` = its counter now, so it is not done until more taps/levels/hires
    // come (no chore goal is n = 0, content test); a refused claim (none expected) breaks out too.
    while (choreQuest(state).done) {
      const r = applyAction(state, { type: 'claimQuest', kind: 'chore' }, t);
      const claimed = r.events.find((e) => e.type === 'QuestClaimed');
      if (!claimed) break;
      state = r.state;
      record(r.events, t);
      claims.chore += 1;
      if (claimed.granted) claims.choreRewards += 1;
    }
  };

  const stepMs = PACING.tapEverySec * MS;
  const sessionMs = PACING.sessionSec * MS;
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i] ?? 0;
    let actions = 0;
    let noticeable = 0;
    let atOpen = 0;
    const claims = { chain: 0, chore: 0, choreRewards: 0 };
    const raids: RaidCounts = { starts: 0, claims: 0, again: 0, claimAll: 0 };
    for (let t = start; t < start + sessionMs; t += stepMs) {
      let stepNoticeable = advanceTo(t);
      const report = state.returnReport;
      if (report) {
        offlineDucats += report.ducats.toNumber();
        act({ type: 'claimReturn' }, t);
      }
      if (taps) act({ type: 'tap' }, t);
      claimRaids(t, raids);
      claimAll(t, claims);
      for (let p = 0; p < MAX_PRESSES_PER_STEP; p += 1) {
        const a = nextAction(state, t);
        if (!a) break;
        const r = act(a, t);
        if (!r.ok) break;
        actions += 1;
        stepNoticeable += r.noticeable;
        claimAll(t, claims);
      }
      // A start can finish the chain step `raid1` or a raid chore: claimed at once, like the rest.
      sendRaids(t, raids);
      claimAll(t, claims);
      afterStep(t);
      noticeable += stepNoticeable;
      if (t === start) atOpen = stepNoticeable;
    }
    sessions.push({
      index: i + 1,
      start: sec(start),
      actions,
      noticeable,
      noticeableAtOpen: atOpen,
      claims: { chain: claims.chain, chore: claims.chore },
      choreRewards: claims.choreRewards,
      raids,
    });
    // The day closes at its last session, at the last session of the run, or at the bloom stop (a partial day).
    // bloom is set inside afterStep (a closure): read it through a function so TS does not narrow it to null here.
    const stopping = options.stopAtBloom === true && bloomed();
    if ((i + 1) % PACING.sessionsPerDay === 0 || i === starts.length - 1 || stopping) {
      const lifetime = state.village.lifetimeDucats.toNumber();
      const mods = steadyModifiers(state);
      dayLog.push({
        day: Math.floor(i / PACING.sessionsPerDay) + 1,
        earnedDucats: lifetime - day.lifetime,
        raidDucats: day.raidDucats,
        raidsClaimed: day.claimed,
        raidsWon: day.won,
        pysanky: day.pysanky,
        lootMult: mods.lootMult,
        incomeMult: mods.incomeMult,
      });
      Object.assign(day, { lifetime, raidDucats: 0, claimed: 0, won: 0, pysanky: 0 });
    }
    if (stopping) break;
  }

  const earned = state.village.lifetimeDucats.toNumber() - startLifetime;
  return {
    seed: options.seed,
    days: options.days,
    firstPurchaseSec: firstPurchase,
    firstRaidSec: firstRaid,
    bloomSec: bloom,
    bloomSession,
    sessions,
    novelties,
    milestones,
    offlineShare: earned > 0 ? offlineDucats / earned : 0,
    raidClaims,
    dayLog,
    final: state,
  };
}
