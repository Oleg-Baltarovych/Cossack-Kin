// «Наказ кошового» and the chores (SPEC §3.10, §3.9 «День»; plan §0 «Квести», M2-23).
// Completion is derived, never stored: a level goal holds when the building is at its level, a count goal when the
// counter (`stats`, monotone) has grown by `n` since the quest began (`base`). Nothing in `advance` can move a level
// or a counter, so a quest is completed only by an action: `applyAction` diffs the quests before and after
// (`questCompletions`) and emits `QuestCompleted` once per quest. `claimQuest` grants the reward (steady rates,
// reward.ts) and starts the next quest:
//   chain  — the next listed step (already met → completed at once), past the list a generated step: the building
//            nearest to its next tier level, its goal fixed when it begins; with every building at max, none.
//   chores — the next one by `hash32` among the chores whose system is in the build, never the same twice in a row.
//            A reward only while fewer than CHORES.maxClaimsPerDay were claimed on the local day of `maxSeen`, which
//            never goes back: a clock set back (or a time zone moved west) gives no new day.
import { TIER_LEVELS } from '../../content/economy.ts';
import {
  BUILD_SYSTEMS,
  CHAIN,
  CHORES,
  QUEST_CHAIN,
  type ChainStep,
  type ChainStepId,
  type ChoreDef,
  type ChoreId,
  type CountGoal,
  type LevelGoal,
  type QuestGoal,
  type StatId,
  type SystemId,
} from '../../content/quests.ts';
import type { Reward } from '../../content/rewards.ts';
import { SICH_BUILDINGS } from '../../content/sich.ts';
import { FARM_BUILDING_IDS } from '../../content/villages/khortytsia.ts';
import type { GameEvent } from '../events.ts';
import { sichUnlocked } from '../modifiers.ts';
import { hash32 } from '../rng.ts';
import type { ChainState, ChoresState, GameState, QuestsState, Stats, VillageState } from '../state.ts';
import { grantReward } from './reward.ts';

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

export type QuestKind = 'chain' | 'chore';
/** A generated chain step has no id of its own: its goal is in the state. */
export type QuestId = ChainStepId | ChoreId | 'chain.generated';

/** What quests read: the land and the counters (narrow, so a raw save can be checked by the migration). */
export interface QuestFacts {
  readonly village: Pick<VillageState, 'id' | 'levels' | 'sichLevels'>;
  readonly stats: Stats;
}

/** The active quest as the UI shows it. */
export interface QuestView {
  readonly kind: QuestKind;
  readonly id: QuestId;
  readonly goal: QuestGoal;
  readonly reward: Reward;
  readonly titleKey: string;
  /** The counter when the quest began (0 for a level goal). */
  readonly base: number;
  /** The level reached, or how far the counter grew since `base`. */
  readonly progress: number;
  readonly target: number;
  readonly done: boolean;
}

/** The local day of `maxSeen` (SPEC §3.9, plan Q9): days since the epoch in the player's time zone. */
export function questDay(state: Pick<GameState, 'time' | 'settings'>): number {
  return dayAt(state.time.maxSeen, state.settings.tzOffsetMin);
}

/** The day of `ms` in the zone `tzOffsetMin` (minutes east of UTC). */
export function dayAt(ms: number, tzOffsetMin: number): number {
  return Math.max(0, Math.floor((ms + tzOffsetMin * MS_PER_MIN) / MS_PER_DAY));
}

export function statValue(stats: Stats, stat: StatId): number {
  return stats[stat];
}

function level(facts: QuestFacts, goal: LevelGoal): number {
  return goal.kind === 'building' ? facts.village.levels[goal.id] : facts.village.sichLevels[goal.id];
}

function progressOf(facts: QuestFacts, goal: QuestGoal, base: number): number {
  return goal.kind === 'count' ? statValue(facts.stats, goal.stat) - base : level(facts, goal);
}

const targetOf = (goal: QuestGoal): number => (goal.kind === 'count' ? goal.n : goal.level);

