import { describe, expect, it } from 'vitest';
import { AGENT_BUDGET, type AgentRole } from '../../../src/content/agents.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';

const G = KHORTYTSIA_WORLD.paths;
const ids = new Set(G.nodes.map((n) => n.id));

describe('khortytsia path graph content (plan M2-16)', () => {
  it('has unique node ids, edges between known distinct nodes, no edge twice', () => {
    expect(ids.size).toBe(G.nodes.length);
    const seen = new Set<string>();
    for (const [a, b] of G.edges) {
      expect(ids.has(a), a).toBe(true);
      expect(ids.has(b), b).toBe(true);
      expect(a).not.toBe(b);
      const key = [a, b].sort().join('|');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('names every node after its zone and keeps it on the ground, inside its zone', () => {
    for (const n of G.nodes) {
      const z = KHORTYTSIA_WORLD.zones.find((q) => q.id === n.zone);
      expect(n.id.startsWith(`${n.zone}.`), n.id).toBe(true);
      expect(n.x, n.id).toBeGreaterThanOrEqual(z?.x0 ?? Infinity);
      expect(n.x, n.id).toBeLessThan(z?.x1 ?? -Infinity);
      expect(n.ground, n.id).toBeGreaterThan(0);
      expect(Number.isInteger(n.x) && Number.isInteger(n.ground), n.id).toBe(true);
    }
  });

  it('has exactly one gate, in the Sich, open to everyone; doors, work spots and a campfire on the graph', () => {
    const gates = G.nodes.filter((n) => n.kind === 'gate');
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({ zone: 'sich' });
    expect(gates[0]?.only).toBeUndefined();
    for (const kind of ['door', 'work', 'campfire'] as const) {
      expect(
        G.nodes.some((n) => n.kind === kind),
        kind,
      ).toBe(true);
    }
  });

  it('spawns start and walk to known nodes their role may use, within the Q11 budgets', () => {
    const counts: Record<AgentRole, number> = { villager: 0, cossack: 0, visitor: 0, cart: 0 };
    for (const a of KHORTYTSIA_WORLD.agents) {
      counts[a.role] += 1;
      for (const id of [a.home, ...a.goals]) {
        const node = G.nodes.find((n) => n.id === id);
        expect(node, id).toBeDefined();
        expect(!node?.only || node.only.includes(a.role), `${a.sprite} → ${id}`).toBe(true);
      }
      expect(a.speed >= 0 && a.rest >= 0 && a.phase >= 0).toBe(true);
    }
    for (const role of Object.keys(counts) as AgentRole[])
      expect(counts[role], role).toBeLessThanOrEqual(AGENT_BUDGET[role]);
  });
});
