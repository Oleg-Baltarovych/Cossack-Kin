// The raid squad on the scene (plan M3-14, SPEC §6.6; route: art-director M3-13). Cossacks already on the scene muster
// on the maidan, march up the trail into the gate's passage and fade out (nobody walks past the wall); while the raid
// is away they are not there; a live return comes back the same way — the banner first, the chest carriers last — and
// sets the chest down mid-maidan, where it stands until claimed; a return the scene did not see live (before the load,
// an absence) has no parade: the chest is simply there (Q14). Villagers cheer at the Sich's threshold, never inside.
// Deterministic per seed and context history; the budget of 16 Cossacks is never exceeded.
import { describe, expect, it } from 'vitest';
import {
  AGENT_BUDGET,
  CHEST_SPRITE,
  KOZAK_SPRITES,
  RAID_SQUAD,
  type AgentSpawn,
  type AgentSprite,
  type PathGraph,
  type RaidRoute,
} from '../../../src/content/agents.ts';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import type { VisualTiers } from '../../../src/core/selectors.ts';
import { KHORTYTSIA_RAID } from '../../../src/content/villages/khortytsia.paths.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { createAgentDriver } from '../../../src/render/agents/driver.ts';
import { findPath, nodeOf } from '../../../src/render/agents/graph.ts';
import {
  agentCounts,
  agentPoses,
  createAgents,
  squadPhases,
  stepInPlace,
  TICK_HZ,
  type AgentContext,
  type AgentPool,
  type AgentPose,
  type SquadScene,
} from '../../../src/render/agents/sim.ts';

const W = KHORTYTSIA_WORLD;
const G = W.paths;
const ROUTE = KHORTYTSIA_RAID;
const SEED = 7;

const idle: SquadScene = { state: 'idle', live: false };
const away = (live: boolean): SquadScene => ({ state: 'away', live });
const back = (live: boolean): SquadScene => ({ state: 'back', live });

const ctxOf = (raids: readonly SquadScene[], over: Partial<AgentContext> = {}): AgentContext => ({
  minutes: 13 * 60,
  tiers: null,
  cossacks: 16,
  raids,
  ...over,
});

const make = (raids: readonly SquadScene[], over: Partial<AgentContext> = {}, seed = SEED): AgentPool =>
  createAgents(G, W.agents, AGENT_BUDGET, seed, ctxOf(raids, over), ROUTE);

/** Steps `sec` in 0.1-s frames, collecting every frame's poses. */
function run(pool: AgentPool, sec: number, ctx: AgentContext): AgentPose[][] {
  const frames: AgentPose[][] = [];
  const per = Math.round(TICK_HZ / 10);
  for (let t = 0; t < Math.round(sec * 10); t++) {
    stepInPlace(pool, per, ctx);
    frames.push(agentPoses(pool));
  }
  return frames;
}

const COSSACK_LOOKS: ReadonlySet<AgentSprite> = new Set<AgentSprite>([
  ...KOZAK_SPRITES,
  'otaman.a',
  'vartovyi.a',
  'vartovyi.b',
  'khorunzhyi.a',
]);
/** Cossacks a frame shows: one per pose, two for the chest carriers' figure. */
const cossacksShown = (poses: readonly AgentPose[]): number =>
  poses.reduce((n, p) => n + (p.sprite === 'nosii.a' ? 2 : COSSACK_LOOKS.has(p.sprite) ? 1 : 0), 0);

const gate = nodeOf(G, ROUTE.gate);
const sichGate = nodeOf(G, ROUTE.cheer);
const chestA = nodeOf(G, ROUTE.chests[0]?.at ?? '');

/** The pool's state after a live leave (idle → away) and `sec` s. */
function leaving(sec: number, over: Partial<AgentContext> = {}): { pool: AgentPool; frames: AgentPose[][] } {
  const pool = make([idle, idle], over);
  const frames = run(pool, sec, ctxOf([away(true), idle], over));
  return { pool, frames };
}

