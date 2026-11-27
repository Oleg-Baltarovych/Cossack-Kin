// Quests with raids (plan M3-07, SPEC §3.10, Q7): the chain step `raid1` and the raid chores are completed by the real
// raid actions — `startRaid` moves `raidsSent`, `claimRaid` moves `raidsDone` — counted from the quest's `base`.
import { describe, expect, it } from 'vitest';
import { CHORES, type ChoreId } from '../../../src/content/quests.ts';
import type { RaidTierId } from '../../../src/content/raids.ts';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { createInitialState, validateState, type GameState } from '../../../src/core/state.ts';
import { chainQuest, choreQuest } from '../../../src/core/systems/quests.ts';

const T0 = 1_763_400_000_000; // 2025-11-17 17:20 UTC
const HOUR = 3_600_000;

const of = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** Applies `action` at `now`; throws when it is refused (a refusal here is a broken test setup). */
function act(s: GameState, action: Action, now: number): { state: GameState; events: readonly GameEvent[] } {
  const r = applyAction(s, action, now);
  const no = of(r.events, 'ActionRejected')[0];
  if (no) throw new Error(`${action.type} refused: ${no.reason}`);
  return r;
}

/**
 * A new game with money for anything, every story beat seen (beats are story.test's business) and a farm that feeds a
 * few Cossacks (hiring needs kharch): the chain still stands on its first step.
 */
function newGame(seed = 5): GameState {
  const s = createInitialState({ seed, now: T0 });
  return {
    ...s,
    village: { ...s.village, levels: { ...s.village.levels, field: 30, garden: 12 } },
    story: { seen: [...STORY_BEAT_IDS] },
    currencies: { ...s.currencies, ducats: Big.from(1e30), glory: Big.from(1e30) },
  };
}

/** `s` with three Cossacks hired. */
const withArmy = (s: GameState): GameState => act(s, { type: 'hire', n: 3 }, T0).state;

/** Sends `tier` from slot 0, lets it come back and claims it. */
function raidAndClaim(s: GameState, tier: RaidTierId = 'm5'): { state: GameState; events: readonly GameEvent[] } {
  const now = s.time.lastSeen;
  const sent = act(s, { type: 'startRaid', slot: 0, tier }, now).state;
  const slot = sent.raids.slots[0];
  if (slot?.kind !== 'running') throw new Error('slot 0 is not running');
  const back = advance(sent, slot.raid.returnAt).state;
  return act(back, { type: 'claimRaid', slot: 0 }, slot.raid.returnAt);
}

/** `s` with `id` as the active chore, begun now. */
function withChore(s: GameState, id: ChoreId): GameState {
  const def = CHORES.pool.find((c) => c.id === id);
  if (!def) throw new Error(id);
  return { ...s, quests: { ...s.quests, chores: { ...s.quests.chores, active: id, base: s.stats[def.goal.stat] } } };
}

describe('the chain step `raid1` (M3-07, Q7)', () => {
  it('a new game: field → garden → hire → «Відправ у розвідку» is done by the first real startRaid and pays', () => {
    let s = newGame();
    expect(chainQuest(s)?.id).toBe('khortytsia.field1');
    s = act(s, { type: 'claimQuest', kind: 'chain' }, T0).state;
    s = act(s, { type: 'claimQuest', kind: 'chain' }, T0).state;
    expect(chainQuest(s)).toMatchObject({ id: 'khortytsia.hire1', done: false });
    s = act(s, { type: 'hire', n: 1 }, T0).state;
    s = act(s, { type: 'claimQuest', kind: 'chain' }, T0).state;
    expect(chainQuest(s)).toMatchObject({ id: 'khortytsia.raid1', done: false, progress: 0, target: 1 });

    const sent = act(s, { type: 'startRaid', slot: 0, tier: 'm5' }, T0 + 1000);
    expect(of(sent.events, 'QuestCompleted')).toContainEqual({
      type: 'QuestCompleted',
      kind: 'chain',
      id: 'khortytsia.raid1',
    });
    const claimed = act(sent.state, { type: 'claimQuest', kind: 'chain' }, T0 + 2000);
    expect(of(claimed.events, 'QuestClaimed')[0]).toMatchObject({ kind: 'chain', id: 'khortytsia.raid1' });
    expect(of(claimed.events, 'QuestClaimed')[0]?.granted).not.toBeNull();
    expect(chainQuest(claimed.state)?.id).toBe('khortytsia.field10');
    expect(validateState(JSON.parse(JSON.stringify(claimed.state))).ok).toBe(true);
  });

  it('counts from its start: a raid sent before the step began does not finish it', () => {
    let s = newGame();
    s = act(s, { type: 'hire', n: 1 }, T0).state;
    s = act(s, { type: 'startRaid', slot: 0, tier: 'm5' }, T0).state;
    expect(chainQuest(s)?.id).toBe('khortytsia.field1');
    // Field and garden (met) claimed; `hire1` counts from its own start too, so one more hire; then `raid1` begins
    // with base = 1 raid sent.
    for (let i = 0; i < 2; i++) s = act(s, { type: 'claimQuest', kind: 'chain' }, T0).state;
    s = act(s, { type: 'hire', n: 1 }, T0).state;
    s = act(s, { type: 'claimQuest', kind: 'chain' }, T0).state;
    expect(chainQuest(s)).toMatchObject({ id: 'khortytsia.raid1', base: 1, done: false });
    // Slot 0 is still out on the raid sent before the step began: the step's own raid goes from slot 1.
    const next = act(s, { type: 'startRaid', slot: 1, tier: 'm5' }, T0 + 1000);
    expect(chainQuest(next.state)?.done).toBe(true);
  });
});

