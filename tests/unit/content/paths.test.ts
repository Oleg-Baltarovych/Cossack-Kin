import { describe, expect, it } from 'vitest';
import { AGENT_BUDGET, NIGHT_SPOT_CAP, spawnNodes, VILLAGER_DAY, type AgentRole } from '../../../src/content/agents.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { TORCH_LIGHT } from '../../../src/render/atmosphere/config.ts';

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
      for (const id of spawnNodes(a)) {
        const node = G.nodes.find((n) => n.id === id);
        expect(node, id).toBeDefined();
        expect(!node?.only || node.only.includes(a.role), `${a.sprite} → ${id}`).toBe(true);
      }
      expect(a.speed >= 0 && a.phase >= 0).toBe(true);
      if (a.routine === 'wander') expect(a.rest).toBeGreaterThanOrEqual(0);
    }
    for (const role of Object.keys(counts) as AgentRole[])
      expect(counts[role], role).toBeLessThanOrEqual(AGENT_BUDGET[role]);
  });
});

describe('khortytsia villagers (plan M2-18)', () => {
  const node = (id: string) => G.nodes.find((n) => n.id === id);
  const villagers = KHORTYTSIA_WORLD.agents.filter((a) => a.routine === 'villager');

  it('has at least 8 villagers in the scene (AC), within the budget', () => {
    const all = KHORTYTSIA_WORLD.agents.filter((a) => a.role === 'villager');
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(all.length).toBeLessThanOrEqual(AGENT_BUDGET.villager);
  });

  it('a work spot is a work node tied to a building, with a work animation', () => {
    for (const n of G.nodes.filter((q) => q.work !== undefined)) {
      expect(n.kind, n.id).toBe('work');
      expect(n.building, n.id).toBeDefined();
    }
    for (const v of villagers) {
      expect(v.work.length, v.sprite).toBeGreaterThan(0);
      for (const id of v.work) expect(node(id)?.work, `${v.sprite} works at ${id}`).toBeDefined();
    }
  });

  it('homes are always open (no building), so everyone has somewhere to be on an empty plot', () => {
    for (const a of KHORTYTSIA_WORLD.agents)
      expect(node(a.home)?.building, `${a.sprite} home ${a.home}`).toBeUndefined();
  });

  it('no two villagers share a work spot (they would stand in one another)', () => {
    const spots = villagers.flatMap((v) => v.work);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('working hours are a day window inside one day, with ordered step ranges', () => {
    expect(VILLAGER_DAY.from).toBeLessThan(VILLAGER_DAY.until);
    expect(VILLAGER_DAY.until).toBeLessThanOrEqual(24 * 60);
    for (const [lo, hi] of [VILLAGER_DAY.workS, VILLAGER_DAY.chatS, VILLAGER_DAY.idleS]) {
      expect(lo).toBeGreaterThan(0);
      expect(lo).toBeLessThanOrEqual(hi);
    }
  });
});

describe('khortytsia night spots (art-director M2-18)', () => {
  it('at most three outside a spot: two on a side (one sitting, one standing, 3–4 px apart), a third across', () => {
    const outside = new Map<string, { dx: number; anim: string }[]>();
    for (const a of KHORTYTSIA_WORLD.agents) {
      if (a.routine !== 'villager' || a.night.anim === 'indoors') continue;
      const list = outside.get(a.night.at) ?? [];
      list.push({ dx: a.night.dx, anim: a.night.anim });
      outside.set(a.night.at, list);
    }
    for (const [at, people] of outside) {
      expect(people.length, at).toBeLessThanOrEqual(NIGHT_SPOT_CAP.total);
      for (const side of [people.filter((p) => p.dx < 0), people.filter((p) => p.dx >= 0)]) {
        expect(side.length, at).toBeLessThanOrEqual(NIGHT_SPOT_CAP.perSide);
        const [a, b] = side;
        if (!a || !b) continue;
        expect(
          [a.anim, b.anim].filter((x) => x === 'sit'),
          `${at}: one sits, one stands`,
        ).toHaveLength(1);
        const gap = Math.abs(a.dx - b.dx);
        expect(gap, at).toBeGreaterThanOrEqual(NIGHT_SPOT_CAP.pairGap[0]);
        expect(gap, at).toBeLessThanOrEqual(NIGHT_SPOT_CAP.pairGap[1]);
      }
    }
  });

  it('a villager whose night spot is not standing goes in at a door that always stands', () => {
    for (const a of KHORTYTSIA_WORLD.agents) {
      // A food cart's home is the road node its depot hangs off (M2-20), not a door.
      if (a.routine === 'cart') continue;
      const door = a.routine === 'wander' ? a.indoors : a.home;
      if (door === undefined) continue;
      const node = G.nodes.find((n) => n.id === door);
      expect(node?.kind, `${a.sprite} → ${door}`).toBe('door');
      expect(node?.building, door).toBeUndefined();
    }
  });
});

describe('khortytsia Cossacks (plan M2-19)', () => {
  const node = (id: string) => G.nodes.find((n) => n.id === id);
  const cossacks = KHORTYTSIA_WORLD.agents.filter((a) => a.routine === 'cossack');
  const edge = (a: string, b: string): boolean =>
    G.edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

  it('the Sich has the whole budget of Cossacks with a duty: one otaman, ranks, free Cossacks and guards', () => {
    expect(cossacks).toHaveLength(AGENT_BUDGET.cossack);
    const duties = cossacks.map((c) => c.duty);
    expect(duties.filter((d) => d === 'otaman')).toHaveLength(1);
    for (const d of ['rank', 'free', 'guard'] as const)
      expect(duties.filter((x) => x === d).length, d).toBeGreaterThan(1);
    // A small army (6, the `mid` preset) already shows a drill: the otaman and three ranks come first.
    const first = cossacks.slice(0, 6).map((c) => c.duty);
    expect(first.filter((d) => d === 'rank').length).toBeGreaterThanOrEqual(3);
    expect(first).toContain('otaman');
  });

  it('every Cossack lives in the kurin (a hire walks out of its door)', () => {
    for (const c of cossacks) expect(node(c.home)).toMatchObject({ kind: 'door', zone: 'sich' });
  });

  it('the ranks stand in distinct places on the maidan, facing the otaman, who faces them', () => {
    const otaman = cossacks.find((c) => c.duty === 'otaman');
    if (otaman?.duty !== 'otaman') throw new Error('no otaman');
    const stand = node(otaman.stand.at);
    const places = new Set<string>();
    for (const c of cossacks) {
      if (c.duty !== 'rank') continue;
      const at = node(c.rank.at);
      expect(at?.building, c.rank.at).toBe('maidan');
      const x = (at?.x ?? 0) + c.rank.dx;
      expect(c.rank.facing, c.rank.at).toBe(x < (stand?.x ?? 0) ? 1 : -1);
      places.add(`${c.rank.at}:${String(c.rank.dx)}`);
    }
    expect(places.size).toBe(cossacks.filter((c) => c.duty === 'rank').length);
    expect(otaman.stand.facing).toBe(-1);
    // The review walks the graph: stand → review nodes → stand, one edge at a time.
    const walk = [otaman.stand.at, ...otaman.review, otaman.stand.at];
    for (let i = 1; i < walk.length; i++) expect(edge(walk[i - 1] ?? '', walk[i] ?? ''), walk[i]).toBe(true);
  });

  it("free Cossacks idle at the suburb's tavern, smithy and fair (they may leave the Sich)", () => {
    for (const c of cossacks) {
      if (c.duty !== 'free') continue;
      const buildings = c.haunts.map((h) => node(h)?.building);
      for (const b of ['tavern', 'smithy', 'fair'] as const) expect(buildings, c.sprite).toContain(b);
    }
  });

  it('at a fire place at night two at most: one with a pipe, one standing 3–4 px beside him, facing the fire', () => {
    const at = new Map<string, { dx: number; anim: string; facing: number }[]>();
    for (const c of cossacks) {
      if ((c.duty !== 'rank' && c.duty !== 'free') || c.night.anim === 'indoors') continue;
      expect(node(c.night.at)?.kind, c.night.at).toBe('campfire');
      const list = at.get(c.night.at) ?? [];
      list.push({ dx: c.night.dx, anim: c.night.anim, facing: c.night.facing });
      at.set(c.night.at, list);
    }
    for (const [id, people] of at) {
      expect(people.length, id).toBeLessThanOrEqual(NIGHT_SPOT_CAP.perSide);
      const [a, b] = people;
      if (!a || !b) continue;
      expect([a.anim, b.anim].sort(), id).toEqual(['idle', 'sit-smoke']);
      expect(Math.abs(a.dx - b.dx), id).toBeGreaterThanOrEqual(NIGHT_SPOT_CAP.pairGap[0]);
      expect(Math.abs(a.dx - b.dx), id).toBeLessThanOrEqual(NIGHT_SPOT_CAP.pairGap[1]);
      expect(a.facing, id).toBe(b.facing);
    }
  });

  it('guards keep distinct posts by the towers, each open only while its tower stands', () => {
    const posts = cossacks.flatMap((c) => (c.duty === 'guard' ? [c.post.at] : []));
    expect(new Set(posts).size).toBe(posts.length);
    for (const p of posts) expect(['special', 'walls'], p).toContain(node(p)?.building);
    // Torch budget guard: the light layer draws at most TORCH_LIGHT.max torch pools.
    expect(posts.length).toBeLessThanOrEqual(TORCH_LIGHT.max);
  });
});