function view(
  facts: QuestFacts,
  kind: QuestKind,
  id: QuestId,
  goal: QuestGoal,
  reward: Reward,
  titleKey: string,
  base: number,
): QuestView {
  const progress = progressOf(facts, goal, base);
  const target = targetOf(goal);
  return { kind, id, goal, reward, titleKey, base, progress, target, done: progress >= target };
}

const CHAINS: Readonly<Record<VillageState['id'], readonly ChainStep[]>> = { khortytsia: QUEST_CHAIN };

/** The listed chain of the land (the chain state belongs to `village.id`; the land is not stored twice). */
export function chainSteps(facts: { readonly village: Pick<VillageState, 'id'> }): readonly ChainStep[] {
  return CHAINS[facts.village.id];
}

function listedStep(facts: QuestFacts, index: number): ChainStep {
  const step = chainSteps(facts)[index];
  // The save gate keeps a listed index inside the chain.
  if (!step) throw new Error(`quest chain: no step ${String(index)}`);
  return step;
}

/** The active chain step, or null when the chain is through (every building at max). */
export function chainQuest(state: QuestFacts & { readonly quests: QuestsState }): QuestView | null {
  const c = state.quests.chain;
  switch (c.kind) {
    case 'listed': {
      const step = listedStep(state, c.index);
      return view(state, 'chain', step.id, step.goal, step.reward, step.titleKey, c.base);
    }
    case 'generated':
      return view(
        state,
        'chain',
        'chain.generated',
        c.goal,
        CHAIN.generated.reward[c.goal.kind],
        CHAIN.generated.titleKey,
        0,
      );
    case 'done':
      return null;
  }
}

function choreDef(id: ChoreId): ChoreDef {
  const def = CHORES.pool.find((c) => c.id === id);
  // Every id of CHORE_IDS is in the pool (content test).
  if (!def) throw new Error(`chores: no ${id}`);
  return def;
}

/** The active chore (there always is one); a chore always counts. */
export function choreQuest(
  state: QuestFacts & { readonly quests: QuestsState },
): QuestView & { readonly goal: CountGoal } {
  const c = state.quests.chores;
  const def = choreDef(c.active);
  return { ...view(state, 'chore', def.id, def.goal, def.reward, def.titleKey, c.base), goal: def.goal };
}

/**
 * The chore that starts as the `n`-th: `hash32` under the content salt picks among the chores whose system is in the
 * build (`requires`), leaving out `previous` when there is a choice.
 */
export function nextChore(
  seed: number,
  n: number,
  previous: ChoreId | null,
  pool: readonly ChoreDef[] = CHORES.pool,
  systems: readonly SystemId[] = BUILD_SYSTEMS,
): ChoreDef {
  const available = pool.filter((c) => c.requires === undefined || systems.includes(c.requires));
  const others = available.filter((c) => c.id !== previous);
  const options = others.length > 0 ? others : available;
  const pick = options[hash32(hash32(seed, CHORES.salt), n) % options.length];
  // The pool always holds chores without `requires` (content test).
  if (!pick) throw new Error('chores: none available');
  return pick;
}

/**
 * The building nearest (in levels) to its next tier level; ties go to the farm, then to content order. Every farm
 * building of a land can be bought from the start (no unlock), so only Sich buildings are checked for locks (the
 * church before every farm building is at 25, the foundry before land 5); null when every one is at max.
 */
export function generatedGoal(facts: QuestFacts): LevelGoal | null {
  let best: LevelGoal | null = null;
  let bestGap = Infinity;
  const consider = (goal: LevelGoal, current: number): void => {
    const gap = goal.level - current;
    if (gap < bestGap) {
      best = goal;
      bestGap = gap;
    }
  };
  for (const id of FARM_BUILDING_IDS) {
    const l = facts.village.levels[id];
    const next = TIER_LEVELS.farm.find((t) => t > l);
    if (next !== undefined) consider({ kind: 'building', id, level: next }, l);
  }
  for (const b of SICH_BUILDINGS) {
    if (!sichUnlocked(b, facts)) continue;
    const l = facts.village.sichLevels[b.id];
    const next = TIER_LEVELS.sich.find((t) => t > l);
    if (next !== undefined) consider({ kind: 'sich', id: b.id, level: next }, l);
  }
  return best;
}