describe('raid chores (M3-07)', () => {
  const RAID_CHORES = new Set<string>(CHORES.pool.filter((c) => c.requires === 'raids').map((c) => c.id));

  /**
   * The ids of `claims` chores in a row, each met (its counter set straight to the goal — only the picks matter here)
   * and claimed through the action.
   */
  function rotation(s: GameState, claims: number): string[] {
    const ids: string[] = [];
    let t = s.time.lastSeen;
    for (let i = 0; i < claims; i++) {
      const q = choreQuest(s);
      ids.push(q.id);
      const met: GameState = { ...s, stats: { ...s.stats, [q.goal.stat]: q.base + q.goal.n } };
      t += 1000;
      s = act(met, { type: 'claimQuest', kind: 'chore' }, t).state;
    }
    return ids;
  }

  it('review: a new game (no Cossacks) never starts on a raid chore', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = createInitialState({ seed, now: T0 });
      expect(RAID_CHORES.has(choreQuest(s).id), `seed ${String(seed)}`).toBe(false);
    }
  });

  it('review: without an army that can start a raid, the rotation never offers a raid chore (no softlock)', () => {
    for (const seed of [1, 2, 3, 5, 8]) {
      const ids = rotation(newGame(seed), 150);
      expect(
        ids.filter((id) => RAID_CHORES.has(id)),
        `seed ${String(seed)}`,
      ).toEqual([]);
    }
  });

  it('review: once the army can start the lowest tier, raid chores come up', () => {
    const ids = rotation(withArmy(newGame()), 150);
    expect(ids.some((id) => RAID_CHORES.has(id))).toBe(true);
  });

  it('«Відправ похід»: the real startRaid finishes it; the claim pays and starts the next chore', () => {
    const s = withChore(withArmy(newGame()), 'chore.raid1');
    expect(choreQuest(s)).toMatchObject({ id: 'chore.raid1', done: false, target: 1 });
    const sent = act(s, { type: 'startRaid', slot: 0, tier: 'm5' }, T0 + 1000);
    expect(of(sent.events, 'QuestCompleted')).toContainEqual({
      type: 'QuestCompleted',
      kind: 'chore',
      id: 'chore.raid1',
    });
    const claimed = act(sent.state, { type: 'claimQuest', kind: 'chore' }, T0 + 2000);
    expect(of(claimed.events, 'QuestClaimed')[0]).toMatchObject({ kind: 'chore', id: 'chore.raid1' });
    expect(of(claimed.events, 'QuestClaimed')[0]?.granted).not.toBeNull();
    expect(choreQuest(claimed.state).id).not.toBe('chore.raid1');
  });

  it('«Заверши 2 походи»: sending is not enough — two claimed raids (from its start) finish it', () => {
    let s = withChore(withArmy(newGame()), 'chore.raids2');
    s = raidAndClaim(s).state;
    expect(choreQuest(s)).toMatchObject({ id: 'chore.raids2', progress: 1, done: false });
    s = act(s, { type: 'startRaid', slot: 0, tier: 'm5' }, s.time.lastSeen).state;
    expect(choreQuest(s).done).toBe(false);
    const slot = s.raids.slots[0];
    if (slot?.kind !== 'running') throw new Error('slot 0 is not running');
    const back = advance(s, slot.raid.returnAt + HOUR).state;
    // A raid back home but not claimed is not done yet: time alone never completes a quest.
    expect(choreQuest(back).done).toBe(false);
    const claimed = act(back, { type: 'claimRaid', slot: 0 }, back.time.lastSeen);
    expect(of(claimed.events, 'QuestCompleted')).toContainEqual({
      type: 'QuestCompleted',
      kind: 'chore',
      id: 'chore.raids2',
    });
  });
});
