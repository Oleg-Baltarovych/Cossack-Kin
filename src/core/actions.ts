// Player actions (SPEC §3.2–3.4, §3.8; plan §0, M1-10, Q8). One pure reducer: `applyAction(state, action, now)`
// first advances time to `now` (income up to the click is earned), then applies the action. A refused action leaves
// the (advanced) state as it is and adds `ActionRejected` with the reason — never a throw for a player error.
import { FARM, SICH, TAP } from '../content/economy.ts';
import { SICH_BUILDINGS, type SichBuildingId } from '../content/sich.ts';
import type { FarmBuildingId } from '../content/villages/khortytsia.ts';
import { advance } from './advance.ts';
import { Big } from './big.ts';
import { bulkCost, buyCount, tier, type BuyMode } from './economy.ts';
import type { GameEvent, RejectReason } from './events.ts';
import { collectModifiers, farmIncomeRate, sichUnlocked, villageOf } from './modifiers.ts';
import type { GameState, Lang, NumberFormat } from './state.ts';
import { creditReport } from './offline.ts';
import { canHire } from './systems/army.ts';

export type Action =
  | { readonly type: 'buyBuilding'; readonly id: FarmBuildingId; readonly mode: BuyMode }
  | { readonly type: 'buySich'; readonly id: SichBuildingId; readonly mode: BuyMode }
  | { readonly type: 'hire'; readonly n: number }
  | { readonly type: 'tap' }
  | { readonly type: 'claimReturn' }
  | { readonly type: 'setSettings'; readonly lang?: Lang; readonly numberFormat?: NumberFormat };

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
      stats: { ...s.stats, purchases: s.stats.purchases + 1 },
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
      stats: { ...s.stats, purchases: s.stats.purchases + 1 },
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
      stats: { ...s.stats, taps: s.stats.taps + 1 },
      tapWindow: { start: second.start, count: second.count + 1 },
    },
    events: [{ type: 'Tapped', amount }],
  };
}

function claimReturn(s: GameState): ActionResult | RejectReason {
  return s.returnReport ? creditReport(s) : 'noReport';
}

/** Advances to `now`, then applies `action`; refusals come back as `ActionRejected` with the state unchanged. */
export function applyAction(state: GameState, action: Action, now: number): ActionResult {
  const advanced = advance(state, now);
  const s = advanced.state;
  const before = advanced.events;
  let result: ActionResult | RejectReason | null;
  switch (action.type) {
    case 'buyBuilding':
      result = buyBuilding(s, action, now);
      break;
    case 'buySich':
      result = buySich(s, action);
      break;
    case 'hire':
      result = hire(s, action, now);
      break;
    case 'tap':
      result = tap(s, now);
      break;
    case 'claimReturn':
      result = claimReturn(s);
      break;
    case 'setSettings':
      result = {
        state: {
          ...s,
          settings: {
            lang: action.lang ?? s.settings.lang,
            numberFormat: action.numberFormat ?? s.settings.numberFormat,
          },
        },
        events: [],
      };
      break;
  }
  if (result === null) return advanced;
  if (typeof result === 'string') return reject(s, before, action, result);
  return { state: result.state, events: [...before, ...result.events] };
}
