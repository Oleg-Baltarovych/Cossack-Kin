// The Cossacks' day (plan M2-19): the ranks drill in step on the maidan facing the otaman, who speaks and then marches
// the front; free Cossacks idle about the suburb's tavern and smithy; at night by the fire with pipes, guards at their
// posts with torches; only as many Cossacks as the army has (`AgentContext.cossacks`), a new one walking out of the
// kurin; nothing on a plot that does not stand. Deterministic per seed.
import { describe, expect, it } from 'vitest';
import {
  AGENT_BUDGET,
  COSSACK_ANIMS,
  COSSACK_DAY,
  type AgentSpawn,
  type CossackSpawn,
  type NodeBuilding,
  type PathGraph,
} from '../../../src/content/agents.ts';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import type { VisualTiers } from '../../../src/core/selectors.ts';
import {
  agentCounts,
  agentPoses,
  createAgents,
  drillPhase,
  stepAgents,
  stepInPlace,
  TICK_HZ,
  type AgentContext,
  type AgentPool,
  type AgentPose,
} from '../../../src/render/agents/sim.ts';

/**
 * The suburb's tavern t and smithy s, the Sich gate g, the kurin door k, the maidan m with the drill row a, the
 * otaman's stand st and the review line re–rw before the ranks, the fire f, a second fire f2 (maidan IV) and a guard's
 * post p by a wall tower (walls II).
 */
const G: PathGraph = {
  nodes: [
    { id: 't', kind: 'door', x: 100, ground: 126, zone: 'suburb', building: 'tavern' },
    { id: 's', kind: 'way', x: 300, ground: 240, zone: 'suburb', building: 'smithy' },
    { id: 'g', kind: 'gate', x: 500, ground: 146, zone: 'sich' },
    { id: 'k', kind: 'door', x: 600, ground: 218, zone: 'sich', only: ['cossack'] },
    { id: 'm', kind: 'way', x: 700, ground: 150, zone: 'sich', only: ['cossack'] },
    { id: 'a', kind: 'way', x: 690, ground: 124, zone: 'sich', only: ['cossack'], building: 'maidan' },
    { id: 'st', kind: 'way', x: 750, ground: 129, zone: 'sich', only: ['cossack'], building: 'maidan' },
    { id: 're', kind: 'way', x: 740, ground: 144, zone: 'sich', only: ['cossack'], building: 'maidan' },
    { id: 'rw', kind: 'way', x: 640, ground: 144, zone: 'sich', only: ['cossack'], building: 'maidan' },
    { id: 'f', kind: 'campfire', x: 680, ground: 176, zone: 'sich', only: ['cossack'] },
    { id: 'f2', kind: 'campfire', x: 900, ground: 176, zone: 'sich', only: ['cossack'], building: 'maidan', from: 4 },
    { id: 'p', kind: 'way', x: 560, ground: 44, zone: 'sich', only: ['cossack'], building: 'walls', from: 2 },
  ],
  edges: [
    ['t', 'g'],
    ['s', 'g'],
    ['g', 'm'],
    ['m', 'k'],
    ['m', 'a'],
    ['m', 'st'],
    ['st', 're'],
    ['re', 'rw'],
    ['rw', 'm'],
    ['m', 'f'],
    ['f', 'f2'],
    ['g', 'p'],
  ],
};

