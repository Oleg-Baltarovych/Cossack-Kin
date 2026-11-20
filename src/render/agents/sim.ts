// The agents (plan M2-16 skeleton, M2-18 villager FSM; SPEC §6.4): people walking a land's path graph. Deterministic —
// whole fixed ticks in, a seeded RNG per agent (mulberry32), no clock or Math.random. The poses are a function of the
// seed, the context the pool was made with and the whole history of steps — how many ticks each step took and the
// context (time of day, visual tiers) it saw — not of the current time and tiers alone: a tier that changes between
// two steps changes what follows (tested). `?freeze` frames repeat because a frozen frame is one step from creation.
// Cosmetic only: render state, never GameState; the context is read, never written.
//
// Two routines (content `AgentSpawn`): `wander` walks its goals in turn or at random and rests between (Cossacks until
// M2-19, the girls, who go indoors after hours); `villager` lives a day — idle → walk to a work spot whose building
// stands → work there → walk to a chat spot → talk → idle → …, and outside the working hours (content `VILLAGER_DAY`)
// goes to its night spot: outside a door or the forge, or indoors (out of sight, no pose) when that spot does not
// stand. Nodes tied to a building are open only while it stands (visual tier ≥ 1): nobody walks through (re-checked
// node by node while walking) or works at an empty plot.
// At creation a villager is put straight where the hour finds it (at work, by its door), so a first frame — and a
// `?freeze` shot — already shows the village's day or night.
//
// The frame path steps in place (`stepInPlace`, `writePoses`: no allocation per tick but on a new step of the routine);
// `stepAgents`/`agentPoses` are the pure copies for tests and tools.
import {
  VILLAGER_ANIMS,
  VILLAGER_DAY,
  isVillagerSprite,
  type AgentRole,
  type AgentSpawn,
  type AgentSprite,
  type BasicAnim,
  type NodeBuilding,
  type PathGraph,
  type PathNode,
  type PersonAnim,
  type VillagerSpawn,
  type VillagerSprite,
  type WorkAnim,
} from '../../content/agents.ts';
import type { VisualTiers } from '../../core/selectors.ts';
import { checkGraph, findPath, mayEnter, nodeOf } from './graph.ts';

/** Simulation steps per second (fixed, so stepping does not depend on the frame rate). */
export const TICK_HZ = 60;
/** SPEC §6.4 / ART-06: walk 6 frames @10 fps, idle 4 @6 fps. */
export const WALK_FRAMES = 6;
export const WALK_FPS = 10;
export const IDLE_FRAMES = 4;
export const IDLE_FPS = 6;
/** Finished work spells kept per step (a frozen jump finishes many; the cosmetic «+» needs only the last few). */
export const MAX_WORK_DONE = 16;

/** Frame count and rate of a person animation (walk/idle above; the villager set from content, M2-17). */
export function personAnim(anim: PersonAnim): { readonly frames: number; readonly fps: number } {
  if (anim === 'walk') return { frames: WALK_FRAMES, fps: WALK_FPS };
  if (anim === 'idle') return { frames: IDLE_FRAMES, fps: IDLE_FPS };
  return VILLAGER_ANIMS[anim];
}

/** What every step reads: the time of day (working hours) and the buildings standing (open nodes). */
export interface AgentContext {
  /** Time of day, minutes after midnight. */
  readonly minutes: number;
  /** Visual tier per building; `null` = no game attached (everything stands). */
  readonly tiers: VisualTiers | null;
}

/** Noon, every building standing: the context for tests and tools. */
export const NOON: AgentContext = { minutes: 12 * 60, tiers: null };

/** Whether villagers are at work at `minutes` (content `VILLAGER_DAY`). */
export const workingHours = (minutes: number): boolean => minutes >= VILLAGER_DAY.from && minutes < VILLAGER_DAY.until;

