// Visitors on the scene (plan M2-21): placed from the core timetable's visit alone — walking in from beyond the west
// edge, staying at the first spot that stands (the кобзар plays by the tavern), walking back out; away between visits
// and at night; ≤ `AGENT_BUDGET.visitor` poses (the чумак and his віз); never into the Sich. The render clock reads the
// game's seed and time and never writes the state.
import { describe, expect, it } from 'vitest';
import {
  AGENT_BUDGET,
  isVisitorSprite,
  type AgentSpawn,
  type NodeBuilding,
  type VisitorSpawn,
} from '../../../src/content/agents.ts';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';
import { VISITOR_IDS, VISITOR_SCHEDULE, type VisitorId } from '../../../src/content/visitors.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { visitOfSlot } from '../../../src/core/systems/visitors.ts';
import type { VisualTiers } from '../../../src/core/selectors.ts';
import { findPath, nodeOf } from '../../../src/render/agents/graph.ts';
import {
  agentCounts,
  agentPoses,
  createAgents,
  driverId,
  nodeOpen,
  stepAgents,
  type AgentContext,
  type AgentPool,
  type AgentPose,
} from '../../../src/render/agents/sim.ts';
import { createVisitClock } from '../../../src/render/agents/visits.ts';

const { paths: GRAPH, agents: SPAWNS } = KHORTYTSIA_WORLD;
const VISITORS = SPAWNS.filter((s): s is VisitorSpawn => s.routine === 'visitor');
const spawnOf = (id: VisitorId): VisitorSpawn => {
  const s = VISITORS.find((v) => v.visitor === id);
  if (!s) throw new Error(`no ${id}`);
  return s;
};

function tiers(standing: Partial<Record<NodeBuilding, number>>): VisualTiers {
  const out: Record<string, number> = {};
  for (const id of [...FARM_BUILDING_IDS, ...SICH_BUILDING_IDS]) out[id] = standing[id] ?? 0;
  // Every farm and Sich id was written above.
  return out as VisualTiers;
}

const visitCtx = (visitor: VisitorId | null, elapsedS: number, t: VisualTiers | null = null, minutes = 13 * 60) => {
  const ctx: AgentContext = {
    minutes,
    tiers: t,
    visit:
      visitor === null ? null : { visitor, slot: 7, elapsedS, durationS: VISITOR_SCHEDULE.visitors[visitor].durationS },
  };
  return ctx;
};

const visitorPoses = (pool: AgentPool): AgentPose[] => agentPoses(pool).filter((p) => isVisitorSprite(p.sprite));
const posesOf = (spawns: readonly AgentSpawn[], ctx: AgentContext): AgentPose[] =>
  agentPoses(createAgents(GRAPH, spawns, AGENT_BUDGET, 1, ctx));

/** Seconds the visitor needs from the entry to its spot, along its route (the first spot open in `t`). */
function walkS(spawn: VisitorSpawn, t: VisualTiers | null): number {
  for (const spot of spawn.spots) {
    const path = findPath(GRAPH, spawn.entry.at, spot.at, 'visitor', (n) => nodeOpen({ minutes: 0, tiers: t }, n));
    if (!path) continue;
    const entry = nodeOf(GRAPH, spawn.entry.at);
    const pts = [
      { x: entry.x + spawn.entry.dx, y: entry.ground },
      ...path.map((id) => ({ x: nodeOf(GRAPH, id).x, y: nodeOf(GRAPH, id).ground })),
    ];
    const end = pts[pts.length - 1] ?? { x: 0, y: 0 };
    pts.push({ x: end.x + spot.dx, y: end.y });
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1] ?? end, pts[i] ?? end];
      d += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return d / spawn.speed;
  }
  throw new Error(`${spawn.visitor}: no spot reachable`);
}

