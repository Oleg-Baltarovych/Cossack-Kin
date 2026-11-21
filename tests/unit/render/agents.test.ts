import { describe, expect, it } from 'vitest';
import { AGENT_BUDGET, type AgentSpawn, type PathGraph } from '../../../src/content/agents.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import {
  agentCounts,
  agentPoses,
  createAgents,
  IDLE_FPS,
  IDLE_FRAMES,
  NOON,
  stepAgents,
  TICK_HZ,
  WALK_FPS,
  WALK_FRAMES,
} from '../../../src/render/agents/sim.ts';
import { createAgentDriver, MAX_CATCH_UP_S, stepCap } from '../../../src/render/agents/driver.ts';

const W = KHORTYTSIA_WORLD;
/** The people (one pose each, on the graph); the carts and their drivers have their own tests (carts.test.ts). */
// Carts and visitors come and go on their own timetables (carts.test.ts, visitors.test.ts).
const PEOPLE = W.agents.filter((a) => a.routine !== 'cart' && a.routine !== 'visitor');

/** A straight road a—b, 60 px long on row 100, and a Cossack-only node c behind b. */
const LINE: PathGraph = {
  nodes: [
    { id: 'a', kind: 'way', x: 100, ground: 100, zone: 'farm' },
    { id: 'b', kind: 'way', x: 160, ground: 100, zone: 'farm' },
    { id: 'c', kind: 'way', x: 160, ground: 160, zone: 'sich', only: ['cossack'] },
  ],
  edges: [
    ['a', 'b'],
    ['b', 'c'],
  ],
};
const walker: AgentSpawn = {
  routine: 'wander',
  role: 'villager',
  sprite: 'selianka.a',
  home: 'a',
  goals: ['b', 'a'],
  order: 'cycle',
  speed: 20,
  rest: 2,
  phase: 0,
};
const seconds = (s: number): number => Math.round(s * TICK_HZ);

