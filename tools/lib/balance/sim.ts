// The balance simulator (SPEC §12.3; plan M1-14, Q10). A greedy bot plays the real core — no copy of any formula — on
// the session rhythm of src/content/pacing.ts: two 7-minute sessions a day, a tap every 2 s, offline between sessions.
// Each step it presses MAX on the best target (soonest payback incl. the wait for the price, steady income, for
// ducats; the lowest open Sich building for glory)
// and hires Cossacks while they are cheap. After every step and press it claims each finished quest — the step of
// «Наказ кошового» and the chore — through the real `claimQuest` action (M2-27; a claim is not an «дія», SPEC §12.3,
// so it is counted apart). It logs actions, «відчутні» purchases and novelties (SPEC §2.4: story beats and chain
// steps too, plan Q6), milestone times and bloom. Deterministic: the same options give the same result, byte for byte.
import { FARM, SICH } from '../../../src/content/economy.ts';
import { PACING, type NoveltyKind } from '../../../src/content/pacing.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import type { FarmBuildingId } from '../../../src/content/villages/khortytsia.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { farmIncomeRate, sichUnlocked, steadyModifiers, villageOf } from '../../../src/core/modifiers.ts';
import { tick } from '../../../src/core/offline.ts';
import { farmRowView, sichRowView, visibleSichIds } from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { canHire } from '../../../src/core/systems/army.ts';
import { chainQuest, choreQuest, questRef } from '../../../src/core/systems/quests.ts';
import { tier } from '../../../src/core/economy.ts';
import { bloomStatus } from '../../../src/core/systems/bloom.ts';
import { stormStarts } from '../../../src/core/systems/village-mechanics/wind.ts';

const MS = 1000;
const HOUR_MS = 3600 * MS;
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
  readonly actions: number;
  readonly noticeable: number;
  /** Noticeable purchases made at the session's first step, i.e. from what the offline time brought. */
  readonly noticeableAtOpen: number;
  /** Quests claimed (`claimQuest`); not counted in `actions`. */
  readonly claims: { readonly chain: number; readonly chore: number };
  /** Chore claims that paid a reward (the rest, past CHORES.maxClaimsPerDay, only move the counter). */
  readonly choreRewards: number;
}

export interface SimResult {
  readonly seed: number;
  readonly days: number;
  readonly firstPurchaseSec: number | null;
  readonly bloomSec: number | null;
  readonly bloomSession: number | null;
  readonly sessions: readonly SessionLog[];
  readonly novelties: readonly Novelty[];
  /** `<building>@<level>` → seconds since start when that milestone level was first reached. */
  readonly milestones: Readonly<Record<string, number>>;
  /** Share of all ducats earned that came from offline returns (0..1). */
  readonly offlineShare: number;
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

/** Most Cossacks the bot hires now: as many as food allows, while they cost ≤ HIRE_SHARE of the ducats. */
function hireCount(s: GameState, now: number): number {
  const budget = s.currencies.ducats.mul(HIRE_SHARE);
  let n = 0;
  for (;;) {
    const c = canHire(s, n + 1, now);
    if (!c.ok || c.cost.gt(budget)) return n;
    n += 1;
  }
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

  /** Claims every finished quest now (a claimed chain step can start one already met: claimed in turn). */
  const claimAll = (t: number, claims: { chain: number; chore: number; choreRewards: number }): void => {
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
    for (let t = start; t < start + sessionMs; t += stepMs) {
      let stepNoticeable = advanceTo(t);
      const report = state.returnReport;
      if (report) {
        offlineDucats += report.ducats.toNumber();
        act({ type: 'claimReturn' }, t);
      }
      if (taps) act({ type: 'tap' }, t);
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
    });
    // bloom is set inside afterStep (a closure): read it through a function so TS does not narrow it to null here.
    if (options.stopAtBloom && bloomed()) break;
  }

  const earned = state.village.lifetimeDucats.toNumber() - startLifetime;
  return {
    seed: options.seed,
    days: options.days,
    firstPurchaseSec: firstPurchase,
    bloomSec: bloom,
    bloomSession,
    sessions,
    novelties,
    milestones,
    offlineShare: earned > 0 ? offlineDucats / earned : 0,
    final: state,
  };
}
