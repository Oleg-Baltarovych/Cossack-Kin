// Where a tap on the quest strip leads (plan M3-15, SPEC §10.3, SPEC-REVIEW R-M2-25): the core names the target of the
// shown quest — a building row, the hire row, a raid slot, or a hint for counters with no row — the UI only maps it.
import { describe, expect, it } from 'vitest';
import { CHORES, QUEST_CHAIN, type QuestGoal } from '../../../src/content/quests.ts';
import type { SichUnlock } from '../../../src/content/sich.ts';
import { Big } from '../../../src/core/big.ts';
import { questTarget, stripQuestKind, type QuestTarget } from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { raidTier, type RaidSlot } from '../../../src/core/systems/raids.ts';

const T0 = 1_763_400_000_000;
const SEC = 1000;
const IDLE: RaidSlot = { kind: 'idle' };

function game(): GameState {
  return createInitialState({ seed: 5, now: T0 });
}

function onStep(s: GameState, index: number): GameState {
  return { ...s, quests: { ...s.quests, chain: { kind: 'listed', index, base: 0 } } };
}

function onChore(s: GameState, id: (typeof CHORES.pool)[number]['id']): GameState {
  return { ...s, quests: { ...s.quests, chores: { ...s.quests.chores, active: id, base: 0 } } };
}

function withSlots(s: GameState, slots: readonly RaidSlot[]): GameState {
  return { ...s, raids: { ...s.raids, slots } };
}

function raid(startedAt: number): RaidSlot {
  return {
    kind: 'running',
    raid: {
      region: 'porohy',
      tier: 'h1',
      startedAt,
      returnAt: startedAt + raidTier('h1').durationSec * SEC,
      success: true,
      rumor: false,
      loot: { ducats: Big.from(1), glory: Big.from(1), pysanky: 0, relic: null },
    },
  };
}

/** A new game's lock of a Sich building: the church waits for every farm building at 25 (the rest are open). */
const lockOf = (id: string): SichUnlock | null => (id === 'church' ? { kind: 'farmAll', level: 25 } : null);

/** The target a goal must lead to with every slot idle (raid steps → the first slot). */
function expected(goal: QuestGoal): QuestTarget {
  if (goal.kind === 'building') return { kind: 'farm', id: goal.id };
  if (goal.kind === 'sich') return { kind: 'sich', id: goal.id, locked: lockOf(goal.id) };
  switch (goal.stat) {
    case 'hires':
      return { kind: 'hire' };
    case 'raidsSent':
    case 'raidsDone':
      return { kind: 'raid', slot: 0 };
    case 'taps':
    case 'tapIncomeSec':
      return { kind: 'tap' };
    case 'purchases':
    case 'levelsBought':
      return { kind: 'none' };
  }
}