const free: CossackSpawn = {
  routine: 'cossack',
  role: 'cossack',
  duty: 'free',
  sprite: 'kozak.a',
  home: 'k',
  haunts: ['t', 's'],
  night: { at: 'f', dx: -4, facing: 1, anim: 'sit-smoke' },
  speed: 22,
  phase: 0,
};
const rank: CossackSpawn = {
  routine: 'cossack',
  role: 'cossack',
  duty: 'rank',
  sprite: 'kozak.b',
  home: 'k',
  rank: { at: 'a', dx: -12, facing: 1 },
  haunts: ['t'],
  night: { at: 'f', dx: 0, facing: 1, anim: 'idle' },
  speed: 22,
  phase: 0,
};
const otaman: CossackSpawn = {
  routine: 'cossack',
  role: 'cossack',
  duty: 'otaman',
  sprite: 'otaman.a',
  home: 'k',
  stand: { at: 'st', dx: 0, facing: -1 },
  review: ['re', 'rw', 're'],
  speed: 16,
  phase: 0,
};
const guard: CossackSpawn = {
  routine: 'cossack',
  role: 'cossack',
  duty: 'guard',
  sprite: 'vartovyi.a',
  home: 'k',
  post: { at: 'p', dx: 0, facing: -1 },
  speed: 20,
  phase: 0,
};
const rank2: CossackSpawn = {
  ...rank,
  sprite: 'kozak.c',
  rank: { at: 'a', dx: 0, facing: 1 },
  night: { at: 'f2', dx: 0, facing: 1, anim: 'sit-smoke' },
};
/** Ids follow the spawn order: 0 free, 1 rank, 2 otaman, 3 guard, 4 rank2. */
const SICH: readonly AgentSpawn[] = [free, rank, otaman, guard, rank2];

function tiers(standing: Partial<Record<NodeBuilding, number>>): VisualTiers {
  const out: Record<string, number> = {};
  for (const id of [...FARM_BUILDING_IDS, ...SICH_BUILDING_IDS]) out[id] = standing[id] ?? 0;
  // Every farm and Sich id was written above.
  return out as VisualTiers;
}

const BUILT = tiers({ tavern: 1, smithy: 1, maidan: 2, walls: 2 });
const day = (t: VisualTiers | null = BUILT, cossacks?: number): AgentContext => ({
  minutes: 12 * 60,
  tiers: t,
  ...(cossacks === undefined ? {} : { cossacks }),
});
const night = (t: VisualTiers | null = BUILT): AgentContext => ({ minutes: 23 * 60, tiers: t });
const s = (sec: number): number => Math.round(sec * TICK_HZ);
const poseOf = (pool: AgentPool, id: number): AgentPose | undefined => agentPoses(pool).find((p) => p.id === id);
const node = (id: string) => {
  const n = G.nodes.find((x) => x.id === id);
  if (!n) throw new Error(id);
  return n;
};
const { speak, cheer, drill } = COSSACK_DAY.drill;

describe('Cossacks on the scene follow the army (plan M2-19)', () => {
  it('shows only the first `cossacks` Cossacks in authored order; without a game, all of them', () => {
    const two = createAgents(G, SICH, AGENT_BUDGET, 1, day(BUILT, 2));
    expect(agentPoses(two).map((p) => p.id)).toEqual([0, 1]);
    expect(agentCounts(two).cossack).toBe(2);
    const none = createAgents(G, SICH, AGENT_BUDGET, 1, day(BUILT, 0));
    expect(agentPoses(none)).toEqual([]);
    expect(agentCounts(none).total).toBe(0);
    const all = createAgents(G, SICH, AGENT_BUDGET, 1, day());
    expect(agentCounts(all).cossack).toBe(SICH.length);
  });

  it('a Cossack hired walks out of the kurin door and on to his place in the ranks', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day(BUILT, 1));
    expect(poseOf(pool, 1)).toBeUndefined();
    stepInPlace(pool, 1, day(BUILT, 2));
    const out = poseOf(pool, 1);
    expect(out?.anim).toBe('walk');
    expect(Math.hypot((out?.x ?? 0) - node('k').x, (out?.ground ?? 0) - node('k').ground)).toBeLessThanOrEqual(1);
    stepInPlace(pool, s(20), day(BUILT, 2));
    expect(poseOf(pool, 1)).toMatchObject({ x: node('a').x - 12, ground: node('a').ground, facing: 1 });
  });

  it('a Cossack the army no longer has walks into the kurin and is gone there (a reset)', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day(BUILT, 3));
    stepInPlace(pool, 1, day(BUILT, 1));
    expect(agentPoses(pool).map((p) => [p.id, p.anim])).toEqual([
      [0, expect.any(String)],
      [1, 'walk'],
      [2, 'walk'],
    ]);
    stepInPlace(pool, s(20), day(BUILT, 1));
    expect(agentPoses(pool).map((p) => p.id)).toEqual([0]);
  });
});

