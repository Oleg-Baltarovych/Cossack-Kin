// Player actions (SPEC §3.2–3.4, §3.8; plan §0, M1-10, Q8). One pure reducer: `applyAction(state, action, now)`
// first advances time to `now` (income up to the click is earned), then applies the action. A refused action leaves
// the (advanced) state as it is and adds `ActionRejected` with the reason — never a throw for a player error. An
// accepted action is followed by the story check (M2-22): a beat its trigger now meets fires in the same turn; then
// the quests finished by it report `QuestCompleted` (M2-23: only actions move levels and counters).
// Raids (M3-05, ADR 012): `startRaid` rolls on the advanced state at the effective time; `claimRaid` / `claimAllRaids`
// grant what was rolled. `RaidClaimed` / `RelicFound` come only from here; `RaidReturned` only from time.
// Culture and heroes (M4-05): `buyCulture` / `levelHero` (systems/culture.ts); `CultureBought` / `HeroLevelled` only
// from here.
import type { CultureNodeId } from '../content/culture.ts';
import { FARM, SICH, TAP } from '../content/economy.ts';
import type { HeroId } from '../content/heroes.ts';
import { BUILD_SYSTEMS, type SystemId } from '../content/quests.ts';
import type { RaidTierId } from '../content/raids.ts';
import { SICH_BUILDINGS, type SichBuildingId } from '../content/sich.ts';
import type { FarmBuildingId } from '../content/villages/khortytsia.ts';
import { advance } from './advance.ts';
import { Big } from './big.ts';
import { bulkCost, buyCount, tier, type BuyMode } from './economy.ts';
import type { GameEvent, RejectReason } from './events.ts';
import { collectModifiers, farmIncomeRate, sichUnlocked, villageOf } from './modifiers.ts';
import { TZ_OFFSET_MIN, type GameState, type Lang, type NumberFormat } from './state.ts';
import { creditReport } from './offline.ts';
import { canHire } from './systems/army.ts';
import { buyCulture, learnableNode, levelHero, levellableHero } from './systems/culture.ts';
import { claimQuest, questCompletions, type QuestKind } from './systems/quests.ts';
import { claimAllRaids, claimRaid, claimRaidAgain, raidReady, startRaid } from './systems/raids.ts';
import { checkStory } from './systems/story.ts';

export type Action =
  | { readonly type: 'buyBuilding'; readonly id: FarmBuildingId; readonly mode: BuyMode }
  | { readonly type: 'buySich'; readonly id: SichBuildingId; readonly mode: BuyMode }
  | { readonly type: 'hire'; readonly n: number }
  | { readonly type: 'tap' }
  | { readonly type: 'claimReturn' }
  | { readonly type: 'claimQuest'; readonly kind: QuestKind }
  /** Send a raid of `tier` (the day's board offer) from `slot` (SPEC §3.4). */
  | { readonly type: 'startRaid'; readonly slot: number; readonly tier: RaidTierId }
  /**
   * Take the loot of the returned raid in `slot` (Q9: manual). `again` («Ще раз», §0.1 П12): then start the same tier
   * from the same slot — one action; a refused start keeps the claim and says why (`RaidAgainRefused`).
   */
  | { readonly type: 'claimRaid'; readonly slot: number; readonly again?: boolean }
  /** «Забрати все» (Q17): claimRaid on every returned slot. */
  | { readonly type: 'claimAllRaids' }
  /** Learn one rank of a culture node (SPEC §3.5; M4-05). */
  | { readonly type: 'buyCulture'; readonly id: CultureNodeId }
  /** Raise a hero who came, by the shared ×1/×10/×25/Max picker (SPEC §3.5; M4-05). */
  | { readonly type: 'levelHero'; readonly id: HeroId; readonly mode: BuyMode }
  | {
      readonly type: 'setSettings';
      readonly lang?: Lang;
      readonly numberFormat?: NumberFormat;
      readonly tzOffsetMin?: number;
    };

export interface ActionResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

const MS_PER_SEC = 1000;
const FARM_MILESTONES = FARM.milestones.map((m) => m.level);

