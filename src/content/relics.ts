// Relics (SPEC §3.4, plan M3-02, Q5, Q16): a collection found on raids, each kept for good (it survives resettling,
// §3.6) and acting only through `collectModifiers`. No duplicates: a relic roll draws among the land's unfound relics;
// when all are found, the relic chance becomes a pysanky chance (M3-03). Ids are saved (`relics`): never rename.

import type { RaidTierId } from './raids.ts';
import type { Village } from './villages/khortytsia.ts';

export const RELIC_IDS = ['pernach', 'porokhivnytsia'] as const;
export type RelicId = (typeof RELIC_IDS)[number];

/**
 * A relic's passive bonus: + share (0.05 = +5 %) to the `Modifiers` field its kind names, 1:1 — `power` → `powerMult`,
 * `loot` → `lootMult` (M3-06, `collectModifiers`). The UI fills `{value}` of `textKey` with share × 100.
 */
export type RelicEffect =
  { readonly kind: 'power'; readonly share: number } | { readonly kind: 'loot'; readonly share: number };

export interface RelicDef {
  readonly id: RelicId;
  /** The land whose raids find it. */
  readonly village: Village['id'];
  readonly effect: RelicEffect;
  readonly nameKey: string;
  readonly textKey: string;
  /** A short historical fact (SPEC §16; source in docs/content-sources.md). */
  readonly factKey: string;
}

function relic(id: RelicId, effect: RelicEffect): RelicDef {
  return {
    id,
    village: 'khortytsia',
    effect,
    nameKey: `relic.${id}.name`,
    textKey: `relic.${id}.text`,
    factKey: `relic.${id}.fact`,
  };
}

/** Q5: in M3 «Пернач» and «Порохівниця»; «Кобза діда» (−5 % culture price) comes with culture in M4. */
export const RELIC_DEFS: readonly RelicDef[] = [
  relic('pernach', { kind: 'power', share: 0.05 }),
  relic('porokhivnytsia', { kind: 'loot', share: 0.1 }),
];

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
