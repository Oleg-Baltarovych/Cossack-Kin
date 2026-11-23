// The villager FSM (plan M2-18): idle → walk to work → work 10–30 s → walk to a chat spot → talk 3–6 s → idle; at night
// to the night spot; work only at a building that stands; deterministic per seed; a cosmetic «work done» event.
import { describe, expect, it } from 'vitest';
import {
  AGENT_BUDGET,
  BUILDERS,
  VILLAGER_DAY,
  type AgentSpawn,
  type NodeBuilding,
  type PathGraph,
  type VillagerSpawn,
} from '../../../src/content/agents.ts';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import type { VisualTiers } from '../../../src/core/selectors.ts';
import { findPath } from '../../../src/render/agents/graph.ts';
import { createAgentDriver, stepCap } from '../../../src/render/agents/driver.ts';
import {
  agentCounts,
  agentPoses,
  createAgents,
  crewState,
  stepAgents,
  stepInPlace,
  TICK_HZ,
  workDone,
  workingCount,
  type AgentContext,
  type AgentPool,
  type AgentPose,
} from '../../../src/render/agents/sim.ts';

/**
 * Home door h, a road r, two work spots (f: the field, g: the apiary), a chat spot c, and the potter's door s (the
 * night spot) behind the field spot.
 */
const V: PathGraph = {
  nodes: [
    { id: 'h', kind: 'door', x: 100, ground: 100, zone: 'farm' },
    { id: 'r', kind: 'way', x: 140, ground: 100, zone: 'farm' },
    { id: 'f', kind: 'work', x: 180, ground: 100, zone: 'farm', building: 'field', work: 'work-field' },
    { id: 'g', kind: 'work', x: 140, ground: 60, zone: 'farm', building: 'apiary', work: 'work-apiary' },
    { id: 'c', kind: 'way', x: 140, ground: 140, zone: 'farm' },
    { id: 's', kind: 'door', x: 220, ground: 100, zone: 'farm', building: 'potter' },
  ],
  edges: [
    ['h', 'r'],
    ['r', 'f'],
    ['r', 'g'],
    ['r', 'c'],
    ['f', 's'],
  ],
};

const villager: VillagerSpawn = {
  routine: 'villager',
  role: 'villager',
  sprite: 'selianyn.a',
  home: 'h',
  work: ['f', 'g'],
  chat: ['c'],
  night: { at: 's', anim: 'sit', dx: -4, facing: 1 },
  speed: 20,
  phase: 0,
};

function tiers(standing: Partial<Record<NodeBuilding, number>>): VisualTiers {
  const out: Record<string, number> = {};
  for (const id of [...FARM_BUILDING_IDS, ...SICH_BUILDING_IDS]) out[id] = standing[id] ?? 0;
  // Every farm and Sich id was written above.
  return out as VisualTiers;
}

const ALL = tiers({ field: 1, apiary: 1, potter: 1 });
const day = (t: VisualTiers | null = ALL, minutes = 12 * 60): AgentContext => ({ minutes, tiers: t });
const night = (t: VisualTiers | null = ALL): AgentContext => ({ minutes: 23 * 60, tiers: t });
const nodeAt = (id: string) => V.nodes.find((n) => n.id === id);
const s = (sec: number): number => Math.round(sec * TICK_HZ);
const pose = (pool: AgentPool, i = 0): AgentPose | undefined => agentPoses(pool)[i];
/** The pose's animation when it stands at a shared spot by node x `x` (within the spot spacing), else `far`. */
const near = (p: AgentPose | undefined, x: number): string =>
  p && Math.abs(p.x - x) <= 2 * VILLAGER_DAY.spacing ? p.anim : `far (${String(p?.x)})`;

/** Steps tick by tick for `sec` s, returning the runs of animation: [anim, seconds]. */
function runs(pool: AgentPool, sec: number, ctx: AgentContext): [string, number][] {
  const out: [string, number][] = [];
  for (let t = 0; t < s(sec); t++) {
    stepInPlace(pool, 1, ctx);
    const anim = pose(pool)?.anim ?? '';
    const last = out.at(-1);
    if (last?.[0] === anim) last[1] += 1 / TICK_HZ;
    else out.push([anim, 1 / TICK_HZ]);
  }
  return out;
}

