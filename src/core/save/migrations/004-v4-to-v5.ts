// Save v4 → v5 (plan M4-04, §0, Q12, Q16; SPEC §9.3, §2.5; ADR 013). New: `culture`, `heroes` and their counters.
//   culture                         = {} — no culture system before v5
//   heroes                          = { hero: 1 } for every seen beat whose reward is a hero (in v4 only «Рада на
//                                     майдані» → the otaman): the beat will never fire again, so without this the hero
//                                     could never come. Silently — no reward, no event, no modal (as 001 marks beats)
//   stats.cultureRanks/heroLevels   = 0 (an arrival's level 1 is free, not a bought level)
//   quests.chain (listed)           = `khortytsia.culture1` was inserted right after `khortytsia.tavern1` (Q12, the
//                                     second approved exception to the append-only chain, like `raid1` in 003): a v4
//                                     index past `tavern1` moves up by one, so it names the same step — `culture1`
//                                     counts as passed for those saves, silently and with no reward. A save on
//                                     `tavern1` or before keeps its index and meets `culture1` next. `base` belongs to
//                                     the same step, so it stays. A generated step and `done` are untouched.
// Both are frozen to v4, not read from live content: the chain shift (`tavern1` was step 20) and the hero map (code
// review M4-04: a hero beat added later — M4-08 Кобзар, Характерник — must not hand its hero to an old save that holds
// its id; a v4 game could not have fired it, and the beat fires normally on the first check after the load).
// It reads the raw payload: a malformed one throws, and `migrate` turns that into a refused save. Whatever else is
// wrong is validateState's to catch after the chain.
import type { HeroId } from '../../../content/heroes.ts';
import type { Migration } from './index.ts';

type Obj = Record<string, unknown>;

/** The unlock beats of v4 and their heroes: only «Рада на майдані» → the otaman (plan Q16). */
const V4_HERO_BEATS = { 'khortytsia.council': 'otaman' } as const satisfies Readonly<Record<string, HeroId>>;

/** The first v4 chain index past `khortytsia.tavern1` (v4 index 20): where `culture1` now stands. */
const V4_FIRST_SHIFTED = 21;

function obj(value: unknown, what: string): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`v4: ${what}`);
  // Checked just above: a non-null, non-array object; its keys are read as unknown.
  return value as Obj;
}

function shiftChain(chain: Obj): Obj {
  if (chain['kind'] !== 'listed') return chain;
  const index = chain['index'];
  if (typeof index !== 'number' || !Number.isInteger(index)) throw new Error('v4: chain.index');
  return index >= V4_FIRST_SHIFTED ? { ...chain, index: index + 1 } : chain;
}

/** Level 1 for the hero of every seen v4 unlock beat (any other id, known or not, brings nobody). */
function arrivedHeroes(seen: unknown): Obj {
  if (!Array.isArray(seen)) throw new Error('v4: story.seen');
  const heroes: Obj = {};
  for (const [beat, hero] of Object.entries(V4_HERO_BEATS)) if (seen.includes(beat)) heroes[hero] = 1;
  return heroes;
}

export const V4_TO_V5: Migration = {
  from: 4,
  to: 5,
  run(raw) {
    const root = obj(raw, 'root');
    // The envelope says v4; a payload that is not v4 (crafted, or another shape in an old envelope) is refused.
    if (root['version'] !== 4) throw new Error('v4: version');
    const quests = obj(root['quests'], 'quests');
    return {
      ...root,
      version: 5,
      stats: { ...obj(root['stats'], 'stats'), cultureRanks: 0, heroLevels: 0 },
      quests: { ...quests, chain: shiftChain(obj(quests['chain'], 'chain')) },
      culture: {},
      heroes: arrivedHeroes(obj(root['story'], 'story')['seen']),
    };
  },
};