describe('M3-14 a squad leaves', () => {
  it('a live start musters the squad, marches it under the banner into the gate and leaves it away', () => {
    const { pool, frames } = leaving(60);
    const bearer = frames.flat().filter((p) => p.sprite === 'khorunzhyi.a');
    expect(bearer.length).toBeGreaterThan(0);
    expect(bearer.some((p) => p.anim === 'march')).toBe(true);
    expect(squadPhases(pool)).toEqual(['away', 'home']);
    const last = frames[frames.length - 1] ?? [];
    expect(last.some((p) => p.sprite === 'khorunzhyi.a' || p.sprite === 'otaman.a')).toBe(false);
  });

  it('the squad comes from the Cossacks on the scene: ≤ RAID_SQUAD.men, ≤ half the rank and free ones, + the otaman', () => {
    const before = agentCounts(make([idle, idle])).cossack;
    const { pool } = leaving(60);
    const gone = before - agentCounts(pool).cossack;
    // 16 on the scene: 11 rank and free Cossacks → 5 men, and the otaman.
    expect(gone).toBe(Math.min(RAID_SQUAD.men, Math.floor(11 / 2)) + 1);
    // A small army: 4 on the scene (a free one, two ranks and the otaman) → 1 man and the otaman.
    const small = leaving(60, { cossacks: 4 });
    expect(agentCounts(make([idle, idle], { cossacks: 4 })).cossack - agentCounts(small.pool).cossack).toBe(2);
  });

  it('nobody walks past the wall: each man fades in two alpha steps in the gate passage', () => {
    const { frames } = leaving(60);
    const squad = frames.flat().filter((p) => p.x >= gate.x - 30 && p.x <= gate.x + 30 && p.ground < gate.ground + 30);
    for (const p of squad) expect(p.ground).toBeGreaterThanOrEqual(gate.ground);
    const alphas = new Set(frames.flat().map((p) => p.alpha ?? 1));
    expect([...alphas].sort()).toEqual([1 / 3, 2 / 3, 1].sort());
  });

  it('a second squad marches under its own banner; the otaman stays on the maidan', () => {
    const pool = make([idle, idle]);
    const frames = run(pool, 60, ctxOf([idle, away(true)]));
    expect(frames.flat().some((p) => p.sprite === 'khorunzhyi.a')).toBe(true);
    expect(squadPhases(pool)).toEqual(['home', 'away']);
    // In every frame, far from the gate (his stand before the ranks), never fading.
    for (const f of frames) {
      const otaman = f.find((p) => p.sprite === 'otaman.a');
      expect(otaman).toBeDefined();
      expect(otaman?.ground ?? 0).toBeGreaterThan(gate.ground + 60);
      expect(otaman?.alpha ?? 1).toBe(1);
    }
  });

  it('a man with no way to the muster line is put on it once, never searched for every tick', () => {
    // A tiny Sich: the kurin's only way to the maidan crosses the walls' yard, closed while the walls do not stand.
    const nodes = [
      { id: 'k', kind: 'door', x: 100, ground: 150, zone: 'sich', only: ['cossack'] },
      { id: 'y', kind: 'way', x: 150, ground: 150, zone: 'sich', only: ['cossack'], building: 'walls' },
      { id: 'm', kind: 'way', x: 200, ground: 100, zone: 'sich', only: ['cossack'] },
      { id: 'f', kind: 'way', x: 210, ground: 80, zone: 'sich', only: ['cossack'] },
      { id: 'g', kind: 'way', x: 210, ground: 40, zone: 'sich', only: ['cossack'] },
      { id: 'c', kind: 'way', x: 230, ground: 100, zone: 'sich', only: ['cossack'] },
      { id: 't', kind: 'gate', x: 20, ground: 150, zone: 'sich' },
    ] as const;
    const graph: PathGraph = {
      nodes,
      edges: [
        ['k', 'y'],
        ['y', 'm'],
        ['m', 'f'],
        ['f', 'g'],
        ['m', 'c'],
        ['t', 'm'],
      ],
    };
    const route: RaidRoute = { muster: 'm', foot: 'f', gate: 'g', chests: [{ at: 'c', dx: 0, facing: 1 }], cheer: 't' };
    const kozak = (sprite: 'kozak.a' | 'kozak.b'): AgentSpawn => ({
      routine: 'cossack',
      role: 'cossack',
      duty: 'free',
      sprite,
      home: 'k',
      haunts: [],
      night: { anim: 'indoors' },
      speed: 22,
      phase: 0,
    });
    const tiers = Object.fromEntries(
      [...FARM_BUILDING_IDS, ...SICH_BUILDING_IDS].map((id) => [id, id === 'walls' ? 0 : 1]),
    ) as VisualTiers;
    const ctx = (raids: readonly SquadScene[]): AgentContext => ({ minutes: 13 * 60, tiers, raids });
    const spawns = [kozak('kozak.a'), kozak('kozak.b'), kozak('kozak.a'), kozak('kozak.b')];
    const pool = createAgents(graph, spawns, AGENT_BUDGET, SEED, ctx([idle]), route);
    stepInPlace(pool, 1, ctx([away(true)]));
    // Two of four: both are on the line at once (the bearer at its head, the next a gap behind) and the squad sets off.
    const line = agentPoses(pool).filter((p) => p.ground === 100);
    expect(line.map((p) => p.x).sort((a, b) => a - b)).toEqual([200 - RAID_SQUAD.gapPx, 200]);
    run(pool, 20, ctx([away(true)]));
    expect(squadPhases(pool)).toEqual(['away']);
  });
});

