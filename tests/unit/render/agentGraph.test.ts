import { describe, expect, it } from 'vitest';
import type { PathGraph } from '../../../src/content/agents.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { findPath } from '../../../src/render/agents/graph.ts';

const G = KHORTYTSIA_WORLD.paths;
const adjacent = (g: PathGraph, a: string, b: string): boolean =>
  g.edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

describe('findPath (plan M2-16)', () => {
  it('finds a path of adjacent nodes between any two POIs of the world for a Cossack', () => {
    for (const from of G.nodes) {
      for (const to of G.nodes) {
        const path = findPath(G, from.id, to.id, 'cossack');
        expect(path, `${from.id} → ${to.id}`).not.toBeNull();
        if (!path) continue;
        expect(path[0]).toBe(from.id);
        expect(path.at(-1)).toBe(to.id);
        for (let i = 1; i < path.length; i++) expect(adjacent(G, path[i - 1] ?? '', path[i] ?? '')).toBe(true);
      }
    }
  });

  it('gives a villager no path past the Sich gate from any farm or suburb node, but a path up to the gate', () => {
    const outside = G.nodes.filter((n) => n.zone === 'farm' || n.zone === 'suburb');
    const inside = G.nodes.filter((n) => n.zone === 'sich' && n.kind !== 'gate');
    const gate = G.nodes.find((n) => n.kind === 'gate');
    expect(gate?.zone).toBe('sich');
    expect(outside.length).toBeGreaterThan(0);
    expect(inside.length).toBeGreaterThan(0);
    for (const from of outside) {
      expect(findPath(G, from.id, gate?.id ?? '', 'villager'), from.id).not.toBeNull();
      for (const to of inside) expect(findPath(G, from.id, to.id, 'villager'), `${from.id} → ${to.id}`).toBeNull();
    }
  });

  it('takes the fewest edges, returns [from] for from = to and null for an unknown node', () => {
    const g: PathGraph = {
      nodes: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, kind: 'way', x: i, ground: 0, zone: 'farm' })),
      edges: [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['a', 'd'],
      ],
    };
    expect(findPath(g, 'a', 'c', 'villager')).toEqual(['a', 'b', 'c']);
    expect(findPath(g, 'a', 'd', 'villager')).toEqual(['a', 'd']);
    expect(findPath(g, 'b', 'b', 'villager')).toEqual(['b']);
    expect(findPath(g, 'a', 'zz', 'villager')).toBeNull();
  });

  it('never walks a role through a node it may not enter (not even as a way through)', () => {
    const g: PathGraph = {
      nodes: [
        { id: 'a', kind: 'way', x: 0, ground: 0, zone: 'farm' },
        { id: 'm', kind: 'way', x: 1, ground: 0, zone: 'sich', only: ['cossack'] },
        { id: 'b', kind: 'way', x: 2, ground: 0, zone: 'farm' },
      ],
      edges: [
        ['a', 'm'],
        ['m', 'b'],
      ],
    };
    expect(findPath(g, 'a', 'b', 'villager')).toBeNull();
    expect(findPath(g, 'a', 'b', 'cossack')).toEqual(['a', 'm', 'b']);
  });

  it('breaks a tie between equally short paths by the edge listed first', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, kind: 'way' as const, x: i, ground: 0, zone: 'farm' }));
    const viaC: PathGraph = {
      nodes,
      edges: [
        ['a', 'c'],
        ['c', 'd'],
        ['a', 'b'],
        ['b', 'd'],
      ],
    };
    const viaB: PathGraph = { nodes, edges: [...viaC.edges].reverse() };
    expect(findPath(viaC, 'a', 'd', 'villager')).toEqual(['a', 'c', 'd']);
    expect(findPath(viaB, 'a', 'd', 'villager')).toEqual(['a', 'b', 'd']);
  });

  it('keeps a role off an edge limited to other roles', () => {
    const g: PathGraph = {
      nodes: ['a', 'b'].map((id, i) => ({ id, kind: 'way' as const, x: i, ground: 0, zone: 'farm' })),
      edges: [['a', 'b', ['cart']]],
    };
    expect(findPath(g, 'a', 'b', 'villager')).toBeNull();
    expect(findPath(g, 'a', 'b', 'cart')).toEqual(['a', 'b']);
  });

  it('throws on an edge to an unknown node or a node listed twice', () => {
    const a = { id: 'a', kind: 'way' as const, x: 0, ground: 0, zone: 'farm' };
    expect(() => findPath({ nodes: [a], edges: [['a', 'zz']] }, 'a', 'a', 'villager')).toThrow(/unknown node/);
    expect(() => findPath({ nodes: [a, a], edges: [] }, 'a', 'a', 'villager')).toThrow(/twice/);
  });
});