describe('agents (plan M2-16)', () => {
  it('walks the edge at its speed facing the way it goes, rests at the goal, then walks back', () => {
    const pool = createAgents(LINE, [walker], AGENT_BUDGET, 1);
    const at = (s: number) => agentPoses(stepAgents(pool, seconds(s)))[0];
    expect(at(0)).toMatchObject({ x: 100, ground: 100, anim: 'idle' });
    expect(at(1)).toMatchObject({ x: 120, ground: 100, facing: 1, anim: 'walk' });
    expect(at(3.5)).toMatchObject({ x: 160, anim: 'idle' });
    expect(at(6)).toMatchObject({ x: 140, facing: -1, anim: 'walk' });
  });

  it('cycles walk frames at WALK_FPS and idle frames at IDLE_FPS', () => {
    const pool = createAgents(LINE, [walker], AGENT_BUDGET, 1);
    const frameAt = (ticks: number) => agentPoses(stepAgents(pool, ticks))[0]?.frame;
    // Walking from tick 0 (the first goal is picked at once).
    expect(frameAt(1)).toBe(0);
    expect(frameAt(TICK_HZ / WALK_FPS)).toBe(1);
    expect(frameAt((WALK_FRAMES * TICK_HZ) / WALK_FPS)).toBe(0);
    const still = createAgents(LINE, [{ ...walker, goals: [] }], AGENT_BUDGET, 1);
    expect(agentPoses(stepAgents(still, TICK_HZ / IDLE_FPS))[0]?.frame).toBe(1);
    expect(agentPoses(stepAgents(still, (IDLE_FRAMES * TICK_HZ) / IDLE_FPS))[0]?.frame).toBe(0);
  });

  it('is deterministic: the same seed and the same steps give the same poses, however the ticks are split', () => {
    const run = (seed: number, chunks: readonly number[]) => {
      let pool = createAgents(W.paths, W.agents, AGENT_BUDGET, seed);
      const out = [];
      for (const n of chunks) {
        pool = stepAgents(pool, n);
        out.push(agentPoses(pool));
      }
      return { out, pool };
    };
    const chunks = Array.from({ length: 200 }, (_, i) => 1 + (i % 7));
    expect(run(7, chunks).out).toEqual(run(7, chunks).out);
    const total = chunks.reduce((a, b) => a + b, 0);
    expect(agentPoses(run(7, [total]).pool)).toEqual(agentPoses(run(7, chunks).pool));
    // The seed matters (random-order agents choose other goals).
    expect(agentPoses(run(8, [total]).pool)).not.toEqual(agentPoses(run(7, [total]).pool));
  });

  it('never mutates the pool it steps', () => {
    const pool = createAgents(W.paths, W.agents, AGENT_BUDGET, 3);
    const before = JSON.stringify(pool);
    const stepped = stepAgents(pool, 500);
    expect(JSON.stringify(pool)).toBe(before);
    expect(agentPoses(stepped)).not.toEqual(agentPoses(pool));
  });

  it('keeps every agent on the graph: each pose lies on an edge (or a node) it may use', () => {
    const nodes = new Map(W.paths.nodes.map((n) => [n.id, n]));
    let pool = createAgents(W.paths, PEOPLE, AGENT_BUDGET, 11);
    expect(agentPoses(pool)).toHaveLength(PEOPLE.length);
    for (let i = 0; i < 300; i++) {
      pool = stepAgents(pool, 17);
      for (const [k, pose] of agentPoses(pool).entries()) {
        const role = pool.agents[k]?.role ?? 'villager';
        const agent = pool.agents[k];
        // Px beside a shared spot (M2-18), or beside his node in the ranks (a rear file, M2-19).
        const offset =
          Math.abs(agent?.offset ?? 0) +
          (agent?.spawn.routine === 'cossack' && agent.spawn.duty === 'rank' ? Math.abs(agent.spawn.rank.dx) : 0);
        const onEdge = W.paths.edges.some(([p, q]) => {
          const a = nodes.get(p);
          const b = nodes.get(q);
          if (!a || !b) return false;
          if ([a, b].some((n) => n.only && !n.only.includes(role))) return false;
          // Whole-px pose within 1 px of the segment a—b (plus the px it stands beside a shared spot, M2-18).
          const dx = b.x - a.x;
          const dy = b.ground - a.ground;
          const t = Math.max(
            0,
            Math.min(1, ((pose.x - a.x) * dx + (pose.ground - a.ground) * dy) / (dx * dx + dy * dy)),
          );
          return Math.hypot(a.x + t * dx - pose.x, a.ground + t * dy - pose.ground) <= 1 + Math.abs(offset);
        });
        expect(onEdge, `agent ${String(k)} at ${String(pose.x)},${String(pose.ground)}`).toBe(true);
      }
    }
  });

  it('a villager told to go past the gate stays outside', () => {
    const pool = createAgents(LINE, [{ ...walker, goals: ['c'] }], AGENT_BUDGET, 1);
    for (const t of [1, 10, 60]) expect(agentPoses(stepAgents(pool, seconds(t)))[0]).toMatchObject({ x: 100 });
  });

  it('keeps the first spawns of each role within the budgets (Q11) and counts agents by role', () => {
    const villagers = Array.from({ length: 40 }, (_, k) => ({ ...walker, phase: k / 10 }));
    const cossacks = Array.from({ length: 20 }, (_, k) => ({
      ...walker,
      role: 'cossack' as const,
      sprite: 'kozak.a' as const,
      phase: k / 10,
    }));
    const pool = createAgents(LINE, [...villagers, ...cossacks], AGENT_BUDGET, 1);
    expect(agentCounts(pool)).toEqual({
      total: AGENT_BUDGET.villager + AGENT_BUDGET.cossack,
      villager: AGENT_BUDGET.villager,
      cossack: AGENT_BUDGET.cossack,
      visitor: 0,
      cart: 0,
    });
    // Agent ids are spawn indices: the first 25 villagers (0–24) and the first 16 Cossacks (40–55) stay.
    const ids = pool.agents.map((a) => a.id);
    expect(ids).toEqual([
      ...Array.from({ length: AGENT_BUDGET.villager }, (_, k) => k),
      ...Array.from({ length: AGENT_BUDGET.cossack }, (_, k) => 40 + k),
    ]);
    expect(agentPoses(pool).map((p) => p.id)).toEqual(ids);
  });

  it('drops random goals it cannot reach, so a villager never waits on the Sich', () => {
    const pool = createAgents(LINE, [{ ...walker, goals: ['c', 'b'], order: 'random' }], AGENT_BUDGET, 4);
    expect(pool.agents[0]?.goals).toEqual(['b']);
    let p = pool;
    const seen = new Set<string>();
    for (let k = 0; k < 100; k++) {
      p = stepAgents(p, 30);
      seen.add(p.agents[0]?.at ?? '');
    }
    expect(seen.has('b')).toBe(true);
    expect(seen.has('c')).toBe(false);
  });

  it('throws on a broken graph or a spawn whose home is unknown or closed to it', () => {
    const broken: PathGraph = { nodes: LINE.nodes, edges: [...LINE.edges, ['a', 'zz']] };
    expect(() => createAgents(broken, [walker], AGENT_BUDGET, 1)).toThrow(/unknown node/);
    expect(() => createAgents(LINE, [{ ...walker, home: 'zz' }], AGENT_BUDGET, 1)).toThrow(/no node/);
    expect(() => createAgents(LINE, [{ ...walker, home: 'c' }], AGENT_BUDGET, 1)).toThrow(/closed/);
  });

  it('phase runs an agent ahead (two agents on one route do not walk in step)', () => {
    const ahead = createAgents(LINE, [{ ...walker, phase: 1 }], AGENT_BUDGET, 1);
    const plain = createAgents(LINE, [walker], AGENT_BUDGET, 1);
    expect(agentPoses(ahead)).toEqual(agentPoses(stepAgents(plain, TICK_HZ)));
    expect(agentPoses(ahead)).not.toEqual(agentPoses(plain));
  });
});

