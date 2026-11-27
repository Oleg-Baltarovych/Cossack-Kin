// Save v1 → v2 (plan M2-22, SPEC §2.5 «Міграція v1 → v2», §3.10). New: `story.seen` and the quest counters.
//   story.seen          = the v2 beats whose triggers a v1 game already meets — silently: no event, no reward (owner)
//   stats.levelsBought  = Σ farm + Sich levels (v1 has no resets)
//   stats.hires         = the infantry (v1 has no losses)
//   stats.tapIncomeSec  = 0 (v1 did not count it)
// It reads the raw payload: a malformed one throws, and `migrate` turns that into a refused save. Whatever else is
// wrong is validateState's to catch after the chain.
import { SICH_BUILDING_IDS } from '../../../content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../content/villages/khortytsia.ts';
import type { VillageState } from '../../state.ts';
import { dueBeats } from '../../systems/story.ts';
import type { Migration } from './index.ts';

type Obj = Record<string, unknown>;

/**
 * The beats of v2, pinned (a migration never reads live content, rules/core.md): a beat added later — M4-08's hero
 * beats — must stay unseen here, so that it fires on the first check with its modal and its hero (SPEC §2.5).
 */
const V2_BEATS: readonly string[] = [
  'khortytsia.shore',
  'khortytsia.messenger',
  'khortytsia.council',
  'khortytsia.pokrova',
];

function obj(value: unknown, what: string): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`v1: ${what}`);
  return value as Obj;
}

function count(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`v1: ${what}`);
  return value;
}

function levels<K extends string>(value: unknown, ids: readonly K[], what: string): Record<K, number> {
  const o = obj(value, what);
  const out: Partial<Record<K, number>> = {};
  for (const id of ids) out[id] = count(o[id], `${what}.${id}`);
  // Every id of `ids` was set just above (count throws otherwise), so the partial record is complete.
  return out as Record<K, number>;
}

export const V1_TO_V2: Migration = {
  from: 1,
  to: 2,
  run(raw) {
    const root = obj(raw, 'root');
    // The envelope says v1; a payload that is not v1 (crafted, or a newer shape in an old envelope) is refused.
    if (root['version'] !== 1) throw new Error('v1: version');
    const village = obj(root['village'], 'village');
    const land: Pick<VillageState, 'id' | 'levels' | 'sichLevels' | 'mechanic'> = {
      // The only land of v1; validateState checks the id itself.
      id: 'khortytsia',
      levels: levels(village['levels'], FARM_BUILDING_IDS, 'levels'),
      sichLevels: levels(village['sichLevels'], SICH_BUILDING_IDS, 'sichLevels'),
      mechanic: {
        kind: 'wind',
        stormsSurvived: count(obj(village['mechanic'], 'mechanic')['stormsSurvived'], 'storms'),
      },
    };
    const hires = count(obj(root['army'], 'army')['infantry'], 'infantry');
    const sum = (r: Readonly<Record<string, number>>): number => Object.values(r).reduce((a, b) => a + b, 0);
    // v1 had no raids: none won.
    const seen = dueBeats({ village: land, stats: { hires, raidsWon: 0 } }, [])
      .map((b) => b.id)
      .filter((id) => V2_BEATS.includes(id));
    return {
      ...root,
      version: 2,
      stats: {
        ...obj(root['stats'], 'stats'),
        levelsBought: sum(land.levels) + sum(land.sichLevels),
        hires,
        tapIncomeSec: 0,
      },
      story: { seen },
    };
  },
};