describe('M3-14 a squad returns', () => {
  /** A squad away since the load, then back live. */
  function returning(sec: number, over: Partial<AgentContext> = {}): { pool: AgentPool; frames: AgentPose[][] } {
    const pool = make([away(false), idle], over);
    run(pool, 1, ctxOf([away(false), idle], over));
    const frames = run(pool, sec, ctxOf([back(true), idle], over));
    return { pool, frames };
  }

  it('a live return enters with the chest: the banner first, the carriers last, then the chest is set down', () => {
    const { pool, frames } = returning(30);
    const firstOf = (sprite: AgentSprite): number => frames.findIndex((f) => f.some((p) => p.sprite === sprite));
    expect(firstOf('khorunzhyi.a')).toBeGreaterThanOrEqual(0);
    expect(firstOf('nosii.a')).toBeGreaterThan(firstOf('khorunzhyi.a'));
    // The chest is set down where the carriers halt (slot 1's spot), and is not there before.
    const chestAt = firstOf(CHEST_SPRITE);
    expect(chestAt).toBeGreaterThan(firstOf('nosii.a'));
    expect(frames.slice(0, chestAt).some((f) => f.some((p) => p.sprite === 'nosii.a'))).toBe(true);
    const chest = frames[frames.length - 1]?.find((p) => p.sprite === CHEST_SPRITE);
    // Set down in front of the halted carriers (art-director M3-14: never hidden behind the file).
    expect(chest).toMatchObject({ x: chestA.x, ground: chestA.ground + RAID_SQUAD.carry.chestDy });
    // Then back to their duties: no banner, no carriers.
    const last = frames[frames.length - 1] ?? [];
    expect(last.some((p) => p.sprite === 'khorunzhyi.a' || p.sprite === 'nosii.a')).toBe(false);
    expect(squadPhases(pool)).toEqual(['home', 'home']);
  });

  it('a claim during the parade (in or halt) leaves no chest on the maidan', () => {
    for (const at of ['in', 'halt'] as const) {
      const pool = make([away(false), idle]);
      run(pool, 1, ctxOf([away(false), idle]));
      for (let i = 0; i < 300 && squadPhases(pool)[0] !== at; i++) run(pool, 0.1, ctxOf([back(true), idle]));
      expect(squadPhases(pool)[0]).toBe(at);
      const frames = run(pool, 20, ctxOf([{ state: 'idle', live: true }, idle]));
      expect(
        frames[frames.length - 1]?.some((p) => p.sprite === CHEST_SPRITE),
        at,
      ).toBe(false);
      expect(squadPhases(pool)).toEqual(['home', 'home']);
    }
  });

  it('a state replaced mid-parade (not live) ends it at once: no banner, no carriers, home', () => {
    const pool = make([away(false), idle]);
    run(pool, 1, ctxOf([away(false), idle]));
    run(pool, 3, ctxOf([back(true), idle]));
    expect(squadPhases(pool)[0]).toBe('in');
    const frames = run(pool, 1, ctxOf([idle, idle]));
    expect(squadPhases(pool)).toEqual(['home', 'home']);
    expect(frames.flat().some((p) => p.sprite === 'nosii.a' || p.sprite === 'khorunzhyi.a')).toBe(false);
  });

  it('a live return while the squad is still leaving: no parade, the chest stands, nobody jumps', () => {
    const pool = make([idle, idle]);
    // Into the march: some of the file still on the trail.
    for (let i = 0; i < 400 && squadPhases(pool)[0] !== 'out'; i++) run(pool, 0.1, ctxOf([away(true), idle]));
    run(pool, 1, ctxOf([away(true), idle]));
    expect(squadPhases(pool)[0]).toBe('out');
    const before = agentPoses(pool);
    const after = run(pool, 0.1, ctxOf([back(true), idle]))[0] ?? [];
    expect(squadPhases(pool)[0]).toBe('home');
    expect(after.some((p) => p.sprite === CHEST_SPRITE)).toBe(true);
    expect(after.some((p) => p.sprite === 'nosii.a')).toBe(false);
    // Whoever was in sight walks on from where he stood (a step, not a jump).
    for (const p of before) {
      const q = after.find((x) => x.id === p.id);
      if (!q || p.sprite === CHEST_SPRITE) continue;
      expect(Math.abs(q.x - p.x) + Math.abs(q.ground - p.ground), String(p.id)).toBeLessThanOrEqual(4);
    }
  });

  it('a return before the load has no parade: the chest is on the maidan from the first frame (Q14)', () => {
    const pool = make([back(false), idle]);
    const first = agentPoses(pool);
    expect(first.filter((p) => p.sprite === CHEST_SPRITE)).toHaveLength(1);
    const frames = run(pool, 20, ctxOf([back(false), idle]));
    expect(frames.flat().some((p) => p.sprite === 'nosii.a' || p.sprite === 'khorunzhyi.a')).toBe(false);
  });

  it('a return during an absence (not live) has no parade either: the squad is home, the chest stands', () => {
    const pool = make([away(false), idle]);
    const before = agentCounts(pool).cossack;
    const frames = run(pool, 20, ctxOf([back(false), idle]));
    expect(frames.flat().some((p) => p.sprite === 'nosii.a' || p.sprite === 'khorunzhyi.a')).toBe(false);
    expect(frames[0]?.some((p) => p.sprite === CHEST_SPRITE)).toBe(true);
    expect(agentCounts(pool).cossack).toBeGreaterThan(before);
  });

  it('the chest stands until the raid is claimed (back → idle), at night too', () => {
    for (const minutes of [13 * 60, 23 * 60]) {
      const pool = make([back(false), back(false)], { minutes });
      const kept = run(pool, 10, ctxOf([back(false), back(false)], { minutes }));
      expect(kept.every((f) => f.filter((p) => p.sprite === CHEST_SPRITE).length === 2)).toBe(true);
      const claimed = run(pool, 1, ctxOf([idle, back(false)], { minutes }));
      expect(claimed.every((f) => f.filter((p) => p.sprite === CHEST_SPRITE).length === 1)).toBe(true);
    }
  });

  it('villagers come to the Sich threshold and cheer, never inside; under «менше руху» they stand', () => {
    const { frames } = returning(30);
    // Village bodies only (the ranks cheer in their drill).
    const villagerCheer = (f: AgentPose[][]): AgentPose[] =>
      f.flat().filter((p) => p.anim === 'cheer' && p.sprite.startsWith('selian'));
    const cheer = villagerCheer(frames);
    expect(cheer.length).toBeGreaterThan(0);
    for (const p of cheer) expect(Math.abs(p.x - sichGate.x)).toBeLessThanOrEqual(16);
    const still = returning(30, { lessMotion: true });
    expect(villagerCheer(still.frames)).toEqual([]);
    expect(still.frames.flat().some((p) => p.sprite.startsWith('selian') && Math.abs(p.x - sichGate.x) <= 16)).toBe(
      true,
    );
  });
});

