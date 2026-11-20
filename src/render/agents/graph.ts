// Path finding over a land's path graph (plan M2-16): breadth-first, so the fewest edges win; on a tie the neighbour
// whose edge is listed first wins (deterministic). A role never enters a node whose `only` excludes it — not even as a
// way through — nor walks an edge whose `only` excludes it: that is what keeps villagers outside the Sich gate. Pure;
// the graph is checked and indexed once per graph object and a broken graph throws there.
import type { AgentRole, PathGraph, PathNode } from '../../content/agents.ts';

interface Link {
  readonly to: string;
  readonly only: readonly AgentRole[] | undefined;
}

interface Index {
  readonly nodes: ReadonlyMap<string, PathNode>;
  readonly next: ReadonlyMap<string, readonly Link[]>;
}

const indexes = new WeakMap<PathGraph, Index>();

function indexOf(graph: PathGraph): Index {
  const known = indexes.get(graph);
  if (known) return known;
  const nodes = new Map<string, PathNode>();
  const next = new Map<string, Link[]>();
  for (const n of graph.nodes) {
    if (nodes.has(n.id)) throw new Error(`path graph: node "${n.id}" twice`);
    nodes.set(n.id, n);
    next.set(n.id, []);
  }
  for (const [a, b, only] of graph.edges) {
    const from = next.get(a);
    const to = next.get(b);
    if (!from || !to) throw new Error(`path graph: edge ${a}—${b} names an unknown node`);
    if (a === b) throw new Error(`path graph: edge ${a}—${b} is a loop`);
    from.push({ to: b, only });
    to.push({ to: a, only });
  }
  const index = { nodes, next };
  indexes.set(graph, index);
  return index;
}

/** Throws unless every edge joins two known, distinct nodes and node ids are unique (also run by every lookup). */
export function checkGraph(graph: PathGraph): void {
  indexOf(graph);
}

/** The node `id` of `graph`; throws for an unknown id (a broken path or spawn is a content bug). */
export function nodeOf(graph: PathGraph, id: string): PathNode {
  const node = indexOf(graph).nodes.get(id);
  if (!node) throw new Error(`path graph: no node "${id}"`);
  return node;
}

const allows = (only: readonly AgentRole[] | undefined, role: AgentRole): boolean => !only || only.includes(role);

/** Whether `role` may stand on `node`. */
export const mayEnter = (node: PathNode, role: AgentRole): boolean => allows(node.only, role);

/**
 * Node ids from `from` to `to` (both included) over nodes and edges `role` may use and, past the start, nodes `open`
 * lets through (M2-18: a node of a building that does not stand); `null` when there is none.
 */
export function findPath(
  graph: PathGraph,
  from: string,
  to: string,
  role: AgentRole,
  open: (node: PathNode) => boolean = () => true,
): string[] | null {
  const { nodes, next } = indexOf(graph);
  const start = nodes.get(from);
  const goal = nodes.get(to);
  if (!start || !goal || !mayEnter(start, role) || !mayEnter(goal, role)) return null;
  const cameFrom = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let head = 0; head < queue.length && !cameFrom.has(to); head++) {
    const id = queue[head] ?? '';
    for (const link of next.get(id) ?? []) {
      if (cameFrom.has(link.to) || !allows(link.only, role)) continue;
      const node = nodes.get(link.to);
      if (!node || !mayEnter(node, role) || !open(node)) continue;
      cameFrom.set(link.to, id);
      queue.push(link.to);
    }
  }
  if (!cameFrom.has(to)) return null;
  const path: string[] = [];
  for (let id: string | null | undefined = to; id; id = cameFrom.get(id)) path.push(id);
  return path.reverse();
}