function reject(state: GameState, events: readonly GameEvent[], action: Action, reason: RejectReason): ActionResult {
  return { state, events: [...events, { type: 'ActionRejected', action: action.type, reason }] };
}

function buyBuilding(
  s: GameState,
  a: Extract<Action, { type: 'buyBuilding' }>,
  now: number,
): ActionResult | RejectReason {
  const village = villageOf(s);
  const b = village.buildings.find((x) => x.id === a.id);
  if (!b) return 'locked';
  const level = s.village.levels[a.id];
  if (level >= FARM.levelMax) return 'max';
  const mods = collectModifiers(s, now);
  const n = buyCount(b, level, s.currencies.ducats, village.scale, FARM.levelMax, a.mode, mods.costMult);
  if (n === 0) return 'ducats';
  const to = level + n;
  const events: GameEvent[] = [{ type: 'BuildingUpgraded', id: a.id, from: level, to }];
  const newTier = tier(to, FARM_MILESTONES);
  if (newTier > tier(level, FARM_MILESTONES))
    events.push({ type: 'TierReached', zone: 'farm', id: a.id, tier: newTier });
  return {
    state: {
      ...s,
      currencies: {
        ...s.currencies,
        ducats: s.currencies.ducats.sub(bulkCost(b, level, n, village.scale, mods.costMult)),
      },
      village: { ...s.village, levels: { ...s.village.levels, [a.id]: to } },
      stats: { ...s.stats, purchases: s.stats.purchases + 1, levelsBought: s.stats.levelsBought + n },
    },
    events,
  };
}

function buySich(s: GameState, a: Extract<Action, { type: 'buySich' }>): ActionResult | RejectReason {
  const b = SICH_BUILDINGS.find((x) => x.id === a.id);
  if (!b || !sichUnlocked(b, s)) return 'locked';
  const level = s.village.sichLevels[a.id];
  if (level >= SICH.levelMax) return 'max';
  const scale = villageOf(s).gloryScale;
  const n = buyCount(b, level, s.currencies.glory, scale, SICH.levelMax, a.mode);
  if (n === 0) return 'glory';
  const to = level + n;
  const events: GameEvent[] = [{ type: 'SichUpgraded', id: a.id, from: level, to }];
  const newTier = tier(to, SICH.milestones);
  if (newTier > tier(level, SICH.milestones))
    events.push({ type: 'TierReached', zone: 'sich', id: a.id, tier: newTier });
  return {
    state: {
      ...s,
      currencies: { ...s.currencies, glory: s.currencies.glory.sub(bulkCost(b, level, n, scale)) },
      village: { ...s.village, sichLevels: { ...s.village.sichLevels, [a.id]: to } },
      stats: { ...s.stats, purchases: s.stats.purchases + 1, levelsBought: s.stats.levelsBought + n },
    },
    events,
  };
}

function hire(s: GameState, a: Extract<Action, { type: 'hire' }>, now: number): ActionResult | RejectReason {
  const check = canHire(s, a.n, now);
  if (!check.ok) return check.reason;
  const total = s.army.infantry + a.n;
  return {
    state: {
      ...s,
      currencies: { ...s.currencies, ducats: s.currencies.ducats.sub(check.cost) },
      army: { infantry: total },
      stats: { ...s.stats, hires: s.stats.hires + a.n },
    },
    events: [{ type: 'CossackHired', n: a.n, total }],
  };
}

/** A tap; `null` when this second's taps are used up (ignored silently, plan Q8). */
function tap(s: GameState, now: number): ActionResult | null {
  const fresh = now - s.tapWindow.start >= MS_PER_SEC || now < s.tapWindow.start;
  const second = fresh ? { start: now, count: 0 } : s.tapWindow;
  if (second.count >= TAP.maxPerSec) return null;
  const village = villageOf(s);
  const income = farmIncomeRate(s, collectModifiers(s, now));
  const amount = Big.max(Big.from(village.scale * TAP.minScaleMult), income.mul(TAP.incomeShare));
  return {
    state: {
      ...s,
      currencies: { ...s.currencies, ducats: s.currencies.ducats.add(amount) },
      village: { ...s.village, lifetimeDucats: s.village.lifetimeDucats.add(amount) },
      stats: { ...s.stats, taps: s.stats.taps + 1, tapIncomeSec: s.stats.tapIncomeSec + TAP.incomeShare },
      tapWindow: { start: second.start, count: second.count + 1 },
    },
    events: [{ type: 'Tapped', amount }],
  };
}

