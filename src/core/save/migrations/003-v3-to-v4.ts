// Save v3 → v4 (plan M3-04, §0, Q7; SPEC §9.3, §3.4; ADR 012). New: `raids`, `relics` and the raid counters.
//   raids                       = every slot idle, no rumour used (`rumorDay` −1), pity 0 — no raid was ever sent
//   relics                      = []
//   stats.raidsSent/Done/Won    = 0
//   quests.chain (listed)       = `khortytsia.raid1` was inserted right after `khortytsia.hire1` (Q7, the one approved
//                                 exception to the append-only chain): a v3 index past `hire1` moves up by one, so it
//                                 names the same step — `raid1` counts as passed for those saves, silently and with no
//                                 reward. A save on `hire1` or before keeps its index and meets `raid1` next. `base`
//                                 belongs to the same step, so it stays. A generated step and `done` are untouched.
// Frozen to the v3 chain, not read from live content: in v3 `hire1` was step 2, so v3 indices from 3 on shift.
// It reads the raw payload: a malformed one throws, and `migrate` turns that into a refused save. Whatever else is
// wrong is validateState's to catch after the chain.
import { freshRaids } from '../../state.ts';
import type { Migration } from './index.ts';

type Obj = Record<string, unknown>;

/** The first v3 chain index past `khortytsia.hire1` (v3 index 2): where `raid1` now stands. */
const V3_FIRST_SHIFTED = 3;

function obj(value: unknown, what: string): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`v3: ${what}`);
  return value as Obj;
}

function shiftChain(chain: Obj): Obj {
  if (chain['kind'] !== 'listed') return chain;
  const index = chain['index'];
  if (typeof index !== 'number' || !Number.isInteger(index)) throw new Error('v3: chain.index');
  return index >= V3_FIRST_SHIFTED ? { ...chain, index: index + 1 } : chain;
}

export const V3_TO_V4: Migration = {
  from: 3,
  to: 4,
  run(raw) {
    const root = obj(raw, 'root');
    // The envelope says v3; a payload that is not v3 (crafted, or another shape in an old envelope) is refused.
    if (root['version'] !== 3) throw new Error('v3: version');
    const quests = obj(root['quests'], 'quests');
    return {
      ...root,
      version: 4,
      stats: { ...obj(root['stats'], 'stats'), raidsSent: 0, raidsDone: 0, raidsWon: 0 },
      quests: { ...quests, chain: shiftChain(obj(quests['chain'], 'chain')) },
      raids: freshRaids(),
      relics: [],
    };
  },
};
