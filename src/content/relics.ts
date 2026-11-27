// Relics (SPEC §3.4, plan M3-02, Q5, Q16): a collection found on raids, each kept for good (it survives resettling,
// §3.6) and acting only through `collectModifiers`. No duplicates: a relic roll draws among the land's unfound relics;
// when all a tier can find are found, its relic chance becomes a pysanky chance (M3-03, M4-06). Ids are saved
// (`relics`, raid slots) and the list order is part of every relic pick (`pickRelic`): append only, never rename.

import type { EffectKind } from './effects.ts';
import { tierRank, type RaidTierId } from './raids.ts';
import type { Village } from './villages/khortytsia.ts';

export const RELIC_IDS = ['pernach', 'porokhivnytsia', 'kobza'] as const;
export type RelicId = (typeof RELIC_IDS)[number];

/**
 * A relic's passive bonus: a share (0.05 = 5 %) of the `Modifiers` field its kind names, 1:1 like the ranked effects
 * (effects.ts) — `power` → +`powerMult`, `loot` → +`lootMult` (M3-06), `cultureCost` → −`cultureCostMult` (a reducing
 * kind, floored by `EFFECT_FLOORS`; M4-06). The UI fills `{value}` of `textKey` with share × 100.
 */
export interface RelicEffect {
  readonly kind: Extract<EffectKind, 'power' | 'loot' | 'cultureCost'>;
  readonly share: number;
}

export interface RelicDef {
  readonly id: RelicId;
  /** The land whose raids find it. */
  readonly village: Village['id'];
  /** The shortest raid tier that can find it (content test: that tier has a relic chance or counts for the pity). */
  readonly minTier: RaidTierId;
  readonly effect: RelicEffect;
  readonly nameKey: string;
  readonly textKey: string;
  /** A short historical fact (SPEC §16; source in docs/content-sources.md). */
  readonly factKey: string;
}

function relic(id: RelicId, minTier: RaidTierId, effect: RelicEffect): RelicDef {
  return {
    id,
    village: 'khortytsia',
    minTier,
    effect,
    nameKey: `relic.${id}.name`,
    textKey: `relic.${id}.text`,
    factKey: `relic.${id}.fact`,
  };
}

/**
 * Q5: in M3 «Пернач» and «Порохівниця», from the 30-min raids (the first tier with a relic chance); M4-06 (Q14):
 * «Кобза діда», −5 % culture price, only from raids of 1 h and longer — an old man's kobza is not found on a short
 * scouting ride, and the 30-min raids keep their pysanky once the first two are found.
 */
export const RELIC_DEFS: readonly RelicDef[] = [
  relic('pernach', 'm30', { kind: 'power', share: 0.05 }),
  relic('porokhivnytsia', 'm30', { kind: 'loot', share: 0.1 }),
  relic('kobza', 'h1', { kind: 'cultureCost', share: 0.05 }),
];

/**
 * Whether a raid of `tier` can find relic `r` at all: from its `minTier` on (M4-06). The one definition — the roll
 * (`systems/raids.ts`), the save gate and the treasury hint all read it.
 */
export function relicOnTier(r: RelicDef, tier: RaidTierId): boolean {
  return tierRank(tier) >= tierRank(r.minTier);
}

/**
 * The pity (Q5, Q16 — for every relic): `raids.pity` counts successful raids of tier ≥ `pityMinTier` that gave no
 * relic; a failure does not move it, a find resets it to 0. The `pityAt[n]`-th such success, with `n` relics already
 * found, is certain to give one (past the end of the list — the last entry). 4 for the first (calendar S2–S5);
 * 6 for the next — гіпотеза for M3-08, so «Порохівниця» does not keep a player waiting for weeks.
 */
export const RELICS = {
  pityAt: [4, 6],
  pityMinTier: 'm30',
} as const satisfies { readonly pityAt: readonly number[]; readonly pityMinTier: RaidTierId };

/**
 * How many qualifying successes without a relic make the next one certain, with `found` relics already found: the
 * `found`-th entry of `RELICS.pityAt`, the last one past the end of the list. The bound of `raids.pity` too
 * (`0 ≤ pity < pityThreshold(relics.length)`, validateState M3-04).
 */
export function pityThreshold(found: number): number {
  const list: readonly number[] = RELICS.pityAt;
  return list[Math.min(Math.max(0, found), list.length - 1)] ?? RELICS.pityAt[0];
}