function claimReturn(s: GameState): ActionResult | RejectReason {
  return s.returnReport ? creditReport(s) : 'noReport';
}

/** A time zone outside UTC−12…+14 or not whole minutes is refused ('range' — the platform's bug, not the player's). */
/**
 * The systems a chore may need that this game can do now (plan M3-07 review): the build's, raids only once the army
 * can start the lowest tier, culture while a rank can be learned, heroes while one who came has a level left (M4-08;
 * glory aside — the player saves up) — there is no skip for a chore, so none is offered that the player cannot begin.
 */
function choreSystems(s: GameState): readonly SystemId[] {
  return BUILD_SYSTEMS.filter((x) => systemReady(s, x));
}

function systemReady(s: GameState, x: SystemId): boolean {
  switch (x) {
    case 'raids':
      return raidReady(s);
    case 'culture':
      return learnableNode(s) !== null;
    case 'heroes':
      return levellableHero(s) !== null;
    case 'storks':
      return true;
  }
}

function setSettings(s: GameState, a: Extract<Action, { type: 'setSettings' }>): ActionResult | RejectReason {
  const tz = a.tzOffsetMin ?? s.settings.tzOffsetMin;
  if (!Number.isInteger(tz) || tz < TZ_OFFSET_MIN.min || tz > TZ_OFFSET_MIN.max) return 'range';
  return {
    state: {
      ...s,
      settings: {
        lang: a.lang ?? s.settings.lang,
        numberFormat: a.numberFormat ?? s.settings.numberFormat,
        tzOffsetMin: tz,
      },
    },
    events: [],
  };
}

/**
 * Advances to `now`, then applies `action`. A refusal is exactly `advance(state, now)` + `ActionRejected`: the state is
 * the one advanced to `now` (income, wind, raid returns), with nothing of the action in it — no RNG draw, no slot change.
 */
export function applyAction(state: GameState, action: Action, now: number): ActionResult {
  const advanced = advance(state, now);
  const s = advanced.state;
  const before = advanced.events;
  // The action's time never runs behind `lastSeen` (a clock set back, or a non-finite `now`): otherwise every step back
  // would open a fresh tap second (M2-22 review). After `advance`, lastSeen = max(lastSeen, now).
  const at = s.time.lastSeen;
  let result: ActionResult | RejectReason | null;
  switch (action.type) {
    case 'buyBuilding':
      result = buyBuilding(s, action, at);
      break;
    case 'buySich':
      result = buySich(s, action);
      break;
    case 'hire':
      result = hire(s, action, at);
      break;
    case 'tap':
      result = tap(s, at);
      break;
    case 'claimReturn':
      result = claimReturn(s);
      break;
    case 'claimQuest':
      result = claimQuest(s, action.kind, choreSystems(s));
      break;
    case 'setSettings':
      result = setSettings(s, action);
      break;
    case 'startRaid':
      result = startRaid(s, action.slot, action.tier, at);
      break;
    case 'claimRaid':
      result = action.again === true ? claimRaidAgain(s, action.slot, at) : claimRaid(s, action.slot);
      break;
    case 'claimAllRaids':
      result = claimAllRaids(s);
      break;
    case 'buyCulture':
      result = buyCulture(s, action.id);
      break;
    case 'levelHero':
      result = levelHero(s, action.id, action.mode);
      break;
  }
  if (result === null) return advanced;
  if (typeof result === 'string') return reject(s, before, action, result);
  const story = checkStory(result.state);
  const quests = questCompletions(s, story.state);
  return { state: story.state, events: [...before, ...result.events, ...story.events, ...quests] };
}