describe('agent driver (render clock → whole ticks)', () => {
  const fresh = (graph: PathGraph = W.paths, spawns: readonly AgentSpawn[] = PEOPLE) =>
    createAgents(graph, spawns, AGENT_BUDGET, 5);

  it('steps to round(seconds × TICK_HZ) ticks, so a frozen frame equals one run of that many ticks', () => {
    const live = createAgentDriver(() => fresh(), stepCap(false));
    for (const s of [0, 0.016, 0.05, 0.3]) live.advance(s, NOON);
    expect(live.poses()).toEqual(agentPoses(stepAgents(fresh(), seconds(0.3))));
    expect(live.poses()).toHaveLength(PEOPLE.length);
    expect(live.poses()).not.toEqual(agentPoses(fresh()));
    const frozen = createAgentDriver(() => fresh(), stepCap(true));
    frozen.advance(0.3, NOON);
    frozen.advance(0.3, NOON);
    expect(frozen.poses()).toEqual(live.poses());
  });

  it('a frozen clock steps any jump in full: ?freeze=100 is a run of 6000 ticks', () => {
    const frozen = createAgentDriver(() => fresh(), stepCap(true));
    frozen.advance(100, NOON);
    expect(frozen.ticks()).toBe(seconds(100));
    expect(frozen.poses()).toEqual(agentPoses(stepAgents(fresh(), seconds(100))));
  });

  it('a live clock catches up at most MAX_CATCH_UP_S of a long gap and skips the rest', () => {
    const live = createAgentDriver(() => fresh(LINE, [walker]), stepCap(false));
    live.advance(0, NOON);
    live.advance(3600, NOON);
    expect(live.ticks()).toBe(seconds(MAX_CATCH_UP_S));
    expect(live.poses()).toEqual(agentPoses(stepAgents(fresh(LINE, [walker]), seconds(MAX_CATCH_UP_S))));
    // Afterwards it follows the clock from where it is: one more second = one more second of walking.
    live.advance(3601, NOON);
    expect(live.ticks()).toBe(seconds(MAX_CATCH_UP_S + 1));
    expect(live.poses()).toEqual(agentPoses(stepAgents(fresh(LINE, [walker]), seconds(MAX_CATCH_UP_S + 1))));
  });

  it('reuses its pose array and slots frame to frame', () => {
    const live = createAgentDriver(() => fresh(), stepCap(false));
    live.advance(0.1, NOON);
    const a = live.poses();
    const first = a[0];
    live.advance(0.2, NOON);
    expect(live.poses()).toBe(a);
    expect(live.poses()[0]).toBe(first);
  });
});
