// Culture chores (plan M4 §0 «Квести», M4-08; SPEC §3.10): «Вивчи ранг культури» and «Підвищ героя», appended to the
// chore pool (frozen order) and offered only while there is something to buy — a rank to learn (an open branch, the
// prerequisites held, a rank left; glory aside) or a hero who came and has a level left. The real `buyCulture` /
// `levelHero` finish them; a hero's free arrival is not a level bought. The rotation of a seed moves only onto them.
import { describe, expect, it } from 'vitest';
import { CULTURE_NODES } from '../../../src/content/culture.ts';
import { HEROES } from '../../../src/content/heroes.ts';
import { BUILD_SYSTEMS, CHORE_IDS, CHORES, type ChoreId, type SystemId } from '../../../src/content/quests.ts';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { questTarget } from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { choreQuest, nextChore } from '../../../src/core/systems/quests.ts';

const T0 = 1_763_400_000_000;
const SEC = 1000;

const CULTURE_CHORES = new Set<string>(
  CHORES.pool.filter((c) => c.requires === 'culture' || c.requires === 'heroes').map((c) => c.id),
);

/** A game with every beat seen and lots of glory; `tavern` opens «Музика», `heroes` are the ones that came. */
function game({
  tavern = 1,
  heroes = {},
  culture = {},
}: { tavern?: number; heroes?: GameState['heroes']; culture?: GameState['culture'] } = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    story: { seen: [...STORY_BEAT_IDS] },
    currencies: { ...s.currencies, ducats: Big.from(1e30), glory: Big.from(1e15) },
    village: { ...s.village, levels: { ...s.village.levels, tavern } },
    heroes,
    culture,
  };
}

/** Every node of every branch at its max rank, both branches open (farm 25 + the church). */
function cultureDone(s: GameState): GameState {
  const levels = { ...s.village.levels };
  for (const id of FARM_BUILDING_IDS) levels[id] = 25;
  return {
    ...s,
    village: { ...s.village, levels, sichLevels: { ...s.village.sichLevels, church: 1 } },
    culture: Object.fromEntries(CULTURE_NODES.map((n) => [n.id, n.maxRank])),
  };
}

function act(s: GameState, action: Action, now: number): { state: GameState; events: readonly GameEvent[] } {
  const r = applyAction(s, action, now);
  const no = r.events.find((e) => e.type === 'ActionRejected');
  if (no) throw new Error(`${action.type} refused`);
  return r;
}

/** The ids of `claims` chores in a row, each met by setting its counter (only the picks matter) and claimed. */
function rotation(s: GameState, claims: number): string[] {
  const ids: string[] = [];
  let t = s.time.lastSeen;
  for (let i = 0; i < claims; i++) {
    const q = choreQuest(s);
    ids.push(q.id);
    const met: GameState = { ...s, stats: { ...s.stats, [q.goal.stat]: q.base + q.goal.n } };
    t += SEC;
    s = act(met, { type: 'claimQuest', kind: 'chore' }, t).state;
  }
  return ids;
}

function withChore(s: GameState, id: ChoreId): GameState {
  const def = CHORES.pool.find((c) => c.id === id);
  if (!def) throw new Error(id);
  return { ...s, quests: { ...s.quests, chores: { ...s.quests.chores, active: id, base: s.stats[def.goal.stat] } } };
}

describe('culture chores in the pool (M4-08)', () => {
  it('appended after the raid chores (frozen order), each with its system, both in the build', () => {
    expect(CHORE_IDS.slice(-2)).toEqual(['chore.culture1', 'chore.hero1']);
    expect(CHORES.pool.map((c) => c.id)).toEqual([...CHORE_IDS]);
    const byId = (id: ChoreId) => CHORES.pool.find((c) => c.id === id);
    expect(byId('chore.culture1')).toMatchObject({ requires: 'culture', goal: { stat: 'cultureRanks', n: 1 } });
    expect(byId('chore.hero1')).toMatchObject({ requires: 'heroes', goal: { stat: 'heroLevels', n: 1 } });
    expect(BUILD_SYSTEMS).toEqual(expect.arrayContaining<SystemId>(['raids', 'culture', 'heroes']));
  });

  it('golden: offering them moves a pick only onto a culture chore, never between the older ones', () => {
    const previous: readonly (ChoreId | null)[] = [null, ...CHORE_IDS];
    let moved = 0;
    for (let seed = 0; seed < 60; seed++)
      for (let n = 0; n < 40; n++)
        for (const prev of previous) {
          const before = nextChore(seed, n, prev, CHORES.pool, ['raids']);
          const after = nextChore(seed, n, prev, CHORES.pool, ['raids', 'culture', 'heroes']);
          if (after.id !== before.id) {
            expect(CULTURE_CHORES.has(after.id), `seed ${String(seed)} n ${String(n)} prev ${String(prev)}`).toBe(true);
            moved++;
          }
        }
    expect(moved).toBeGreaterThan(0);
  });
});