describe('the drill on the maidan (plan M2-19)', () => {
  it('the ranks stand in their places facing the otaman, who faces them from his stand', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day());
    stepInPlace(pool, s(1), day());
    expect(poseOf(pool, 1)).toMatchObject({ x: 678, ground: 124, facing: 1 });
    expect(poseOf(pool, 4)).toMatchObject({ x: 690, ground: 124, facing: 1 });
    expect(poseOf(pool, 2)).toMatchObject({ x: 750, ground: 129, facing: -1, anim: 'speak' });
  });

  it('one cycle for all, in step: speak (ranks stand), cheer, drill (same frame), at ease', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day());
    const at = (sec: number): [AgentPose | undefined, AgentPose | undefined] => {
      stepInPlace(pool, s(sec) - pool.ticks, day());
      return [poseOf(pool, 1), poseOf(pool, 4)];
    };
    expect(at(speak / 2).map((p) => p?.anim)).toEqual(['idle', 'idle']);
    expect(at(speak + cheer / 2).map((p) => p?.anim)).toEqual(['cheer', 'cheer']);
    for (const sec of [speak + cheer + 1, speak + cheer + 1.3, speak + cheer + 7.7]) {
      const [a, b] = at(sec);
      expect([a?.anim, b?.anim]).toEqual(['drill', 'drill']);
      expect(a?.frame).toBe(b?.frame);
    }
    expect(at(speak + cheer + drill + 1).map((p) => p?.anim)).toEqual(['idle', 'idle']);
    expect(drillPhase(s(speak + cheer + drill + 1))).toBe('ease');
  });

  it('the drill frames cycle at the drill rate', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day());
    stepInPlace(pool, s(speak + cheer), day());
    const frames = Array.from({ length: 8 }, () => {
      stepInPlace(pool, TICK_HZ / COSSACK_ANIMS.drill.fps, day());
      return poseOf(pool, 1)?.frame;
    });
    expect(frames).toEqual([1, 2, 3, 0, 1, 2, 3, 0]);
  });

  it('the otaman marches the front while the ranks drill, and is back at his stand for the next word', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day());
    stepInPlace(pool, s(speak + cheer + 1), day());
    const xs: number[] = [];
    for (let i = 0; i < drill * 10; i++) {
      stepInPlace(pool, TICK_HZ / 10, day());
      const p = poseOf(pool, 2);
      if (p?.anim === 'march') xs.push(p.x);
    }
    expect(Math.min(...xs)).toBeLessThanOrEqual(node('rw').x + 1);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(node('re').x - 1);
    stepInPlace(pool, s(COSSACK_DAY.drill.ease / 2), day());
    expect(poseOf(pool, 2)).toMatchObject({ x: 750, ground: 129, facing: -1, anim: 'idle' });
    stepInPlace(pool, s(COSSACK_DAY.drill.ease), day());
    expect(poseOf(pool, 2)?.anim).toBe('speak');
  });

  it('no maidan, no drill: the ranks idle about their haunts and the otaman stays in the kurin', () => {
    const noMaidan = tiers({ tavern: 1, smithy: 1, walls: 2 });
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day(noMaidan));
    for (let i = 0; i < 60; i++) {
      stepInPlace(pool, TICK_HZ, day(noMaidan));
      const poses = agentPoses(pool);
      expect(poses.some((p) => p.anim === 'drill' || p.id === 2)).toBe(false);
    }
  });
});