describe('questTarget: chain steps (M3-15)', () => {
  it.each(QUEST_CHAIN.map((step, index) => [step.id, index] as const))('%s', (_id, index) => {
    const step = QUEST_CHAIN[index];
    if (!step) throw new Error('no step');
    expect(questTarget(onStep(game(), index), 'chain')).toEqual(expected(step.goal));
  });

  it('every kind of step is covered by the list: a farm, a Sich building, the hire row and a raid slot', () => {
    const kinds = new Set(QUEST_CHAIN.map((_, i) => questTarget(onStep(game(), i), 'chain').kind));
    expect([...kinds].sort()).toEqual(['farm', 'hire', 'raid', 'sich']);
  });

  it('a generated step leads to its building (farm or Sich)', () => {
    const s = game();
    const gen = (goal: Extract<GameState['quests']['chain'], { kind: 'generated' }>['goal']): GameState => ({
      ...s,
      quests: { ...s.quests, chain: { kind: 'generated', goal } },
    });
    expect(questTarget(gen({ kind: 'building', id: 'potter', level: 50 }), 'chain')).toEqual({
      kind: 'farm',
      id: 'potter',
    });
    expect(questTarget(gen({ kind: 'sich', id: 'maidan', level: 25 }), 'chain')).toEqual({
      kind: 'sich',
      id: 'maidan',
      locked: null,
    });
  });

  it('a locked Sich goal carries its unlock (the UI says why instead of «lit»); open once the condition holds', () => {
    const church = QUEST_CHAIN.findIndex((q) => q.id === 'khortytsia.church1');
    const s = onStep(game(), church);
    expect(questTarget(s, 'chain')).toEqual({ kind: 'sich', id: 'church', locked: { kind: 'farmAll', level: 25 } });
    const levels = Object.fromEntries(Object.keys(s.village.levels).map((id) => [id, 25]));
    const open = { ...s, village: { ...s.village, levels: { ...s.village.levels, ...levels } } };
    expect(questTarget(open, 'chain')).toEqual({ kind: 'sich', id: 'church', locked: null });
    // A building of a later land (hidden in land 1): its land.
    const hidden = {
      ...s,
      quests: { ...s.quests, chain: { kind: 'generated', goal: { kind: 'sich', id: 'cannonry', level: 1 } } },
    } as const;
    expect(questTarget(hidden, 'chain')).toEqual({ kind: 'sich', id: 'cannonry', locked: { kind: 'land', land: 5 } });
  });

  it('the chain through: nothing to lead to', () => {
    const s = game();
    expect(questTarget({ ...s, quests: { ...s.quests, chain: { kind: 'done' } } }, 'chain')).toEqual({ kind: 'none' });
  });
});

describe('questTarget: chores (M3-15)', () => {
  it.each(CHORES.pool.map((c) => [c.id, c] as const))('%s', (id, def) => {
    expect(questTarget(onChore(game(), id), 'chore')).toEqual(expected(def.goal));
  });

  it('counters: taps lead to a tap hint, purchases and levels (no one row) to a plain hint', () => {
    const kinds = CHORES.pool.map((c) => questTarget(onChore(game(), c.id), 'chore').kind);
    expect(kinds).toContain('tap');
    expect(kinds).toContain('none');
  });
});

describe('questTarget: which raid slot (M3-15)', () => {
  const back = raid(T0 - raidTier('h1').durationSec * SEC - SEC);
  const road = raid(T0);

  it('«send a raid»: the first idle slot («Обрати похід»), else a returned one («Ще раз»), else the first', () => {
    const sent = onChore(game(), 'chore.raid1');
    expect(questTarget(withSlots(sent, [road, IDLE]), 'chore')).toEqual({ kind: 'raid', slot: 1 });
    expect(questTarget(withSlots(sent, [road, back]), 'chore')).toEqual({ kind: 'raid', slot: 1 });
    expect(questTarget(withSlots(sent, [road, road]), 'chore')).toEqual({ kind: 'raid', slot: 0 });
  });

  it('«finish raids»: a returned slot («Забрати») first, else one on the road, else an idle one', () => {
    const done = onChore(game(), 'chore.raids2');
    expect(questTarget(withSlots(done, [IDLE, back]), 'chore')).toEqual({ kind: 'raid', slot: 1 });
    expect(questTarget(withSlots(done, [IDLE, road]), 'chore')).toEqual({ kind: 'raid', slot: 1 });
    expect(questTarget(withSlots(done, [IDLE, IDLE]), 'chore')).toEqual({ kind: 'raid', slot: 0 });
  });
});

describe('questTarget: the strip (M3-15)', () => {
  it('without a kind it leads to the quest the strip shows', () => {
    const s = onChore(onStep(game(), 0), 'chore.taps50');
    expect(stripQuestKind(s)).toBe('chain');
    expect(questTarget(s)).toEqual({ kind: 'farm', id: 'field' });
    // The chore done and paying: the strip shows it, the tap follows it.
    const done = { ...s, stats: { ...s.stats, taps: 50 } };
    expect(stripQuestKind(done)).toBe('chore');
    expect(questTarget(done)).toEqual({ kind: 'tap' });
  });
});