describe('villager FSM (plan M2-18)', () => {
  it('by day starts at a work spot whose building stands, playing its work animation', () => {
    const apiaryOnly = createAgents(V, [villager], AGENT_BUDGET, 1, day(tiers({ apiary: 1 })));
    expect(pose(apiaryOnly)).toMatchObject({ x: 140, ground: 60, anim: 'work-apiary' });
    const fieldOnly = createAgents(V, [villager], AGENT_BUDGET, 1, day(tiers({ field: 1 })));
    expect(pose(fieldOnly)).toMatchObject({ x: 180, ground: 100, anim: 'work-field' });
  });

  it('never works on an empty plot: with nothing built it talks at its chat spot instead', () => {
    const pool = createAgents(V, [villager], AGENT_BUDGET, 1, day(tiers({})));
    for (const [anim] of runs(pool, 120, day(tiers({})))) expect(anim.startsWith('work')).toBe(false);
    expect(runs(pool, 30, day(tiers({}))).some(([a]) => a === 'talk')).toBe(true);
  });

  it('works 10–30 s, walks to a chat spot, talks 3–6 s, idles, then walks back to work', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const pool = createAgents(V, [villager], AGENT_BUDGET, seed, day());
      // The first run is a part of a work spell; from the second on every step has its full length.
      const seq = runs(pool, 400, day()).slice(1, -1);
      const names = seq.map(([a]) => (a.startsWith('work') ? 'work' : a));
      const at = names.indexOf('walk');
      expect(names.slice(at, at + 5), `seed ${String(seed)}`).toEqual(['walk', 'talk', 'idle', 'walk', 'work']);
      for (const [anim, sec] of seq) {
        const [lo, hi] = anim.startsWith('work')
          ? VILLAGER_DAY.workS
          : anim === 'talk'
            ? VILLAGER_DAY.chatS
            : anim === 'idle'
              ? VILLAGER_DAY.idleS
              : [0, Infinity];
        expect(sec, `${anim} seed ${String(seed)}`).toBeGreaterThanOrEqual(lo - 0.05);
        expect(sec, `${anim} seed ${String(seed)}`).toBeLessThanOrEqual(hi + 0.05);
      }
    }
  });

  it('at night it sits outside its night spot, facing as authored; indoors (no pose) when that building does not stand', () => {
    const out = pose(createAgents(V, [villager], AGENT_BUDGET, 1, night()));
    expect(out).toMatchObject({ x: 216, anim: 'sit', facing: 1 });
    expect(agentPoses(createAgents(V, [villager], AGENT_BUDGET, 1, night(tiers({ field: 1 }))))).toEqual([]);
  });

  it('leaves work for the night spot when the evening comes, and goes back to work in the morning', () => {
    const pool = createAgents(V, [villager], AGENT_BUDGET, 1, day(ALL, VILLAGER_DAY.until - 1));
    expect(pose(pool)?.anim.startsWith('work')).toBe(true);
    const evening = { minutes: VILLAGER_DAY.until, tiers: ALL };
    const seq = runs(pool, 30, evening).map(([a]) => a);
    expect(seq).toContain('walk');
    expect(seq.at(-1)).toBe('sit');
    expect(near(pose(pool), 220)).toBe('sit');
    const morning = { minutes: VILLAGER_DAY.from, tiers: ALL };
    const later = runs(pool, 30, morning).map(([a]) => a);
    expect(later).toContain('walk');
    expect(later.at(-1)?.startsWith('work')).toBe(true);
  });

  it('stops working and walks off when its building no longer stands', () => {
    const pool = createAgents(V, [villager], AGENT_BUDGET, 1, day(tiers({ field: 1 })));
    expect(pose(pool)?.anim).toBe('work-field');
    stepInPlace(pool, 1, day(tiers({})));
    expect(pose(pool)?.anim).toBe('walk');
  });

  it('never walks through a node whose building does not stand', () => {
    const open = (n: { id: string }) => n.id !== 'f';
    expect(findPath(V, 'h', 's', 'villager', open)).toBeNull();
    expect(findPath(V, 'h', 's', 'villager')).toEqual(['h', 'r', 'f', 's']);
  });

  it('a wanderer skips goals whose building does not stand', () => {
    const girl: AgentSpawn = {
      routine: 'wander',
      role: 'villager',
      sprite: 'divchyna.a',
      home: 'h',
      goals: ['s', 'c'],
      order: 'cycle',
      speed: 20,
      rest: 1,
      phase: 0,
    };
    const pool = createAgents(V, [girl], AGENT_BUDGET, 1, day(tiers({})));
    for (let t = 0; t < s(60); t++) {
      stepInPlace(pool, 1, day(tiers({})));
      expect(pose(pool)?.x ?? 0).toBeLessThanOrEqual(180);
    }
  });

  it('people sharing a spot stand apart and face each other', () => {
    const empty = day(tiers({}));
    const pool = createAgents(V, [villager, { ...villager, sprite: 'selianka.a', phase: 0 }], AGENT_BUDGET, 1, empty);
    let both: AgentPose[] = [];
    for (let t = 0; t < s(60) && both.length < 2; t++) {
      stepInPlace(pool, 1, empty);
      const ps = agentPoses(pool);
      both = ps.every((p) => p.anim === 'talk') ? ps : [];
    }
    const [a, b] = both;
    expect(a && b).toBeTruthy();
    if (!a || !b) return;
    expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(VILLAGER_DAY.spacing);
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    expect([left.facing, right.facing]).toEqual([1, -1]);
  });

  it('is deterministic per seed however the ticks are split, and seeds differ', () => {
    const a = createAgents(V, [villager], AGENT_BUDGET, 7, day());
    const b = createAgents(V, [villager], AGENT_BUDGET, 7, day());
    stepInPlace(a, s(200), day());
    for (let i = 0; i < s(200); i += 7) stepInPlace(b, Math.min(7, s(200) - i), day());
    expect(agentPoses(a)).toEqual(agentPoses(b));
    const lengths = (seed: number) =>
      runs(createAgents(V, [villager], AGENT_BUDGET, seed, day()), 200, day()).map(([x, n]) => `${x}:${n.toFixed(2)}`);
    expect(lengths(1)).not.toEqual(lengths(2));
  });

  it('reports each finished work spell once, at its work spot, for the cosmetic «+»', () => {
    const pool = createAgents(V, [villager], AGENT_BUDGET, 3, day());
    const done: { x: number; ground: number; building: string }[] = [];
    let spells = 0;
    let working = true;
    for (let t = 0; t < s(300); t++) {
      stepInPlace(pool, 1, day());
      for (const e of workDone(pool)) done.push({ ...e });
      const now = pose(pool)?.anim.startsWith('work') ?? false;
      if (working && !now) spells += 1;
      working = now;
    }
    expect(spells).toBeGreaterThan(2);
    expect(done).toHaveLength(spells);
    for (const e of done) {
      const spot = V.nodes.find((n) => n.building === e.building && n.work);
      expect(spot).toBeDefined();
      expect(Math.abs(e.x - (spot?.x ?? 0))).toBeLessThanOrEqual(VILLAGER_DAY.spacing);
      expect(e.ground).toBe(spot?.ground);
    }
  });

  it('a pure step leaves the pool and its events untouched', () => {
    const pool = createAgents(V, [villager], AGENT_BUDGET, 3, day());
    const before = agentPoses(pool);
    const next = stepAgents(pool, s(37.3), day());
    expect(agentPoses(pool)).toEqual(before);
    expect(agentPoses(next)).not.toEqual(before);
    expect(workDone(pool)).toEqual([]);
  });

  it('the driver makes the pool on its first frame, with that frame’s time of day', () => {
    const driver = createAgentDriver((ctx) => createAgents(V, [villager], AGENT_BUDGET, 1, ctx), stepCap(true));
    expect(driver.poses()).toEqual([]);
    driver.advance(0, night());
    expect(near(driver.poses()[0], 220)).toBe('sit');
    expect(nodeAt('s')?.building).toBe('potter');
  });
});

