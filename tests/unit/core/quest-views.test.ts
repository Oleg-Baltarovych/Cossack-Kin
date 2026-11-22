// What the quest strip and the story modal read (plan M2-25, SPEC §3.10, §2.5): the core says what each line shows,
// whether a claim pays, and whether anything waits to be claimed — the UI computes none of it.
import { describe, expect, it } from 'vitest';
import { CHORES, QUEST_CHAIN } from '../../../src/content/quests.ts';
import { STORY_BEATS } from '../../../src/content/story.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import {
  questClaimable,
  questLineView,
  storyBeatView,
  stripQuestKind,
  type QuestLineView,
} from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { choreQuest, choreRewardsLeft } from '../../../src/core/systems/quests.ts';

const T0 = 1_763_400_000_000; // 2025-11-17 17:20 UTC
const DAY = 86_400_000;

function game(seed = 5, now = T0): GameState {
  const s = createInitialState({ seed, now });
  return { ...s, currencies: { ...s.currencies, ducats: Big.from(1e30), glory: Big.from(1e30) } };
}

/** The chain on listed step `id`, begun when its counter stood at `base`. */
function onStep(s: GameState, id: string, base = 0): GameState {
  const index = QUEST_CHAIN.findIndex((q) => q.id === id);
  if (index < 0) throw new Error(`no step ${id}`);
  return { ...s, quests: { ...s.quests, chain: { kind: 'listed', index, base } } };
}

/** The active chore finished (its counter grown by its n). */
function choreDone(s: GameState): GameState {
  const q = choreQuest(s);
  return { ...s, stats: { ...s.stats, [q.goal.stat]: q.base + q.goal.n } };
}

function chain(s: GameState): QuestLineView {
  const v = questLineView(s, 'chain');
  if (!v) throw new Error('no chain line');
  return v;
}

function chore(s: GameState): QuestLineView {
  const v = questLineView(s, 'chore');
  if (!v) throw new Error('no chore line');
  return v;
}

describe('quest lines (M2-25)', () => {
  it('a new game: the first chain step, nothing done, its title key and reward from content', () => {
    const v = chain(game());
    const first = QUEST_CHAIN[0];
    expect(v).toMatchObject({
      kind: 'chain',
      id: first?.id,
      titleKey: first?.titleKey,
      progress: 0,
      target: 1,
      done: false,
      rewarded: true,
      reward: first?.reward,
      buildingKey: null,
    });
  });

  it('a level step shows the level reached against the target', () => {
    const s = onStep(game(), 'khortytsia.field10');
    const v = chain({ ...s, village: { ...s.village, levels: { ...s.village.levels, field: 4 } } });
    expect(v).toMatchObject({ progress: 4, target: 10, done: false });
  });

  it('a count step counts from its start and never shows more than its target', () => {
    const s = onStep(game(), 'khortytsia.hire3', 2);
    expect(chain({ ...s, stats: { ...s.stats, hires: 3 } })).toMatchObject({ progress: 1, target: 3, done: false });
    expect(chain({ ...s, stats: { ...s.stats, hires: 9 } })).toMatchObject({ progress: 3, target: 3, done: true });
  });

  it("a generated step names its building (the land's name key) and its level", () => {
    const s = game();
    const farm = {
      ...s,
      quests: { ...s.quests, chain: { kind: 'generated', goal: { kind: 'building', id: 'potter', level: 50 } } },
    } as const;
    expect(chain(farm)).toMatchObject({ buildingKey: 'building.potter.name', target: 50, id: 'chain.generated' });
    const sich = {
      ...s,
      quests: { ...s.quests, chain: { kind: 'generated', goal: { kind: 'sich', id: 'special', level: 10 } } },
    } as const;
    // The land's own Sich building takes its name from the land.
    expect(chain(sich).buildingKey).toBe('sich.special.khortytsia.name');
  });

  it('the chain through: no chain line', () => {
    const s = game();
    expect(questLineView({ ...s, quests: { ...s.quests, chain: { kind: 'done' } } }, 'chain')).toBeNull();
  });

  it('the chore line says whether its claim pays: exactly when the claim grants something', () => {
    let s = game();
    for (let i = 0; i < CHORES.maxClaimsPerDay + 2; i++) {
      s = choreDone(s);
      const shown = chore(s);
      const r = applyAction(s, { type: 'claimQuest', kind: 'chore' }, s.time.lastSeen);
      const claimed = r.events.find((e) => e.type === 'QuestClaimed');
      if (claimed?.type !== 'QuestClaimed') throw new Error('not claimed');
      expect(claimed.granted !== null, `claim ${String(i + 1)}`).toBe(shown.rewarded);
      expect(shown.rewarded, `claim ${String(i + 1)}`).toBe(i < CHORES.maxClaimsPerDay);
      s = r.state;
    }
  });
});