describe('visitors: content (M2-21)', () => {
  it('every visitor of the timetable has one spawn, with its own sprite', () => {
    expect(VISITORS.map((v) => v.visitor).sort()).toEqual([...VISITOR_IDS].sort());
    expect(new Set(VISITORS.map((v) => v.sprite)).size).toBe(VISITOR_IDS.length);
  });

  it('the last spot of each visitor has no building (always open), and only the кобзар plays', () => {
    for (const v of VISITORS) {
      const last = v.spots[v.spots.length - 1];
      if (!last) throw new Error(`${v.visitor}: no spots`);
      expect(nodeOf(GRAPH, last.at).building, v.visitor).toBeUndefined();
      expect(v.stay === 'play', v.visitor).toBe(v.visitor === 'kobzar');
    }
    expect(VISITORS.filter((v) => v.cart).map((v) => v.visitor)).toEqual(['chumak']);
  });

  it('the visitor budget holds by construction: one visit at a time, at most one visitor brings a second pose', () => {
    // The timetable never overlaps two visits (a visit lies inside its slot: core test), so the scene's visitor poses
    // are those of the largest single visit — the person, plus his віз for the one with a cart.
    const poses = (v: VisitorSpawn): number => (v.cart ? 2 : 1);
    const concurrency = 1;
    expect(Math.max(...VISITORS.map(poses)) * concurrency).toBeLessThanOrEqual(AGENT_BUDGET.visitor);
    expect(VISITORS.filter((v) => poses(v) === 2)).toHaveLength(1);
    for (const id of VISITOR_IDS)
      expect(VISITOR_SCHEDULE.visitors[id].durationS).toBeLessThanOrEqual(VISITOR_SCHEDULE.slotSec);
  });

  it('a visit is long enough to walk in, stay a while and walk out — at every spot', () => {
    for (const v of VISITORS)
      for (const t of [null, tiers({})]) {
        const need = 2 * walkS(v, t) + VISITOR_SCHEDULE.minStayS;
        expect(need, v.visitor).toBeLessThanOrEqual(VISITOR_SCHEDULE.visitors[v.visitor].durationS);
      }
  });
});

describe('visitors on the scene (M2-21)', () => {
  it('nobody without a visit, at night, or for another visitor; the visitor of the visit only', () => {
    expect(visitorPoses(createAgents(GRAPH, SPAWNS, AGENT_BUDGET, 1, visitCtx(null, 0)))).toEqual([]);
    expect(posesOf(SPAWNS, visitCtx('lirnyk', 120, null, 23 * 60)).filter((p) => isVisitorSprite(p.sprite))).toEqual(
      [],
    );
    const lirnyk = posesOf(SPAWNS, visitCtx('lirnyk', 120)).filter((p) => isVisitorSprite(p.sprite));
    expect(lirnyk.map((p) => p.sprite)).toEqual(['lirnyk.a']);
    const pool = createAgents(GRAPH, SPAWNS, AGENT_BUDGET, 1, visitCtx('lirnyk', 120));
    expect(agentCounts(pool).visitor).toBe(1);
  });

  it('walks in from beyond the west edge, stays at its spot, walks back out, then is gone', () => {
    const kobzar = spawnOf('kobzar');
    const dur = VISITOR_SCHEDULE.visitors.kobzar.durationS;
    const w = walkS(kobzar, null);
    const at = (e: number): AgentPose | undefined => posesOf([kobzar], visitCtx('kobzar', e))[0];
    const tavern = nodeOf(GRAPH, 'suburb.tavern');
    const start = at(0);
    expect(start?.x).toBeLessThan(0);
    expect(start).toMatchObject({ anim: 'walk', facing: 1 });
    const mid = at(w / 2);
    expect(mid?.x).toBeGreaterThan(start?.x ?? 0);
    expect(at(w + 1)).toMatchObject({ anim: 'play', x: tavern.x - 28, ground: tavern.ground, facing: 1 });
    expect(at(dur - w - 1)).toMatchObject({ anim: 'play' });
    const leaving = at(dur - w / 2);
    expect(leaving).toMatchObject({ anim: 'walk', facing: -1 });
    expect(leaving?.x).toBeCloseTo(mid?.x ?? NaN, -1);
    expect(at(dur)).toBeUndefined();
  });

  it('the кобзар plays by the well while there is no tavern', () => {
    const kobzar = spawnOf('kobzar');
    const well = nodeOf(GRAPH, 'suburb.well');
    const p = posesOf([kobzar], visitCtx('kobzar', walkS(kobzar, tiers({})) + 5, tiers({})))[0];
    expect(p).toMatchObject({ anim: 'play', x: well.x - 12, ground: well.ground });
  });

  it('the pose is a function of the visit time, whatever the stepping history', () => {
    const fresh = agentPoses(createAgents(GRAPH, SPAWNS, AGENT_BUDGET, 3, visitCtx('hanchar', 200)));
    let pool = createAgents(GRAPH, SPAWNS, AGENT_BUDGET, 3, visitCtx(null, 0));
    for (const e of [0, 40, 130, 200]) pool = stepAgents(pool, 7, visitCtx('hanchar', e));
    const pick = (ps: readonly AgentPose[]) => ps.filter((p) => p.sprite === 'hanchar.a');
    expect(pick(agentPoses(pool))).toEqual(pick(fresh));
  });

  it('the чумак comes with his віз — loaded in, empty out — and visitor poses stay within the budget', () => {
    const chumak = spawnOf('chumak');
    const dur = VISITOR_SCHEDULE.visitors.chumak.durationS;
    const w = walkS(chumak, null);
    const sprites = (e: number) => posesOf([chumak], visitCtx('chumak', e)).map((p) => p.sprite);
    expect(sprites(w / 2)).toEqual(['viz.full', 'chumak.a']);
    expect(sprites(w + 5)).toEqual(['viz.full', 'chumak.a']);
    expect(sprites(dur - w / 2)).toEqual(['viz.empty', 'chumak.a']);
    for (const id of VISITOR_IDS)
      for (let e = 0; e < VISITOR_SCHEDULE.visitors[id].durationS; e += 15) {
        const all = posesOf(SPAWNS, visitCtx(id, e));
        const mine = all.filter(
          (p) => isVisitorSprite(p.sprite) || VISITORS.some((v) => driverId(SPAWNS.indexOf(v)) === p.id),
        );
        expect(mine.length, `${id} ${String(e)}`).toBeLessThanOrEqual(AGENT_BUDGET.visitor);
      }
  });

  it('a visit taken up by day runs to its end after dusk; one first seen at night stays away', () => {
    const lirnyk = spawnOf('lirnyk');
    const dur = VISITOR_SCHEDULE.visitors.lirnyk.durationS;
    const w = walkS(lirnyk, null);
    // Seen staying at 20:58, then the hour turns: he keeps his place and then walks out.
    let pool = createAgents(GRAPH, [lirnyk], AGENT_BUDGET, 1, visitCtx('lirnyk', w + 10, null, 20 * 60 + 58));
    expect(agentPoses(pool)[0]).toMatchObject({ anim: 'idle' });
    pool = stepAgents(pool, 1, visitCtx('lirnyk', w + 60, null, 21 * 60 + 30));
    expect(agentPoses(pool)[0]).toMatchObject({ anim: 'idle' });
    pool = stepAgents(pool, 1, visitCtx('lirnyk', dur - w / 2, null, 21 * 60 + 40));
    expect(agentPoses(pool)[0]).toMatchObject({ anim: 'walk', facing: -1 });
    pool = stepAgents(pool, 1, visitCtx('lirnyk', dur, null, 21 * 60 + 45));
    expect(agentPoses(pool)).toEqual([]);
    // First seen at night: not taken up, not even when the visit goes on.
    let late = createAgents(GRAPH, [lirnyk], AGENT_BUDGET, 1, visitCtx('lirnyk', w + 10, null, 22 * 60));
    late = stepAgents(late, 1, visitCtx('lirnyk', w + 20, null, 22 * 60 + 1));
    expect(agentPoses(late)).toEqual([]);
  });

  it('never walks into the Sich', () => {
    const sichX = KHORTYTSIA_WORLD.zones.find((z) => z.id === 'sich')?.x0 ?? Infinity;
    for (const v of VISITORS)
      for (let e = 0; e < VISITOR_SCHEDULE.visitors[v.visitor].durationS; e += 5)
        for (const p of posesOf([v], visitCtx(v.visitor, e))) expect(p.x, v.visitor).toBeLessThan(sichX);
  });
});