/** The chain at step `index` (past the list: a generated step), starting now. */
function chainAt(facts: QuestFacts, index: number): ChainState {
  const step = chainSteps(facts)[index];
  if (step) {
    const base = step.goal.kind === 'count' ? statValue(facts.stats, step.goal.stat) : 0;
    return { kind: 'listed', index, base };
  }
  const goal = generatedGoal(facts);
  return goal ? { kind: 'generated', goal } : { kind: 'done' };
}

/**
 * The quests of a game that has no quest state yet — a new game, or a save from before quests (the v2 → v3
 * migration): the chain on its first listed step not met yet; the met ones are passed silently, without rewards (the
 * same rule as story beats, SPEC §2.5). A count step is never «met» before it begins, so the walk stops there.
 */
export function newQuests(facts: QuestFacts, seed: number, now: number, tzOffsetMin: number): QuestsState {
  let index = 0;
  for (; index < chainSteps(facts).length; index++) {
    const goal = listedStep(facts, index).goal;
    if (goal.kind === 'count' || level(facts, goal) < goal.level) break;
  }
  const first = nextChore(seed, 0, null);
  return {
    chain: chainAt(facts, index),
    chores: {
      day: dayAt(now, tzOffsetMin),
      n: 0,
      active: first.id,
      base: statValue(facts.stats, first.goal.stat),
      claims: 0,
    },
  };
}

/** Grants the finished quest of `kind` and starts the next; 'notDone' when it is not finished (or none is left). */
export function claimQuest(state: GameState, kind: QuestKind): { state: GameState; events: GameEvent[] } | 'notDone' {
  const q = kind === 'chain' ? chainQuest(state) : choreQuest(state);
  if (!q?.done) return 'notDone';
  if (kind === 'chain') {
    const g = grantReward(state, q.reward);
    const c = state.quests.chain;
    const index = c.kind === 'listed' ? c.index + 1 : chainSteps(state).length;
    const s: GameState = { ...g.state, quests: { ...g.state.quests, chain: chainAt(g.state, index) } };
    return { state: s, events: [{ type: 'QuestClaimed', kind, id: q.id, granted: g.granted }] };
  }
  const c = state.quests.chores;
  const day = Math.max(c.day, questDay(state));
  const claims = day > c.day ? 0 : c.claims;
  const g = claims < CHORES.maxClaimsPerDay ? grantReward(state, q.reward) : null;
  const s = g ? g.state : state;
  const next = nextChore(s.seed, c.n + 1, c.active);
  const chores: ChoresState = {
    day,
    n: c.n + 1,
    active: next.id,
    base: statValue(s.stats, next.goal.stat),
    claims: claims + 1,
  };
  return {
    state: { ...s, quests: { ...s.quests, chores } },
    events: [{ type: 'QuestClaimed', kind, id: q.id, granted: g ? g.granted : null }],
  };
}

/** Which quest is active: a different key is a different quest. */
function chainKey(c: ChainState): string {
  switch (c.kind) {
    case 'listed':
      return `l${String(c.index)}`;
    case 'generated':
      return `g:${c.goal.kind}:${c.goal.id}:${String(c.goal.level)}`;
    case 'done':
      return 'done';
  }
}

/** `QuestCompleted` for each quest finished in `after` that was not already finished (as the same quest) in `before`. */
export function questCompletions(before: GameState, after: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const chainNow = chainQuest(after);
  if (chainNow?.done) {
    const same = chainKey(before.quests.chain) === chainKey(after.quests.chain);
    if (!same || !chainQuest(before)?.done) events.push({ type: 'QuestCompleted', kind: 'chain', id: chainNow.id });
  }
  const choreNow = choreQuest(after);
  if (choreNow.done) {
    const same = before.quests.chores.n === after.quests.chores.n;
    if (!same || !choreQuest(before).done) events.push({ type: 'QuestCompleted', kind: 'chore', id: choreNow.id });
  }
  return events;
}