describe('M3-14 budgets and determinism', () => {
  it('a whole leave and return never shows more than the 16 Cossacks of the budget', () => {
    const pool = make([idle, idle]);
    const frames = [
      ...run(pool, 40, ctxOf([away(true), idle])),
      ...run(pool, 10, ctxOf([away(true), away(true)])),
      ...run(pool, 40, ctxOf([back(true), away(true)])),
      ...run(pool, 40, ctxOf([back(true), back(true)])),
    ];
    for (const f of frames) expect(cossacksShown(f)).toBeLessThanOrEqual(AGENT_BUDGET.cossack);
    expect(agentCounts(pool).cossack).toBeLessThanOrEqual(AGENT_BUDGET.cossack);
  });

  it('poses are a function of the seed and the context history', () => {
    const once = (): AgentPose[][] => {
      const pool = make([idle, idle]);
      return [...run(pool, 20, ctxOf([away(true), idle])), ...run(pool, 20, ctxOf([back(true), idle]))];
    };
    expect(once()).toEqual(once());
  });

  it('villagers never enter the Sich: every raid node is closed to them, the cheer spot is the threshold', () => {
    for (const id of [ROUTE.muster, ROUTE.foot, ROUTE.gate, ...ROUTE.chests.map((c) => c.at)])
      expect(findPath(G, 'farm.khata', id, 'villager'), id).toBeNull();
    expect(findPath(G, 'farm.khata', ROUTE.cheer, 'villager')).not.toBeNull();
    expect(findPath(G, 'sich.kurin', ROUTE.gate, 'cossack')).not.toBeNull();
  });
});

describe('M3-14 the driver', () => {
  it('a frozen frame that steps no tick still applies a raid change: the claimed chest goes', () => {
    const driver = createAgentDriver((c) => createAgents(G, W.agents, AGENT_BUDGET, SEED, c, ROUTE), Infinity);
    driver.advance(6, ctxOf([back(false), idle]));
    expect(driver.poses().some((p) => p.sprite === CHEST_SPRITE)).toBe(true);
    driver.advance(6, ctxOf([idle, idle]));
    expect(driver.poses().some((p) => p.sprite === CHEST_SPRITE)).toBe(false);
  });
});