describe('free Cossacks, the night and the guards (plan M2-19)', () => {
  it('a free Cossack goes from one haunt to another — out of the Sich to the tavern and the smithy', () => {
    const pool = createAgents(G, [free], AGENT_BUDGET, 3, day());
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      stepInPlace(pool, TICK_HZ / 2, day());
      const p = poseOf(pool, 0);
      for (const id of ['t', 's'])
        if (p?.anim === 'idle' && Math.abs(p.x - node(id).x) <= 12 && p.ground === node(id).ground) seen.add(id);
    }
    expect([...seen].sort()).toEqual(['s', 't']);
  });

  it('a free Cossack skips a haunt whose building does not stand', () => {
    const noTavern = tiers({ smithy: 1, maidan: 2 });
    const pool = createAgents(G, [free], AGENT_BUDGET, 3, day(noTavern));
    for (let i = 0; i < 400; i++) {
      stepInPlace(pool, TICK_HZ / 2, day(noTavern));
      const p = poseOf(pool, 0);
      expect(p && Math.abs(p.x - node('t').x) <= 12 && p.ground === node('t').ground).toBe(false);
    }
  });

  it('at night: pipes by the fire, the otaman in the kurin, the guard with a torch at his post', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, night());
    stepInPlace(pool, s(2), night());
    expect(poseOf(pool, 0)).toMatchObject({ x: 676, ground: 176, facing: 1, anim: 'sit-smoke' });
    expect(poseOf(pool, 1)).toMatchObject({ x: 680, ground: 176, facing: 1, anim: 'idle' });
    expect(poseOf(pool, 2)).toBeUndefined();
    expect(poseOf(pool, 3)).toMatchObject({ x: 560, ground: 44, facing: -1, anim: 'torch' });
    // The second fire burns only from maidan IV: without it that Cossack is in the kurin.
    expect(poseOf(pool, 4)).toBeUndefined();
    const four = tiers({ tavern: 1, smithy: 1, maidan: 4, walls: 2 });
    expect(poseOf(createAgents(G, SICH, AGENT_BUDGET, 1, night(four)), 4)).toMatchObject({ x: 900, anim: 'sit-smoke' });
  });

  it('by day the guard leans on his spear at the post; with no tower there, he is in the kurin', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day());
    stepInPlace(pool, s(1), day());
    expect(poseOf(pool, 3)).toMatchObject({ x: 560, ground: 44, anim: 'watch' });
    const lowWalls = tiers({ tavern: 1, smithy: 1, maidan: 2, walls: 1 });
    expect(poseOf(createAgents(G, SICH, AGENT_BUDGET, 1, day(lowWalls)), 3)).toBeUndefined();
  });

  it('evening sends the ranks to the fire and the guard lights his torch; morning back to the drill', () => {
    const pool = createAgents(G, SICH, AGENT_BUDGET, 1, day());
    stepInPlace(pool, s(60), night());
    expect(poseOf(pool, 1)).toMatchObject({ x: 680, anim: 'idle', ground: 176 });
    expect(poseOf(pool, 3)?.anim).toBe('torch');
    stepInPlace(pool, s(60), day());
    expect(poseOf(pool, 1)).toMatchObject({ x: 678, ground: 124 });
    expect(poseOf(pool, 3)?.anim).toBe('watch');
  });

  it('is deterministic per seed however the ticks are split', () => {
    const a = createAgents(G, SICH, AGENT_BUDGET, 9, day());
    const b = createAgents(G, SICH, AGENT_BUDGET, 9, day());
    stepInPlace(a, s(90), day());
    for (let i = 0; i < 90; i++) stepInPlace(b, TICK_HZ, day());
    expect(agentPoses(b)).toEqual(agentPoses(a));
    expect(agentPoses(stepAgents(a, s(30), night()))).toEqual(agentPoses(stepAgents(b, s(30), night())));
  });
});