describe('chore rewards left today (M2-25: the 11th claim is warned about)', () => {
  it('counts down with the claims of the day and is full again on the next local day', () => {
    let s = game();
    expect(choreRewardsLeft(s)).toBe(CHORES.maxClaimsPerDay);
    for (let i = 0; i < 3; i++) s = applyAction(choreDone(s), { type: 'claimQuest', kind: 'chore' }, T0).state;
    expect(choreRewardsLeft(s)).toBe(CHORES.maxClaimsPerDay - 3);
    const spent = { ...s, quests: { ...s.quests, chores: { ...s.quests.chores, claims: CHORES.maxClaimsPerDay } } };
    expect(choreRewardsLeft(spent)).toBe(0);
    expect(chore(spent).rewarded).toBe(false);
    // The next day by the game's own clock (maxSeen), not by a claim: the counter of the old day no longer applies.
    const tomorrow = { ...spent, time: { ...spent.time, lastSeen: T0 + DAY, maxSeen: T0 + DAY } };
    expect(choreRewardsLeft(tomorrow)).toBe(CHORES.maxClaimsPerDay);
    expect(chore(tomorrow).rewarded).toBe(true);
  });
});

describe('something to claim (the red dot, M2-25)', () => {
  it('nothing on a new game', () => {
    expect(questClaimable(game())).toBe(false);
  });

  it('a finished chain step', () => {
    const s = game();
    expect(questClaimable({ ...s, village: { ...s.village, levels: { ...s.village.levels, field: 1 } } })).toBe(true);
  });

  it('a finished chore while it still pays; a finished chore past the day limit is no news', () => {
    const done = choreDone(game());
    expect(questClaimable(done)).toBe(true);
    const spent = {
      ...done,
      quests: { ...done.quests, chores: { ...done.quests.chores, claims: CHORES.maxClaimsPerDay } },
    };
    expect(questClaimable(spent)).toBe(false);
  });
});

describe('the one-line strip in the sheet (M2-25 review, SPEC §10.3)', () => {
  const field = (s: GameState, level: number): GameState => ({
    ...s,
    village: { ...s.village, levels: { ...s.village.levels, field: level } },
  });

  it('shows the chain step while nothing waits', () => {
    expect(stripQuestKind(game())).toBe('chain');
  });

  it('a claim waiting comes first: the chain step before the chore', () => {
    expect(stripQuestKind(choreDone(game()))).toBe('chore');
    expect(stripQuestKind(field(choreDone(game()), 1))).toBe('chain');
  });

  it('a chore past the day limit is no claim: the chain step stays', () => {
    const done = choreDone(game());
    const spent = {
      ...done,
      quests: { ...done.quests, chores: { ...done.quests.chores, claims: CHORES.maxClaimsPerDay } },
    };
    expect(stripQuestKind(spent)).toBe('chain');
  });

  it('the chain through: the chore', () => {
    const s = game();
    expect(stripQuestKind({ ...s, quests: { ...s.quests, chain: { kind: 'done' } } })).toBe('chore');
  });
});

describe('story beat view (M2-25)', () => {
  it('every beat: its title, text and portrait from content', () => {
    for (const b of STORY_BEATS)
      expect(storyBeatView(b.id)).toEqual({ titleKey: b.titleKey, textKey: b.textKey, portrait: b.portrait });
  });
});
