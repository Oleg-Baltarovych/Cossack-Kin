// Quests of M2 (SPEC §3.10; plan §0 «Квести», M2-23): «Наказ кошового» — one active step of the land's chain in the
// order of the discovery calendar (SPEC §2.4), then generated «raise the nearest building to its next milestone»;
// and chores — always one active, the next one picked by `hash32` among the chores whose system is in this build,
// at most `CHORES.maxClaimsPerDay` rewards a day (after that only the counter runs). Daily and weekly quests are M6.
// Completion is derived (a level reached, or a counter grown by `n` since the step began — `base` in the state); the
// player takes the reward with `claimQuest`. Texts: i18n `quest.<id>.title` (`{count}` = the goal's `n`, plurals in
// the locale). Reward sizes: гіпотеза, kept small and scale-free (minutes of income / glory, SPEC §3.10 «5–15 хв»,
// chores «3–10 хв»); M2-27 retunes them with the story beats once the balance bot claims quests (plan R4).
// FROZEN ONCE SHIPPED: chain step ids, chore ids and their order (saves store a chain index and a chore id; the v2 → v3
// migration walks this chain). Append only — removing, renaming or reordering one needs a save migration. Goals and
// rewards may be retuned.
import type { Reward } from './rewards.ts';
import type { SichBuildingId } from './sich.ts';
import type { FarmBuildingId } from './villages/khortytsia.ts';

/** A building of the land (farm/suburb) or of the Sich at `level` or above. */
export type LevelGoal =
  | { readonly kind: 'building'; readonly id: FarmBuildingId; readonly level: number }
  | { readonly kind: 'sich'; readonly id: SichBuildingId; readonly level: number };

/** The monotone counters a quest can count (`GameState.stats`). */
export type StatId = 'taps' | 'purchases' | 'levelsBought' | 'hires' | 'tapIncomeSec';

/** `stat` grown by `n` since the quest began. */
export interface CountGoal {
  readonly kind: 'count';
  readonly stat: StatId;
  readonly n: number;
}

export type QuestGoal = LevelGoal | CountGoal;

/**
 * Systems a quest can need that this build may not have: a chore with `requires` is offered only when its system is in
 * `BUILD_SYSTEMS`. Raids («Відправ похід», with a `raidsSent` counter) come with M3, storks with M6.
 */
export type SystemId = 'raids' | 'storks';
export const BUILD_SYSTEMS: readonly SystemId[] = [];

export const CHAIN_STEP_IDS = [
  'khortytsia.field1',
  'khortytsia.garden1',
  'khortytsia.field10',
  'khortytsia.apiary1',
  'khortytsia.hire1',
  'khortytsia.kurins1',
  'khortytsia.windmill1',
  'khortytsia.hire3',
  'khortytsia.garden10',
  'khortytsia.potter1',
  'khortytsia.maidan1',
  'khortytsia.windmill10',
  'khortytsia.smithy1',
  'khortytsia.maidan10',
  'khortytsia.apiary10',
  'khortytsia.tavern1',
  'khortytsia.walls1',
  'khortytsia.hire10',
  'khortytsia.fair1',
  'khortytsia.potter10',
  'khortytsia.treasury1',
  'khortytsia.field25',
  'khortytsia.smithy10',
  'khortytsia.tavern10',
  'khortytsia.kurins10',
  'khortytsia.fair10',
  'khortytsia.church1',
  'khortytsia.field50',
] as const;
export type ChainStepId = (typeof CHAIN_STEP_IDS)[number];

export interface ChainStep {
  readonly id: ChainStepId;
  readonly land: 'khortytsia';
  readonly goal: QuestGoal;
  readonly reward: Reward;
  readonly titleKey: string;
}

const income = (minutes: number): Reward => ({ kind: 'incomeMinutes', minutes });
const glory = (minutes: number): Reward => ({ kind: 'gloryMinutes', minutes });
const pysanky = (n: number): Reward => ({ kind: 'pysanky', n });

/** Reward sizes of the chain (гіпотеза, M2-27). */
const STEP = { income: income(5), glory: glory(3) } as const;

function step(id: ChainStepId, goal: QuestGoal, reward: Reward): ChainStep {
  return { id, land: 'khortytsia', goal, reward, titleKey: `quest.${id}.title` };
}
const farm = (id: FarmBuildingId, level: number): LevelGoal => ({ kind: 'building', id, level });
const sich = (id: SichBuildingId, level: number): LevelGoal => ({ kind: 'sich', id, level });
const hired = (n: number): CountGoal => ({ kind: 'count', stat: 'hires', n });