describe('Cossack poses type-check per sprite family (plan M2-19)', () => {
  it('rank-and-file, otaman and guard sprites take only their own animations', () => {
    const base = { id: 0, x: 0, ground: 0, facing: 1, frame: 0 } as const;
    const ok: AgentPose[] = [
      { ...base, sprite: 'kozak.b', anim: 'sit-smoke' },
      { ...base, sprite: 'otaman.a', anim: 'march' },
      { ...base, sprite: 'vartovyi.b', anim: 'torch' },
    ];
    // @ts-expect-error a Cossack has no work frames (the type check is the assertion; tsc runs over tests)
    const a: AgentPose = { ...base, sprite: 'kozak.a', anim: 'work-field' };
    // @ts-expect-error the otaman does not drill
    const b: AgentPose = { ...base, sprite: 'otaman.a', anim: 'drill' };
    // @ts-expect-error a villager has no torch
    const c: AgentPose = { ...base, sprite: 'selianyn.a', anim: 'torch' };
    expect([...ok, a, b, c].length).toBe(6);
  });
});

describe('the army shrinks and grows within a session (M2-19 review)', () => {
  const W = KHORTYTSIA_WORLD;
  const ctx = (n: number, minutes = 12 * 60): AgentContext => ({ minutes, tiers: null, cossacks: n });
  const kurin = W.paths.nodes.find((n) => n.id === 'sich.kurin');
  const cossackPoses = (pool: AgentPool): AgentPose[] =>
    agentPoses(pool).filter((p) => pool.agents.find((a) => a.id === p.id)?.role === 'cossack');

  it('a Cossack the army loses walks back into the kurin (no pop mid-drill), then is gone; 8 → 5 → 8 refills the ranks', () => {
    const pool = createAgents(W.paths, W.agents, AGENT_BUDGET, 1, ctx(8));
    stepInPlace(pool, s(40), ctx(8));
    const ranksAt = (): string[] =>
      cossackPoses(pool)
        .filter((p) => {
          const spawn = pool.agents.find((a) => a.id === p.id)?.spawn;
          return spawn?.routine === 'cossack' && spawn.duty === 'rank';
        })
        .map((p) => `${String(p.id)}@${String(p.x)},${String(p.ground)}`)
        .sort();
    const before = cossackPoses(pool).map((p) => p.id);
    expect(before).toHaveLength(8);
    const full = ranksAt();

    stepInPlace(pool, 1, ctx(5));
    // Those leaving are still on the scene, walking — never dropped in place.
    const leaving = cossackPoses(pool).filter((p) => !before.slice(0, 5).includes(p.id));
    expect(leaving.length).toBe(3);
    for (const p of leaving) expect(p.anim).toBe('walk');
    for (let i = 0; i < 60; i++) {
      stepInPlace(pool, TICK_HZ / 2, ctx(5));
      const ids = cossackPoses(pool).map((p) => p.id);
      expect(new Set(ids).size, 'one pose per id').toBe(ids.length);
      for (const p of cossackPoses(pool).filter((q) => !before.slice(0, 5).includes(q.id)))
        expect(p.anim, 'a leaving Cossack only walks home').toBe('walk');
    }
    expect(cossackPoses(pool).map((p) => p.id)).toEqual(before.slice(0, 5));
    expect(agentCounts(pool).cossack).toBe(5);

    stepInPlace(pool, 1, ctx(8));
    const back = cossackPoses(pool).filter((p) => !before.slice(0, 5).includes(p.id));
    for (const p of back) {
      expect(p.anim).toBe('walk');
      expect(Math.abs(p.x - (kurin?.x ?? 0)) + Math.abs(p.ground - (kurin?.ground ?? 0))).toBeLessThanOrEqual(2);
    }
    // Back in the same places: no gap in the ranks (the drill clock picks the step, places are fixed).
    stepInPlace(pool, s(30) - (pool.ticks % s(30)) + s(40 % 30), ctx(8));
    expect(ranksAt()).toEqual(full);
  });
});
