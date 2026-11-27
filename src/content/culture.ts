// The culture tree (SPEC §3.5 «Модель M4»; plan M4 §3, Q2–Q4; ADR 013). Bought with glory, rank by rank: a rank costs
// `base × growth^rank × cultureCostMult` (rank = the ranks already bought; core, M4-05). Nodes are permanent — no
// respec: no choice excludes another and every effect is positive (plan §0.1 П2); they carry over resettling (§3.6).
// The whole tree is shown from the start, locked nodes included. Ids are saved (`culture`, save v5): append only,
// never rename. M4 builds «Музика» and «Звичаї»; «Ремесла» and «Військова справа» come later (SPEC §14).
// Costs and effect sizes: гіпотеза for M4-09 (`pnpm balance`). Facts: docs/content-sources.md.

import type { RankedEffect } from './effects.ts';
import type { StoryTrigger } from './story.ts';

export const CULTURE_BRANCH_IDS = ['music', 'customs'] as const;
export type CultureBranchId = (typeof CULTURE_BRANCH_IDS)[number];

/** When a branch opens: derived, not stored (ADR 013) — a monotone building condition, like a story trigger. */
export type CultureUnlock = Extract<StoryTrigger, { readonly kind: 'building' | 'sich' }>;

export interface CultureBranch {
  readonly id: CultureBranchId;
  readonly unlock: CultureUnlock;
  readonly nameKey: string;
  /** «Відкриється, коли…» on the locked branch (plan §0.1 П1). */
  readonly unlockKey: string;
}

export const CULTURE_BRANCHES: readonly CultureBranch[] = [
  // Q5: with the first tavern level (S4–S6).
  { id: 'music', unlock: { kind: 'building', id: 'tavern', level: 1 }, ...branchKeys('music') },
  // Q4: the church stands — the trigger of the «Освячення Покрова» beat (content test).
  { id: 'customs', unlock: { kind: 'sich', id: 'church', level: 1 }, ...branchKeys('customs') },
];

/** Append only (saved in `culture`). Order: branch by branch, row by row. */
export const CULTURE_NODE_IDS = [
  'music.dumy',
  'music.maidan',
  'music.campaign',
  'music.bandura',
  'music.lirnyky',
  'music.great',
  'customs.vechornytsi',
  'customs.toloka',
  'customs.hostyna',
  'customs.obzhynky',
  'customs.kupala',
  'customs.didukh',
] as const;
export type CultureNodeId = (typeof CULTURE_NODE_IDS)[number];

/**
 * What a node needs before its first rank: nothing (the branch root), any of the listed nodes at rank ≥ 1, or all of
 * them (the top). Only nodes of the row above in the same branch (content test), so there are no cycles.
 */
export type CulturePrereq =
  { readonly kind: 'root' } | { readonly kind: 'anyOf' | 'allOf'; readonly ids: readonly CultureNodeId[] };

export interface CultureNode {
  readonly id: CultureNodeId;
  readonly branch: CultureBranchId;
  /** 1 = the root, 2–3 = two nodes each, 4 = the top (plan §3: 6 nodes a branch). */
  readonly row: 1 | 2 | 3 | 4;
  readonly requires: CulturePrereq;
  /** Ranks 1…maxRank (SPEC §3.5: 1–5). */
  readonly maxRank: number;
  /** Glory price of the first rank (before `cultureCostMult`). */
  readonly base: number;
  /** Price × growth per rank bought. */
  readonly growth: number;
  /** Each rank adds `perRank` to its field (effects.ts). */
  readonly effects: readonly RankedEffect[];
  readonly nameKey: string;
  /** A line of flavour, no numbers: the card shows the effects through `effect.<kind>`. */
  readonly textKey: string;
  /** A short fact (SPEC §16; source in docs/content-sources.md). */
  readonly factKey: string;
}

const H = 3600; // s per hour
const ROOT: CulturePrereq = { kind: 'root' };

type NodeData = Omit<CultureNode, 'nameKey' | 'textKey' | 'factKey'>;