describe('agents over a changing context (M2-18 review)', () => {
  const girl: AgentSpawn = {
    routine: 'wander',
    role: 'villager',
    sprite: 'divchyna.a',
    home: 'h',
    goals: ['s'],
    order: 'cycle',
    speed: 20,
    rest: 1,
    phase: 0,
    indoors: 'h',
  };

  it('poses follow the history of contexts, not the last one: a tier change between two steps changes the result', () => {
    const open = day(tiers({ field: 1, potter: 1 }));
    const closed = day(tiers({ potter: 1 }));
    const start = createAgents(V, [girl], AGENT_BUDGET, 1, open);
    const once = stepAgents(start, s(4), open);
    const split = stepAgents(stepAgents(start, s(2), open), s(2), open);
    const changed = stepAgents(stepAgents(start, s(2), open), s(2), closed);
    expect(agentPoses(split)).toEqual(agentPoses(once));
    expect(agentPoses(changed)).not.toEqual(agentPoses(once));
  });

  it('never steps onto a node that closed while it was walking toward it', () => {
    const open = day(tiers({ field: 1, potter: 1 }));
    const closed = day(tiers({ potter: 1 }));
    const pool = createAgents(V, [girl], AGENT_BUDGET, 1, open);
    stepInPlace(pool, s(2), open);
    const before = pose(pool)?.x ?? 0;
    expect(before).toBeGreaterThan(100);
    expect(before).toBeLessThan(180);
    for (let t = 0; t < s(30); t++) {
      stepInPlace(pool, 1, closed);
      expect(pose(pool)?.x ?? 0).toBeLessThan(180);
    }
  });

  it('a wanderer with a door goes in after hours (no pose) and comes out by day', () => {
    const pool = createAgents(V, [girl], AGENT_BUDGET, 1, day());
    expect(agentPoses(pool)).toHaveLength(1);
    const evening = { minutes: VILLAGER_DAY.until, tiers: ALL };
    stepInPlace(pool, s(30), evening);
    expect(agentPoses(pool)).toEqual([]);
    expect(agentPoses(createAgents(V, [girl], AGENT_BUDGET, 1, night()))).toEqual([]);
    stepInPlace(pool, 2, day());
    expect(agentPoses(pool)).toHaveLength(1);
  });

  it('counts the villagers at work from the pool', () => {
    expect(workingCount(createAgents(V, [villager], AGENT_BUDGET, 1, day()))).toBe(1);
    expect(workingCount(createAgents(V, [villager], AGENT_BUDGET, 1, night()))).toBe(0);
  });
});