/** Whether `node` is open in `ctx`: no building of its own, no game, or its building stands. */
export const nodeOpen = (ctx: AgentContext, node: PathNode): boolean =>
  node.building === undefined || ctx.tiers === null || ctx.tiers[node.building] >= 1;

/** What an arriving walk turns into. */
type Errand = 'rest' | 'work' | 'chat' | 'night' | 'indoors';

/** What an agent is doing (villager states included; a wanderer stands, rests, walks and goes indoors). */
export type Activity =
  | { readonly kind: 'stand' }
  /** Idle where it stands (a wanderer's rest, a villager's pause between chat and work). */
  | { readonly kind: 'rest'; ticksLeft: number }
  /**
   * `path` from the node it left to its goal; `next` = index of the node it walks to; `then` = what it does on
   * arrival; `dx` = px beside the last node it stops at (people sharing a spot stand apart).
   */
  | {
      readonly kind: 'walk';
      readonly path: readonly string[];
      next: number;
      readonly then: Errand;
      readonly dx: number;
    }
  | { readonly kind: 'work'; ticksLeft: number; readonly anim: WorkAnim; readonly spot: string }
  | { readonly kind: 'chat'; ticksLeft: number }
  | { readonly kind: 'night'; readonly anim: 'sit' | 'talk' | 'idle' }
  /** Gone in at a door for the night: out of sight, no pose. */
  | { readonly kind: 'indoors' };

/** One agent; mutated in place by `stepInPlace` (treat as read-only outside this module). */
export interface Agent {
  /** Stable for the agent's life (layers key sprites by it; carts and visitors will come and go, M2-20/21). */
  readonly id: number;
  readonly role: AgentRole;
  readonly sprite: AgentSprite;
  readonly spawn: AgentSpawn;
  /** A wanderer's goals it can reach from its home (checked once at creation); none for a villager. */
  readonly goals: readonly string[];
  /** Px beside a shared spot (chat, night) this agent stands at; the sign is the side, it faces the spot's middle. */
  readonly offset: number;
  /** The last node reached. */
  at: string;
  /** Index into `goals` of the goal picked last (`cycle` order); −1 before the first. */
  goal: number;
  /** World x and rows below the horizon (fractional; poses round them). */
  x: number;
  y: number;
  facing: 1 | -1;
  activity: Activity;
  /** Ticks since the current activity began (animation frames count from it). */
  animTicks: number;
  /** mulberry32 state. */
  rng: number;
}

/** A finished work spell (plan M2-18): where the cosmetic «+» rises. Nothing about the economy. */
export interface WorkDone {
  x: number;
  ground: number;
  building: NodeBuilding;
}

/** The work spells finished in the last step (`slots[0 … count − 1]`; slots reused). */
export interface WorkDoneLog {
  count: number;
  readonly slots: WorkDone[];
}

export interface AgentPool {
  readonly graph: PathGraph;
  readonly agents: Agent[];
  readonly done: WorkDoneLog;
}

interface PoseBase {
  readonly id: number;
  /** World x of the pivot, whole px. */
  readonly x: number;
  /** Pivot row below the horizon, whole px (also the Y-sort key). */
  readonly ground: number;
  /** 1 = facing right (as drawn), −1 = mirrored. */
  readonly facing: 1 | -1;
  readonly frame: number;
}

/**
 * A person this frame. Only villager sprites have the work / talk / sit / cheer frames (M2-17), so a Cossack or a girl
 * can only be posed walking or standing — a pose naming a frame that does not exist does not type-check.
 */
export type AgentPose = PoseBase &
  (
    | { readonly sprite: VillagerSprite; readonly anim: PersonAnim }
    | { readonly sprite: Exclude<AgentSprite, VillagerSprite>; readonly anim: BasicAnim }
  );

/** A pose slot reused frame to frame (`writePoses`). */
export type PoseSlot = { -readonly [K in keyof PoseBase]: PoseBase[K] } & (
  { sprite: VillagerSprite; anim: PersonAnim } | { sprite: Exclude<AgentSprite, VillagerSprite>; anim: BasicAnim }
);