export const CULTURE_NODES: readonly CultureNode[] = (
  [
    {
      id: 'music.dumy',
      branch: 'music',
      row: 1,
      requires: ROOT,
      maxRank: 5,
      base: 150,
      growth: 1.8,
      effects: [{ kind: 'income', perRank: 0.04 }],
    },
    {
      id: 'music.maidan',
      branch: 'music',
      row: 2,
      requires: anyOf('music.dumy'),
      maxRank: 5,
      base: 400,
      growth: 1.8,
      effects: [{ kind: 'glory', perRank: 0.05 }],
    },
    {
      id: 'music.campaign',
      branch: 'music',
      row: 2,
      requires: anyOf('music.dumy'),
      maxRank: 3,
      base: 400,
      growth: 2,
      effects: [{ kind: 'loot', perRank: 0.05 }],
    },
    {
      id: 'music.bandura',
      branch: 'music',
      row: 3,
      requires: anyOf('music.maidan', 'music.campaign'),
      maxRank: 3,
      base: 1000,
      growth: 2,
      effects: [{ kind: 'power', perRank: 0.03 }],
    },
    {
      id: 'music.lirnyky',
      branch: 'music',
      row: 3,
      requires: anyOf('music.maidan', 'music.campaign'),
      maxRank: 3,
      base: 1000,
      growth: 2,
      effects: [{ kind: 'gloryCapSec', perRank: H }],
    },
    {
      id: 'music.great',
      branch: 'music',
      row: 4,
      requires: allOf('music.bandura', 'music.lirnyky'),
      maxRank: 1,
      base: 4000,
      growth: 2,
      effects: [
        { kind: 'income', perRank: 0.1 },
        { kind: 'glory', perRank: 0.1 },
      ],
    },
    {
      id: 'customs.vechornytsi',
      branch: 'customs',
      row: 1,
      requires: ROOT,
      maxRank: 4,
      base: 1500,
      growth: 1.8,
      effects: [{ kind: 'offlineCapSec', perRank: H }],
    },
    {
      id: 'customs.toloka',
      branch: 'customs',
      row: 2,
      requires: anyOf('customs.vechornytsi'),
      maxRank: 5,
      base: 3000,
      growth: 1.8,
      effects: [{ kind: 'cost', perRank: 0.03 }],
    },
    {
      id: 'customs.hostyna',
      branch: 'customs',
      row: 2,
      requires: anyOf('customs.vechornytsi'),
      maxRank: 3,
      base: 3000,
      growth: 2,
      effects: [{ kind: 'offline', perRank: 0.05 }],
    },
    {
      id: 'customs.obzhynky',
      branch: 'customs',
      row: 3,
      requires: anyOf('customs.toloka', 'customs.hostyna'),
      maxRank: 3,
      base: 6000,
      growth: 2,
      effects: [{ kind: 'foodIncome', perRank: 0.06 }],
    },
    // The fern flower of the Kupala night legend, which points to a treasure.
    {
      id: 'customs.kupala',
      branch: 'customs',
      row: 3,
      requires: anyOf('customs.toloka', 'customs.hostyna'),
      maxRank: 3,
      base: 6000,
      growth: 2,
      effects: [{ kind: 'relicChance', perRank: 0.1 }],
    },
    {
      id: 'customs.didukh',
      branch: 'customs',
      row: 4,
      requires: allOf('customs.obzhynky', 'customs.kupala'),
      maxRank: 1,
      base: 20_000,
      growth: 2,
      effects: [
        { kind: 'offlineCapSec', perRank: 2 * H },
        { kind: 'cost', perRank: 0.05 },
      ],
    },
  ] satisfies readonly NodeData[]
).map((n) => ({
  ...n,
  nameKey: `culture.${n.id}.name`,
  textKey: `culture.${n.id}.text`,
  factKey: `culture.${n.id}.fact`,
}));

function anyOf(...ids: CultureNodeId[]): CulturePrereq {
  return { kind: 'anyOf', ids };
}

function allOf(...ids: CultureNodeId[]): CulturePrereq {
  return { kind: 'allOf', ids };
}

function branchKeys(id: CultureBranchId): Pick<CultureBranch, 'nameKey' | 'unlockKey'> {
  return { nameKey: `culture.${id}.name`, unlockKey: `culture.${id}.unlock` };
}