describe('the household grows and shrinks (M2-29 D, SPEC §6.6)', () => {
  const wanderer: AgentSpawn = {
    routine: 'wander',
    role: 'villager',
    sprite: 'divchyna.a',
    home: 'r',
    goals: ['c', 'h'],
    order: 'cycle',
    speed: 20,
    rest: 1,
    indoors: 'h',
    phase: 0,
  };
  const three: readonly AgentSpawn[] = [villager, { ...villager, sprite: 'selianka.a' }, wanderer];
  const at = (n: number | undefined, minutes = 12 * 60): AgentContext => ({ minutes, tiers: ALL, villagers: n });
  const ids = (pool: AgentPool): number[] => agentPoses(pool).map((p) => p.id);

  it('shows the first N villager spawns in authored order; the rest are not on the scene', () => {
    const pool = createAgents(V, three, AGENT_BUDGET, 1, at(2));
    expect(ids(pool)).toEqual([0, 1]);
    expect(createAgents(V, three, AGENT_BUDGET, 1, at(undefined)).agents).toHaveLength(3);
    expect(ids(createAgents(V, three, AGENT_BUDGET, 1, at(undefined)))).toEqual([0, 1, 2]);
  });

  it('counts only the villagers on the scene', () => {
    const pool = createAgents(V, three, AGENT_BUDGET, 1, at(1));
    expect(agentCounts(pool).villager).toBe(1);
    expect(agentCounts(stepAgents(pool, s(1), at(3))).villager).toBe(3);
  });

  it('a newcomer walks out of its door, never popping up elsewhere', () => {
    const pool = createAgents(V, three, AGENT_BUDGET, 1, at(1));
    const next = stepAgents(pool, 1, at(3));
    const girl = agentPoses(next).find((p) => p.id === 2);
    const door = nodeAt('h');
    expect(girl).toBeDefined();
    // One tick out of the door (indoors door `h` for the wanderer).
    expect(Math.abs((girl?.x ?? 0) - (door?.x ?? 0))).toBeLessThanOrEqual(1);
    expect(girl?.ground).toBe(door?.ground);
  });

  it('one the household no longer has walks in at its door, then is gone', () => {
    const pool = createAgents(V, three, AGENT_BUDGET, 1, at(3));
    const before = agentPoses(pool).find((p) => p.id === 1);
    const soon = stepAgents(pool, 1, at(1));
    // Still there, walking to its door.
    const going = agentPoses(soon).find((p) => p.id === 1);
    expect(going?.anim).toBe('walk');
    expect(before).toBeDefined();
    // Ten seconds on, it has gone in or is still on its way: never seen doing anything else.
    const mid = stepAgents(pool, s(10), at(1));
    const walking = agentPoses(mid).find((p) => p.id === 1);
    if (walking) expect(walking.anim).toBe('walk');
    const later = stepAgents(pool, s(60), at(1));
    expect(ids(later)).toEqual([0]);
  });

  it('turns back on the way in when the household has it again', () => {
    const pool = createAgents(V, three, AGENT_BUDGET, 1, at(3));
    const leaving = stepAgents(pool, 2, at(1));
    const back = stepAgents(leaving, s(60), at(3));
    expect(ids(back)).toEqual([0, 1, 2]);
  });

  it('is deterministic: the same seed and history give the same poses', () => {
    const run = () => {
      let p = createAgents(V, three, AGENT_BUDGET, 5, at(1));
      p = stepAgents(p, s(10), at(3));
      p = stepAgents(p, s(10), at(2));
      return agentPoses(p);
    };
    expect(run()).toEqual(run());
  });
});