export type AgentCounts = { readonly total: number } & Readonly<Record<AgentRole, number>>;

/** One mulberry32 draw: a value in [0, 1) and the next state. */
function draw(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** The agent's next draw in [0, 1). */
function roll(agent: Agent): number {
  const [r, next] = draw(agent.rng);
  agent.rng = next;
  return r;
}

/** Whole ticks for a step of [lo, hi] s, drawn from the agent's RNG (at least one). */
const span = (agent: Agent, [lo, hi]: readonly [number, number]): number =>
  Math.max(1, Math.round((lo + roll(agent) * (hi - lo)) * TICK_HZ));

/** One of `items`, drawn from the agent's RNG; undefined for none. */
const pick = <T>(agent: Agent, items: readonly T[]): T | undefined =>
  items.length === 0 ? undefined : items[Math.floor(roll(agent) * items.length)];

function setActivity(agent: Agent, activity: Activity): void {
  agent.activity = activity;
  agent.animTicks = 0;
}

/** Idle where it stands for `ticks`. */
const rest = (agent: Agent, ticks: number): void => {
  setActivity(agent, { kind: 'rest', ticksLeft: ticks });
};

/** A wanderer's rest at a goal, and the wait before trying again when no goal is open: at least one tick. */
const restTicks = (spawn: AgentSpawn): number =>
  Math.max(1, Math.round((spawn.routine === 'wander' ? spawn.rest : 0) * TICK_HZ));

/**
 * Moves `speed / TICK_HZ` px along its path (to `dx` beside the last node); on reaching the end, arrives. A node ahead
 * that closed since the path was found (its building gone: a reset, a new land) is never entered: the agent picks
 * again from the last node it reached.
 */
function walk(ctx: AgentContext, graph: PathGraph, agent: Agent): void {
  const a = agent.activity;
  if (a.kind !== 'walk') return;
  let left = agent.spawn.speed / TICK_HZ;
  while (left > 0 && a.next < a.path.length) {
    const node = nodeOf(graph, a.path[a.next] ?? '');
    if (a.next > 0 && !nodeOpen(ctx, node)) {
      replan(ctx, graph, agent);
      return;
    }
    const tx = node.x + (a.next === a.path.length - 1 ? a.dx : 0);
    const dx = tx - agent.x;
    const dy = node.ground - agent.y;
    const d = Math.hypot(dx, dy);
    if (dx !== 0) agent.facing = dx > 0 ? 1 : -1;
    if (d <= left) {
      agent.x = tx;
      agent.y = node.ground;
      agent.at = node.id;
      left -= d;
      a.next += 1;
    } else {
      agent.x += (dx / d) * left;
      agent.y += (dy / d) * left;
      left = 0;
    }
  }
  if (a.next >= a.path.length) arrive(ctx, graph, agent, a.then);
  else agent.animTicks += 1;
}

/** A walk whose way closed: a villager plans afresh, a wanderer rests and picks another goal. */
function replan(ctx: AgentContext, graph: PathGraph, agent: Agent): void {
  if (agent.spawn.routine === 'villager') plan(ctx, graph, agent, agent.spawn);
  else rest(agent, restTicks(agent.spawn));
}

/** Turns to face a shared spot's middle (the left one faces right). */
function faceSpot(agent: Agent): void {
  if (agent.offset !== 0) agent.facing = agent.offset < 0 ? 1 : -1;
}

/** What an agent does at the end of a walk. One whose errand no longer fits the hour idles a moment. */
function arrive(ctx: AgentContext, graph: PathGraph, agent: Agent, then: Errand): void {
  const spawn = agent.spawn;
  const day = workingHours(ctx.minutes);
  if (then === 'indoors' && !day) {
    setActivity(agent, { kind: 'indoors' });
    return;
  }
  if (spawn.routine !== 'villager') {
    rest(agent, restTicks(spawn));
    return;
  }
  const node = nodeOf(graph, agent.at);
  if (then === 'work' && day && node.work !== undefined && nodeOpen(ctx, node)) {
    setActivity(agent, { kind: 'work', ticksLeft: span(agent, VILLAGER_DAY.workS), anim: node.work, spot: node.id });
  } else if (then === 'chat' && day) {
    faceSpot(agent);
    setActivity(agent, { kind: 'chat', ticksLeft: span(agent, VILLAGER_DAY.chatS) });
  } else if (then === 'night' && !day && spawn.night.anim !== 'indoors') {
    agent.facing = spawn.night.facing;
    setActivity(agent, { kind: 'night', anim: spawn.night.anim });
  } else {
    rest(agent, span(agent, VILLAGER_DAY.idleS));
  }
}

/** Sets off toward `target` (this tick), or arrives at once when it is already there; idles when it cannot get there. */
function goTo(ctx: AgentContext, graph: PathGraph, agent: Agent, target: string, then: Errand, dx: number): void {
  const path = findPath(graph, agent.at, target, agent.role, (n) => nodeOpen(ctx, n));
  if (!path) {
    rest(agent, agent.spawn.routine === 'villager' ? span(agent, VILLAGER_DAY.idleS) : restTicks(agent.spawn));
    return;
  }
  // From index 0: an agent stopped beside a node (or turned back mid-edge) first returns to it — 0 px when it is there.
  setActivity(agent, { kind: 'walk', path, next: 0, then, dx });
  walk(ctx, graph, agent);
}

/** Ids of `ids` that are open in `ctx`. */
const openOf = (ctx: AgentContext, graph: PathGraph, ids: readonly string[]): string[] =>
  ids.filter((id) => nodeOpen(ctx, nodeOf(graph, id)));

/** Where a villager spends the night: outside its night spot while that stands, else indoors at home. */
function nightPlace(
  ctx: AgentContext,
  graph: PathGraph,
  spawn: VillagerSpawn,
): { readonly at: string; readonly then: 'night' | 'indoors'; readonly dx: number } {
  const n = spawn.night;
  if (n.anim !== 'indoors' && nodeOpen(ctx, nodeOf(graph, n.at))) return { at: n.at, then: 'night', dx: n.dx };
  return { at: n.anim === 'indoors' && nodeOpen(ctx, nodeOf(graph, n.at)) ? n.at : spawn.home, then: 'indoors', dx: 0 };
}

/** A villager's next step: its night place after hours, else a work spot that stands, else a chat, else a pause. */
function plan(ctx: AgentContext, graph: PathGraph, agent: Agent, spawn: VillagerSpawn): void {
  if (!workingHours(ctx.minutes)) {
    const night = nightPlace(ctx, graph, spawn);
    goTo(ctx, graph, agent, night.at, night.then, night.dx);
    return;
  }
  const work = pick(agent, openOf(ctx, graph, spawn.work));
  if (work !== undefined) goTo(ctx, graph, agent, work, 'work', 0);
  else chat(ctx, graph, agent, spawn);
}

/** Off to talk at one of its open chat spots (another than where it stands, when it has one); else a pause. */
function chat(ctx: AgentContext, graph: PathGraph, agent: Agent, spawn: VillagerSpawn): void {
  const open = openOf(ctx, graph, spawn.chat);
  const away = open.filter((id) => id !== agent.at);
  const target = pick(agent, away.length > 0 ? away : open);
  if (target === undefined) rest(agent, span(agent, VILLAGER_DAY.idleS));
  else goTo(ctx, graph, agent, target, 'chat', agent.offset);
}

function recordDone(done: WorkDoneLog, agent: Agent, building: NodeBuilding): void {
  const slot = done.slots[done.count];
  if (!slot) return;
  slot.x = Math.round(agent.x);
  slot.ground = Math.round(agent.y);
  slot.building = building;
  done.count += 1;
}

function villagerTick(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: VillagerSpawn): void {
  const { graph } = pool;
  const a = agent.activity;
  const day = workingHours(ctx.minutes);
  switch (a.kind) {
    case 'walk':
      walk(ctx, graph, agent);
      return;
    case 'rest':
      if (a.ticksLeft <= 0) plan(ctx, graph, agent, spawn);
      else {
        a.ticksLeft -= 1;
        agent.animTicks += 1;
      }
      return;
    case 'work': {
      const spot = nodeOf(graph, a.spot);
      if (!day || !nodeOpen(ctx, spot)) {
        plan(ctx, graph, agent, spawn);
      } else if (a.ticksLeft <= 0) {
        if (spot.building !== undefined) recordDone(pool.done, agent, spot.building);
        chat(ctx, graph, agent, spawn);
      } else {
        a.ticksLeft -= 1;
        agent.animTicks += 1;
      }
      return;
    }
    case 'chat':
      if (!day || a.ticksLeft <= 0) rest(agent, span(agent, VILLAGER_DAY.idleS));
      else {
        a.ticksLeft -= 1;
        agent.animTicks += 1;
      }
      return;
    case 'night':
    case 'indoors':
      if (day) plan(ctx, graph, agent, spawn);
      else agent.animTicks += 1;
      return;
    case 'stand':
      agent.animTicks += 1;
  }
}

/** A wanderer picks its next open goal and starts toward it (this tick); rests again when none is open. */
function depart(ctx: AgentContext, graph: PathGraph, agent: Agent): void {
  const { goals } = agent;
  let target: string | undefined;
  if (agent.spawn.routine === 'wander' && agent.spawn.order === 'cycle') {
    for (let tries = 0; tries < goals.length && target === undefined; tries++) {
      agent.goal = (agent.goal + 1) % goals.length;
      const g = goals[agent.goal];
      if (g !== undefined && nodeOpen(ctx, nodeOf(graph, g))) target = g;
    }
  } else {
    target = pick(
      agent,
      openOf(ctx, graph, goals).filter((g) => g !== agent.at),
    );
  }
  if (target === undefined || target === agent.at) {
    rest(agent, restTicks(agent.spawn));
    return;
  }
  goTo(ctx, graph, agent, target, 'rest', 0);
}

function wanderTick(ctx: AgentContext, graph: PathGraph, agent: Agent): void {
  const a = agent.activity;
  const spawn = agent.spawn;
  const door = spawn.routine === 'wander' && !workingHours(ctx.minutes) ? spawn.indoors : undefined;
  if (a.kind === 'indoors') {
    if (door === undefined) rest(agent, restTicks(spawn));
    else agent.animTicks += 1;
  } else if (door !== undefined && !(a.kind === 'walk' && a.then === 'indoors')) {
    // After hours a wanderer with a door goes in (few walkers at night, art-director M2-18).
    goTo(ctx, graph, agent, door, 'indoors', 0);
  } else if (a.kind === 'walk') {
    walk(ctx, graph, agent);
  } else if (a.kind === 'rest' && a.ticksLeft <= 0) {
    depart(ctx, graph, agent);
  } else {
    if (a.kind === 'rest') a.ticksLeft -= 1;
    agent.animTicks += 1;
  }
}

function tick(ctx: AgentContext, pool: AgentPool, agent: Agent): void {
  if (agent.spawn.routine === 'villager') villagerTick(ctx, pool, agent, agent.spawn);
  else wanderTick(ctx, pool.graph, agent);
}

/** Steps every agent of `pool` by `ticks` fixed steps, in place; `pool.done` then holds that step's finished work. */
export function stepInPlace(pool: AgentPool, ticks: number, ctx: AgentContext): void {
  pool.done.count = 0;
  for (const agent of pool.agents) for (let i = 0; i < ticks; i++) tick(ctx, pool, agent);
}

/**
 * Puts an agent where the hour finds it: a villager at its night place, at an open work spot, at a chat spot, or idle
 * at home; a wanderer with a door indoors after hours (else it stays at home, as made).
 */
function place(ctx: AgentContext, graph: PathGraph, agent: Agent): void {
  const spawn = agent.spawn;
  const at = (id: string, dx: number): void => {
    const node = nodeOf(graph, id);
    agent.at = id;
    agent.x = node.x + dx;
    agent.y = node.ground;
  };
  const night = !workingHours(ctx.minutes);
  if (spawn.routine === 'wander') {
    if (night && spawn.indoors !== undefined) {
      at(spawn.indoors, 0);
      arrive(ctx, graph, agent, 'indoors');
    }
    return;
  }
  if (night) {
    const n = nightPlace(ctx, graph, spawn);
    at(n.at, n.dx);
    arrive(ctx, graph, agent, n.then);
    return;
  }
  const work = pick(agent, openOf(ctx, graph, spawn.work));
  const talk = work === undefined ? pick(agent, openOf(ctx, graph, spawn.chat)) : undefined;
  if (work !== undefined) {
    at(work, 0);
    arrive(ctx, graph, agent, 'work');
    // Part way through its spell, so the village does not down tools at once.
    const a = agent.activity;
    if (a.kind === 'work') a.ticksLeft = Math.floor(roll(agent) * a.ticksLeft);
  } else if (talk !== undefined) {
    at(talk, agent.offset);
    arrive(ctx, graph, agent, 'chat');
  } else {
    rest(agent, span(agent, VILLAGER_DAY.idleS));
  }
}

/** Px beside a shared spot for agent `id`: ±½, ±1½ and ±2½ spacings (six places, three each side). */
const spotOffset = (id: number): number => {
  const half = Math.ceil(VILLAGER_DAY.spacing / 2);
  const far = Math.floor((id % 6) / 2) * VILLAGER_DAY.spacing;
  return (id % 2 === 0 ? -1 : 1) * (half + far);
};

/**
 * The pool for `spawns` on `graph` at the context `ctx` (the hour and the buildings of the first frame): spawns past a
 * role's budget (plan Q11) are left out (the first ones in order are kept); a wanderer starts at its home and keeps
 * only the goals it can reach from there, a villager starts where the hour finds it; each is run `phase` s ahead.
 * `seed` seeds every agent. A spawn whose home is unknown or closed to its role is a content bug: it throws.
 */
export function createAgents(
  graph: PathGraph,
  spawns: readonly AgentSpawn[],
  budget: Readonly<Record<AgentRole, number>>,
  seed: number,
  ctx: AgentContext = NOON,
): AgentPool {
  checkGraph(graph);
  const used: Record<AgentRole, number> = { villager: 0, cossack: 0, visitor: 0, cart: 0 };
  const pool: AgentPool = {
    graph,
    agents: [],
    done: {
      count: 0,
      slots: Array.from({ length: MAX_WORK_DONE }, () => ({ x: 0, ground: 0, building: 'field' as const })),
    },
  };
  for (const [i, spawn] of spawns.entries()) {
    const home = nodeOf(graph, spawn.home);
    if (!mayEnter(home, spawn.role))
      throw new Error(`agent ${spawn.sprite}: home "${home.id}" closed to ${spawn.role}`);
    if (used[spawn.role] >= budget[spawn.role]) continue;
    used[spawn.role] += 1;
    const goals =
      spawn.routine === 'wander' ? spawn.goals.filter((g) => findPath(graph, home.id, g, spawn.role) !== null) : [];
    const still = spawn.routine === 'wander' && (goals.length === 0 || spawn.speed <= 0);
    const agent: Agent = {
      id: i,
      role: spawn.role,
      sprite: spawn.sprite,
      spawn,
      goals,
      offset: spawn.routine === 'villager' ? spotOffset(i) : 0,
      at: home.id,
      goal: -1,
      x: home.x,
      y: home.ground,
      facing: 1,
      activity: still ? { kind: 'stand' } : { kind: 'rest', ticksLeft: 0 },
      animTicks: 0,
      rng: (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0,
    };
    if (!still) place(ctx, graph, agent);
    for (let t = Math.round(spawn.phase * TICK_HZ); t > 0; t--) tick(ctx, pool, agent);
    pool.agents.push(agent);
  }
  // Work finished while running agents ahead is not news.
  pool.done.count = 0;
  return pool;
}

/** A deep enough copy that stepping it leaves `pool` untouched. */
export const clonePool = (pool: AgentPool): AgentPool => ({
  graph: pool.graph,
  agents: pool.agents.map((a) => ({ ...a, activity: { ...a.activity } })),
  done: { count: pool.done.count, slots: pool.done.slots.map((s) => ({ ...s })) },
});

/** The pool `ticks` fixed steps later (a new pool; the old one is untouched). */
export function stepAgents(pool: AgentPool, ticks: number, ctx: AgentContext = NOON): AgentPool {
  const next = clonePool(pool);
  stepInPlace(next, ticks, ctx);
  return next;
}

const NONE: readonly WorkDone[] = [];

/** The work spells finished in the pool's last step (a fresh array; empty without one). */
export const workDone = (pool: AgentPool): readonly WorkDone[] =>
  pool.done.count === 0 ? NONE : pool.done.slots.slice(0, pool.done.count);

const cycleFrame = (ticks: number, fps: number, frames: number): number => Math.floor((ticks * fps) / TICK_HZ) % frames;

/** The animation an activity shows. */
function animOf(a: Activity): PersonAnim {
  switch (a.kind) {
    case 'walk':
      return 'walk';
    case 'work':
      return a.anim;
    case 'chat':
      return 'talk';
    case 'night':
      return a.anim;
    default:
      return 'idle';
  }
}

function writePose(a: Agent, slot: PoseSlot): void {
  const anim = animOf(a.activity);
  slot.id = a.id;
  slot.x = Math.round(a.x);
  slot.ground = Math.round(a.y);
  slot.facing = a.facing;
  const { frames, fps } = personAnim(anim);
  slot.frame = cycleFrame(a.animTicks, fps, frames);
  // Only a villager routine reaches the villager animations, and only villager sprites have that routine (content).
  if (anim === 'walk' || anim === 'idle' || isVillagerSprite(a.sprite)) {
    slot.sprite = a.sprite;
    slot.anim = anim;
  } else {
    throw new Error(`agent ${String(a.id)}: ${a.sprite} has no "${anim}" frames`);
  }
}

const emptySlot = (): PoseSlot => ({ id: -1, sprite: 'kozak.a', x: 0, ground: 0, facing: 1, anim: 'idle', frame: 0 });

/**
 * Writes whole-px poses into `out` (slots reused) and returns it: one per agent in sight, in pool order — an agent
 * indoors has none (layers drop its sprite by id and make it again when it comes out).
 */
export function writePoses(pool: AgentPool, out: PoseSlot[]): readonly AgentPose[] {
  let n = 0;
  for (const a of pool.agents) {
    if (a.activity.kind === 'indoors') continue;
    const slot = out[n] ?? emptySlot();
    writePose(a, slot);
    out[n] = slot;
    n += 1;
  }
  out.length = n;
  return out;
}

/** Whole-px poses, one per agent in sight, in pool order (fresh objects). */
export const agentPoses = (pool: AgentPool): AgentPose[] => writePoses(pool, []).map((p) => ({ ...p }));

/** Villagers at a work spot now (`__CK__.stats.working`). */
export function workingCount(pool: AgentPool): number {
  let n = 0;
  for (const a of pool.agents) if (a.activity.kind === 'work') n += 1;
  return n;
}

/** Agents in the pool by role (`__CK__.stats.agents`). */
export function agentCounts(pool: AgentPool): AgentCounts {
  const counts = { total: pool.agents.length, villager: 0, cossack: 0, visitor: 0, cart: 0 };
  for (const a of pool.agents) counts[a.role] += 1;
  return counts;
}