describe('offered only while there is something to buy (no softlock)', () => {
  const offered = (s: GameState): Set<string> => new Set(rotation(s, 150).filter((id) => CULTURE_CHORES.has(id)));

  it('«Музика» closed (no tavern) and no hero: neither comes up', () => {
    expect(offered(game({ tavern: 0 }))).toEqual(new Set());
  });

  it('the tavern opens «Музика»: «Вивчи ранг культури» comes up, «Підвищ героя» not without a hero', () => {
    expect(offered(game())).toEqual(new Set(['chore.culture1']));
  });

  it('a hero who came with levels left: «Підвищ героя» comes up', () => {
    expect(offered(game({ tavern: 0, heroes: { otaman: 1 } }))).toEqual(new Set(['chore.hero1']));
  });

  it('every rank learned and every hero at his max: neither comes up', () => {
    const heroes = Object.fromEntries(HEROES.map((h) => [h.id, h.levelMax]));
    expect(offered(cultureDone(game({ heroes })))).toEqual(new Set());
  });

  it('glory aside: a poor game with a rank to learn is still offered the chore (it saves up for it)', () => {
    const s = game();
    expect(offered({ ...s, currencies: { ...s.currencies, glory: Big.ZERO } })).toEqual(new Set(['chore.culture1']));
  });
});

describe('the real actions finish them (M4-08)', () => {
  it('«Вивчи ранг культури»: one rank by buyCulture', () => {
    const s = withChore(game(), 'chore.culture1');
    expect(choreQuest(s)).toMatchObject({ done: false, target: 1 });
    const r = act(s, { type: 'buyCulture', id: 'music.dumy' }, T0 + SEC);
    expect(r.events).toContainEqual({ type: 'QuestCompleted', kind: 'chore', id: 'chore.culture1' });
  });

  it('«Підвищ героя»: one level by levelHero; the hero arriving (level 1 for free) is not one', () => {
    const g = game({ tavern: 0, heroes: { otaman: 1 } });
    const unseen = { ...g, story: { seen: g.story.seen.filter((id) => id !== 'khortytsia.kobzar') } };
    const s0 = withChore(unseen, 'chore.hero1');
    // The Кобзар comes with tavern 10 bought: his free level does not move the chore.
    const joined = act(s0, { type: 'buyBuilding', id: 'tavern', mode: 10 }, T0 + SEC);
    expect(joined.events).toContainEqual({ type: 'HeroJoined', id: 'kobzar' });
    expect(choreQuest(joined.state).done).toBe(false);
    const r = act(joined.state, { type: 'levelHero', id: 'kobzar', mode: 1 }, T0 + 2 * SEC);
    expect(r.events).toContainEqual({ type: 'QuestCompleted', kind: 'chore', id: 'chore.hero1' });
  });
});

describe('questTarget of a hero chore (M4-07 follow-up)', () => {
  it('leads to the first hero, in content order, who came and has a level left', () => {
    const otaman = HEROES.find((h) => h.id === 'otaman')?.levelMax ?? 0;
    const s = withChore(game({ heroes: { otaman, kobzar: 3 } }), 'chore.hero1');
    expect(questTarget(s, 'chore')).toEqual({ kind: 'hero', id: 'kobzar' });
    expect(questTarget({ ...s, heroes: { otaman: 1, kobzar: 3 } }, 'chore')).toEqual({ kind: 'hero', id: 'otaman' });
  });

  it('nobody to level: no target', () => {
    expect(questTarget(withChore(game(), 'chore.hero1'), 'chore')).toEqual({ kind: 'none' });
  });
});