describe('builders at a scaffold (M2-29 D, SPEC §6.5; owner 2026-11-23: builders always come)', () => {
  const men: readonly AgentSpawn[] = [
    villager,
    { ...villager, sprite: 'selianka.a' },
    { ...villager, sprite: 'selianyn.b', phase: 3 },
    { ...villager, sprite: 'selianyn.c', phase: 5 },
  ];
  const site = { building: 'potter', x: 150, ground: 100, size: 's' } as const;
  const at = (builds: AgentContext['builds'], minutes = 12 * 60): AgentContext => ({ minutes, tiers: ALL, builds });
  const building = (pool: AgentPool) => agentPoses(pool).filter((p) => p.anim === 'work-build');

  it('the nearest men walk over and hammer (work-build) at the slots, facing in', () => {
    let pool = createAgents(V, men, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, 1, at([site]));
    expect(crewState(pool, 'potter')).toBe('coming');
    pool = stepAgents(pool, s(30), at([site]));
    expect(crewState(pool, 'potter')).toBe('ready');
    const builders = building(pool);
    expect(builders.map((b) => b.x - site.x).sort((a, b) => a - b)).toEqual([...BUILDERS.slots.s]);
    for (const b of builders) {
      expect(b.sprite.startsWith('selianyn')).toBe(true);
      expect(b.facing).toBe(b.x < site.x ? 1 : -1);
    }
  });

  it('back to the day when the scaffold comes down', () => {
    let pool = createAgents(V, men, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, s(30), at([site]));
    pool = stepAgents(pool, s(2), at([]));
    expect(crewState(pool, 'potter')).toBe('none');
    expect(building(pool)).toHaveLength(0);
  });

  it('the scaffold is ready as soon as the first builder hammers', () => {
    let pool = createAgents(V, men, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, 1, at([site]));
    for (let k = 0; k < s(30) && crewState(pool, 'potter') === 'coming'; k++) pool = stepAgents(pool, 1, at([site]));
    expect(crewState(pool, 'potter')).toBe('ready');
    // The other one is still on his way (they set out from different places).
    expect(building(pool)).toHaveLength(1);
  });

  it('a large scaffold: one man per slot, centred on it (art-director)', () => {
    const crew: readonly AgentSpawn[] = [...men, { ...villager, sprite: 'selianyn.d', phase: 7 }];
    let pool = createAgents(V, crew, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, s(30), at([{ ...site, size: 'l' }]));
    const xs = building(pool)
      .map((p) => p.x - site.x)
      .sort((a, b) => a - b);
    expect(xs).toEqual([...BUILDERS.slots.l]);
  });

  it('however far or slow, the men are sent and come (no route limit)', () => {
    const slow = men.map((m) => ({ ...m, speed: 1 }));
    let pool = createAgents(V, slow, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, 1, at([site]));
    expect(crewState(pool, 'potter')).toBe('coming');
    pool = stepAgents(pool, s(120), at([site]));
    expect(crewState(pool, 'potter')).toBe('ready');
  });

  it('the nearest by route, not by x: a man just across the side path is passed over', () => {
    // Standing still at their homes (no work, no chat). The site by the field spot f (x 180): P at the potter's door s
    // is 50 px away by route; Q at the apiary spot g is the nearest by x (30) but 90 by route (down to the road first);
    // R at the door h is 90 by route too. Two slots: P and R (the lower id of the tie), never Q.
    const still = (sprite: VillagerSpawn['sprite'], home: string): VillagerSpawn => ({
      ...villager,
      sprite,
      home,
      work: [],
      chat: [],
    });
    const crew = [still('selianyn.a', 'h'), still('selianyn.b', 's'), still('selianyn.c', 'g')];
    const there = { ...site, x: 170 };
    let pool = createAgents(V, crew, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, s(60), at([there]));
    expect(
      building(pool)
        .map((p) => p.id)
        .sort(),
    ).toEqual([0, 1]);
  });

  it('at night the men come out of their doors too', () => {
    let pool = createAgents(V, men, AGENT_BUDGET, 1, at(undefined, 23 * 60));
    pool = stepAgents(pool, s(60), at(undefined, 23 * 60));
    pool = stepAgents(pool, s(60), at([site], 23 * 60));
    expect(crewState(pool, 'potter')).toBe('ready');
    expect(building(pool)).toHaveLength(BUILDERS.slots.s.length);
  });

  it('no man in the household (only women): nobody comes, it starts at once', () => {
    const women = men.filter((m) => m.sprite.startsWith('selianka'));
    let pool = createAgents(V, women, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, 1, at([site]));
    expect(crewState(pool, 'potter')).toBe('none');
  });

  it('a site no villager may reach (the Sich) gets nobody: it starts at once', () => {
    let pool = createAgents(V, men, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, 1, at([{ ...site, x: 900 }]));
    expect(crewState(pool, 'potter')).toBe('none');
  });

  it('a chat spot among the builders is closed while they are there (art-director)', () => {
    // The site right at chat spot c: a woman whose only chat spot is c stays off it while the crew hammers.
    const woman: VillagerSpawn = { ...villager, sprite: 'selianka.a', work: [] };
    const crew: readonly AgentSpawn[] = [
      woman,
      { ...villager, sprite: 'selianyn.b' },
      { ...villager, sprite: 'selianyn.c' },
    ];
    const there = { ...site, x: 140, ground: 140 };
    let pool = createAgents(V, crew, AGENT_BUDGET, 1, at(undefined));
    pool = stepAgents(pool, s(20), at([there]));
    for (let k = 0; k < 40; k++) {
      pool = stepAgents(pool, s(1), at([there]));
      expect(agentPoses(pool).find((p) => p.id === 0)?.anim, `${String(k)} s`).not.toBe('talk');
    }
    // Once the scaffold is down, c is open again.
    let talked = false;
    for (let k = 0; k < 60 && !talked; k++) {
      pool = stepAgents(pool, s(1), at([]));
      talked = agentPoses(pool).find((p) => p.id === 0)?.anim === 'talk';
    }
    expect(talked).toBe(true);
  });

  it('nobody works a building while its scaffold stands; the work starts once it is down', () => {
    const reaper: VillagerSpawn = { ...villager, sprite: 'selianka.a', work: ['f'] };
    const field = { ...site, building: 'field', x: 180 } as const;
    // Before the purchase the field is not there (nobody at work on it); then it is bought and its scaffold goes up.
    let pool = createAgents(V, [reaper], AGENT_BUDGET, 1, { ...at(undefined), tiers: tiers({ apiary: 1, potter: 1 }) });
    for (let k = 0; k < 60; k++) {
      pool = stepAgents(pool, s(1), at([field]));
      expect(agentPoses(pool)[0]?.anim, `${String(k)} s`).not.toBe('work-field');
    }
    let worked = false;
    for (let k = 0; k < 60 && !worked; k++) {
      pool = stepAgents(pool, s(1), at([]));
      worked = agentPoses(pool)[0]?.anim === 'work-field';
    }
    expect(worked).toBe(true);
  });

  it('a frame shorter than a tick right after the scaffold goes up already reads `coming` (driver race)', () => {
    const driver = createAgentDriver((ctx) => createAgents(V, men, AGENT_BUDGET, 1, ctx), stepCap(false));
    driver.advance(1, at(undefined));
    // Less than one tick later: no step is due, yet the new scaffold must not read `none` (it would start at once).
    driver.advance(1 + 0.4 / TICK_HZ, at([site]));
    expect(driver.crew('potter')).toBe('coming');
  });
});
