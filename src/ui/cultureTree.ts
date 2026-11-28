// Where each culture node stands in the drawn tree (plan M4-13, SPEC §10.3): every branch is root → 2 → 2 → top, the
// branches one under the other in content order. The tab draws from it and the arrow keys move focus along it: up/down
// a row (the same column; the left one coming from a centred node), left/right inside a row of two, Home/End to the
// first and the last node. Nothing wraps: past an edge the key keeps the node.
import { CULTURE_BRANCHES, CULTURE_NODES, type CultureNodeId } from '../content/culture.ts';

export interface TreeCell {
  readonly id: CultureNodeId;
  /** Row of the whole drawing: 4 a branch, the second branch under the first. */
  readonly row: number;
  /** Left (0) or right (1) of a row of two; null for the centred root and top. */
  readonly col: 0 | 1 | null;
}

const ROWS_PER_BRANCH = 4;

function cells(): TreeCell[] {
  const out: TreeCell[] = [];
  CULTURE_BRANCHES.forEach((b, bi) => {
    const nodes = CULTURE_NODES.filter((n) => n.branch === b.id);
    for (const n of nodes) {
      const mates = nodes.filter((m) => m.row === n.row);
      const i = mates.indexOf(n);
      out.push({ id: n.id, row: bi * ROWS_PER_BRANCH + n.row - 1, col: mates.length === 1 ? null : i === 0 ? 0 : 1 });
    }
  });
  return out;
}

export const TREE_CELLS: readonly TreeCell[] = cells();

export type TreeKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export const isTreeKey = (key: string): key is TreeKey =>
  key === 'ArrowUp' ||
  key === 'ArrowDown' ||
  key === 'ArrowLeft' ||
  key === 'ArrowRight' ||
  key === 'Home' ||
  key === 'End';

/** The node focus moves to from `from` on `key`. */
export function treeStep(tree: readonly TreeCell[], from: CultureNodeId, key: TreeKey): CultureNodeId {
  const at = tree.find((c) => c.id === from);
  if (at === undefined) return from;
  switch (key) {
    case 'Home':
      return tree[0]?.id ?? from;
    case 'End':
      return tree[tree.length - 1]?.id ?? from;
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (at.col === null) return from;
      const col = key === 'ArrowLeft' ? 0 : 1;
      return tree.find((c) => c.row === at.row && c.col === col)?.id ?? from;
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const row = at.row + (key === 'ArrowDown' ? 1 : -1);
      const next = tree.filter((c) => c.row === row);
      const same = next.find((c) => c.col === (at.col ?? 0));
      return (same ?? next[0])?.id ?? from;
    }
  }
}