/** Land 1, in the order of the calendar (SPEC §2.4 S1…S8). The first five are the onboarding (SPEC §10, M9). */
export const QUEST_CHAIN: readonly ChainStep[] = [
  step('khortytsia.field1', farm('field', 1), STEP.income),
  step('khortytsia.garden1', farm('garden', 1), STEP.income),
  step('khortytsia.field10', farm('field', 10), STEP.income),
  step('khortytsia.apiary1', farm('apiary', 1), STEP.income),
  step('khortytsia.hire1', hired(1), STEP.glory),
  step('khortytsia.kurins1', sich('kurins', 1), STEP.glory),
  step('khortytsia.windmill1', farm('windmill', 1), STEP.income),
  step('khortytsia.hire3', hired(3), STEP.glory),
  step('khortytsia.garden10', farm('garden', 10), STEP.income),
  step('khortytsia.potter1', farm('potter', 1), STEP.income),
  step('khortytsia.maidan1', sich('maidan', 1), STEP.glory),
  step('khortytsia.windmill10', farm('windmill', 10), STEP.income),
  step('khortytsia.smithy1', farm('smithy', 1), STEP.income),
  step('khortytsia.maidan10', sich('maidan', 10), STEP.glory),
  step('khortytsia.apiary10', farm('apiary', 10), STEP.income),
  step('khortytsia.tavern1', farm('tavern', 1), STEP.income),
  step('khortytsia.walls1', sich('walls', 1), STEP.glory),
  step('khortytsia.hire10', hired(10), STEP.glory),
  step('khortytsia.fair1', farm('fair', 1), pysanky(2)),
  step('khortytsia.potter10', farm('potter', 10), STEP.income),
  step('khortytsia.treasury1', sich('treasury', 1), STEP.glory),
  step('khortytsia.field25', farm('field', 25), STEP.income),
  step('khortytsia.smithy10', farm('smithy', 10), STEP.income),
  step('khortytsia.tavern10', farm('tavern', 10), STEP.income),
  step('khortytsia.kurins10', sich('kurins', 10), STEP.glory),
  step('khortytsia.fair10', farm('fair', 10), STEP.income),
  // The church can be bought once every farm building is at 25 (SPEC §3.2.1): this step waits for that.
  step('khortytsia.church1', sich('church', 1), pysanky(3)),
  step('khortytsia.field50', farm('field', 50), STEP.income),
];

/** After the list: generated steps (SPEC §3.10). The reward follows the building's currency. */
export const CHAIN = {
  generated: {
    reward: { building: income(5), sich: glory(3) },
    /** `{building}` = the building's name, `{level}` = the target level. */
    titleKey: 'quest.chain.generated.title',
  },
} as const satisfies { generated: { reward: Readonly<Record<LevelGoal['kind'], Reward>>; titleKey: string } };

export const CHORE_IDS = [
  'chore.taps50',
  'chore.taps200',
  'chore.tapIncome60',
  'chore.levels10',
  'chore.levels25',
  'chore.purchases10',
  'chore.hire3',
  'chore.hire10',
] as const;
export type ChoreId = (typeof CHORE_IDS)[number];

export interface ChoreDef {
  readonly id: ChoreId;
  /** A chore repeats: it can only count (a level, once reached, stays reached). */
  readonly goal: CountGoal;
  readonly reward: Reward;
  /** Offered only when this system is in the build (`BUILD_SYSTEMS`). */
  readonly requires?: SystemId;
  readonly titleKey: string;
}

function chore(id: ChoreId, stat: StatId, n: number, reward: Reward): ChoreDef {
  return { id, goal: { kind: 'count', stat, n }, reward, titleKey: `quest.${id}.title` };
}

const CHORE_POOL: readonly ChoreDef[] = [
  chore('chore.taps50', 'taps', 50, income(3)),
  chore('chore.taps200', 'taps', 200, income(5)),
  // Seconds of income by taps: each tap adds TAP.incomeShare (0.3 s), so 60 s ≈ 200 taps.
  chore('chore.tapIncome60', 'tapIncomeSec', 60, income(5)),
  chore('chore.levels10', 'levelsBought', 10, income(3)),
  chore('chore.levels25', 'levelsBought', 25, income(5)),
  chore('chore.purchases10', 'purchases', 10, income(3)),
  chore('chore.hire3', 'hires', 3, glory(3)),
  chore('chore.hire10', 'hires', 10, glory(5)),
];

export const CHORES = {
  /** Rewards a day (SPEC §3.10); the day is the local one of `maxSeen` (SPEC §3.9, plan Q9). */
  maxClaimsPerDay: 10,
  /** Keys the `hash32` stream of the chore picks; frozen (the active chore is stored, but the rotation should stay). */
  salt: 0xc407,
  /** In the order of CHORE_IDS. */
  pool: CHORE_POOL,
} as const;