describe('the visit clock (M2-21)', () => {
  /** A slot of seed 2 with a visit, and that visit. */
  const slot = Array.from({ length: 50 }, (_, k) => 2_000_000 + k).find((s) => visitOfSlot(2, s) !== null) ?? 0;
  const visit = visitOfSlot(2, slot);

  it('a frozen clock reads the game time + the frozen seconds (screenshots step through a visit)', () => {
    if (!visit) throw new Error('no visit');
    const feed = { seed: 2, gameMs: () => visit.start };
    const clock = createVisitClock(true);
    expect(clock.at(feed, 30)).toMatchObject({ visitor: visit.visitor, slot, elapsedS: 30 });
    expect(createVisitClock(true).at(feed, (visit.end - visit.start) / 1000)).toBeNull();
    expect(createVisitClock(true).at(null, 30)).toBeNull();
  });

  it('a live clock runs smoothly on the animation seconds and re-anchors when the game jumps', () => {
    if (!visit) throw new Error('no visit');
    let game = visit.start;
    const feed = { seed: 2, gameMs: () => game };
    const clock = createVisitClock(false);
    expect(clock.at(feed, 100)?.elapsedS).toBe(0);
    game += 100; // the game ticks at 10 Hz: its time lags the animation a little
    expect(clock.at(feed, 100.25)?.elapsedS).toBeCloseTo(0.25, 6);
    game = visit.start + 60_000; // a resumed tab: the game is a minute ahead of the animation clock
    expect(clock.at(feed, 100.5)?.elapsedS).toBe(60);
    expect(clock.at(feed, 101.5)?.elapsedS).toBeCloseTo(61, 6);
  });
});
