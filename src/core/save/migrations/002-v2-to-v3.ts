// Save v2 → v3 (plan M2-23, M2-24 note; SPEC §3.10, §3.9; Q9). New: `quests` and `settings.tzOffsetMin`.
//   quests.chain          = the first listed step the game has not met yet; the met ones pass silently (no event, no
//                           reward — the rule of story beats); a count step stops the walk (it counts from its start)
//   quests.chores         = fresh: the first chore of the seed, counted from now, day of `maxSeen` in UTC
//   settings.tzOffsetMin  = 0 (UTC) until the platform writes the zone at the next start
// Coupled to live content on purpose: `newQuests` walks today's QUEST_CHAIN and picks from today's CHORES pool. That is
// sound only because chain step ids, chore ids and their order are frozen once shipped (content/quests.ts): append
// only; removing, renaming or reordering one needs a migration of its own.
// It reads the raw payload: a malformed one throws, and `migrate` turns that into a refused save. Whatever else is
// wrong is validateState's to catch after the chain.
import { SICH_BUILDING_IDS } from '../../../content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../content/villages/khortytsia.ts';
import type { Stats } from '../../state.ts';
import { newQuests, type QuestFacts } from '../../systems/quests.ts';
import type { Migration } from './index.ts';

type Obj = Record<string, unknown>;

function obj(value: unknown, what: string): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`v2: ${what}`);
  return value as Obj;
}

function num(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`v2: ${what}`);
  return value;
}

function levels<K extends string>(value: unknown, ids: readonly K[], what: string): Record<K, number> {
  const o = obj(value, what);
  const out: Partial<Record<K, number>> = {};
  for (const id of ids) out[id] = num(o[id], `${what}.${id}`);
  // Every id of `ids` was set just above (num throws otherwise), so the partial record is complete.
  return out as Record<K, number>;
}

const STAT_KEYS = [
  'taps',
  'purchases',
  'levelsBought',
  'hires',
  'tapIncomeSec',
] as const satisfies readonly (keyof Stats)[];

export const V2_TO_V3: Migration = {
  from: 2,
  to: 3,
  run(raw) {
    const root = obj(raw, 'root');
    if (root['version'] !== 2) throw new Error('v2: version');
    const village = obj(root['village'], 'village');
    const rawStats = obj(root['stats'], 'stats');
    // One entry per STAT_KEYS key (num throws otherwise), so the record is complete.
    const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, num(rawStats[k], `stats.${k}`)])) as Record<
      (typeof STAT_KEYS)[number],
      number
    >;
    const facts: QuestFacts = {
      village: {
        // The only land of v2; validateState checks the id itself.
        id: 'khortytsia',
        levels: levels(village['levels'], FARM_BUILDING_IDS, 'levels'),
        sichLevels: levels(village['sichLevels'], SICH_BUILDING_IDS, 'sichLevels'),
      },
      stats,
    };
    const tzOffsetMin = 0;
    const maxSeen = num(obj(root['time'], 'time')['maxSeen'], 'maxSeen');
    const seed = num(root['seed'], 'seed');
    return {
      ...root,
      version: 3,
      quests: newQuests(facts, seed, maxSeen, tzOffsetMin),
      settings: { ...obj(root['settings'], 'settings'), tzOffsetMin },
    };
  },
};
