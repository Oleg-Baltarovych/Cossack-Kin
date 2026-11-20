// The agents' skeleton (plan M2-16, SPEC §6.4): people walking a land's path graph. Deterministic — whole fixed ticks
// in, a seeded RNG per agent (mulberry32) for `random` goals, no clock or Math.random — so the same seed and the same
// ticks always give the same poses (`?freeze` frames repeat). Cosmetic only: render state, never GameState. The
// villager FSM (work, chat, night) is M2-18: it reads the `AgentContext` every step gets; today agents walk their goals
// in turn or at random and rest between.
//
// The frame path steps in place (`stepInPlace`, `writePoses`: no allocation per tick but on a new walk or rest);
// `stepAgents`/`agentPoses` are the pure copies for tests and tools.
import {
  VILLAGER_ANIMS,
  type AgentRole,
  type AgentSpawn,
  type AgentSprite,
  type BasicAnim,
  type PathGraph,
  type PersonAnim,
  type VillagerSprite,
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

/** Frame count and rate of a person animation (walk/idle above; the villager set from content, M2-17). */
export function personAnim(anim: PersonAnim): { readonly frames: number; readonly fps: number } {
  if (anim === 'walk') return { frames: WALK_FRAMES, fps: WALK_FPS };
  if (anim === 'idle') return { frames: IDLE_FRAMES, fps: IDLE_FPS };
  return VILLAGER_ANIMS[anim];
}

/** What every step may read (M2-18 schedules by the time of day and the buildings standing); unused by the skeleton. */
export interface AgentContext {
  /** Time of day, minutes after midnight. */
  readonly minutes: number;
  /** Visual tier per building; `null` = no game attached (everything stands). */
  readonly tiers: VisualTiers | null;
}

/** Noon, every building standing: the context for tests and tools. */
export const NOON: AgentContext = { minutes: 12 * 60, tiers: null };

/** What an agent is doing: standing for good (no goal it can reach), resting at a node, or walking a path. */
export type Activity =
  | { readonly kind: 'stand' }
  | { readonly kind: 'rest'; ticksLeft: number }
  /** `path` from the node it left to its goal; `next` = index of the node it walks to. */
  | { readonly kind: 'walk'; readonly path: readonly string[]; next: number };

/** One agent; mutated in place by `stepInPlace` (treat as read-only outside this module). */
export interface Agent {
  /** Stable for the agent's life (layers key sprites by it; carts and visitors will come and go, M2-20/21). */
  readonly id: number;
  readonly role: AgentRole;
  readonly sprite: AgentSprite;
  readonly spawn: AgentSpawn;
  /** The spawn's goals this agent can reach from its home (checked once at creation). */
  readonly goals: readonly string[];
  /** The last node reached. */
  at: string;
  /** Index into `goals` of the goal picked last (`cycle` order); −1 before the first. */
  goal: number;
  /** World x and rows below the horizon (fractional; poses round them). */
  x: number;
  y: number;
  facing: 1 | -1;
  activity: Activity;
  /** Ticks since the walk or the rest began (animation frames count from it). */
  animTicks: number;
  /** mulberry32 state. */
  rng: number;
}

export interface AgentPool {
  readonly graph: PathGraph;
  readonly agents: Agent[];
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

/** A pose slot reused frame to frame (`writePoses`): the skeleton writes walk/idle only, valid for every sprite. */
export type PoseSlot = { -readonly [K in keyof PoseBase]: PoseBase[K] } & (
  { sprite: VillagerSprite; anim: BasicAnim } | { sprite: Exclude<AgentSprite, VillagerSprite>; anim: BasicAnim }
);

export type AgentCounts = { readonly total: number } & Readonly<Record<AgentRole, number>>;

/** Rest at a goal, and the wait before trying again when no goal is open: one rule, at least one tick. */
const restTicks = (spawn: AgentSpawn): number => Math.max(1, Math.round(spawn.rest * TICK_HZ));

/** One mulberry32 draw: a value in [0, 1) and the next state. */
function draw(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** Rests `rest` s where it stands. */
function rest(agent: Agent): void {
  agent.activity = { kind: 'rest', ticksLeft: restTicks(agent.spawn) };
  agent.animTicks = 0;
}

/** Moves `speed / TICK_HZ` px along its path; on reaching the end, rests there. */
function walk(graph: PathGraph, agent: Agent): void {
  const a = agent.activity;
  if (a.kind !== 'walk') return;
  let left = agent.spawn.speed / TICK_HZ;
  while (left > 0 && a.next < a.path.length) {
    const node = nodeOf(graph, a.path[a.next] ?? '');
    const dx = node.x - agent.x;
    const dy = node.ground - agent.y;
    const d = Math.hypot(dx, dy);
    if (dx !== 0) agent.facing = dx > 0 ? 1 : -1;
    if (d <= left) {
      agent.x = node.x;
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
  if (a.next >= a.path.length) rest(agent);
  else agent.animTicks += 1;
}

/** Picks the next goal and starts toward it (this tick); rests again when every goal is where it stands. */
function depart(ctx: AgentContext, graph: PathGraph, agent: Agent): void {
  const { goals } = agent;
  let target: string | undefined;
  if (agent.spawn.order === 'cycle') {
    agent.goal = (agent.goal + 1) % goals.length;
    target = goals[agent.goal];
  } else {
    const options = goals.filter((g) => g !== agent.at);
    const [r, next] = draw(agent.rng);
    agent.rng = next;
    target = options[Math.floor(r * options.length)];
  }
  const path = target === undefined ? null : findPath(graph, agent.at, target, agent.role);
  if (!path || path.length < 2) {
    rest(agent);
    return;
  }
  agent.activity = { kind: 'walk', path, next: 1 };
  agent.animTicks = 0;
  walk(graph, agent);
}

function tick(ctx: AgentContext, graph: PathGraph, agent: Agent): void {
  const a = agent.activity;
  if (a.kind === 'walk') {
    walk(graph, agent);
  } else if (a.kind === 'rest' && a.ticksLeft <= 0) {
    depart(ctx, graph, agent);
  } else {
    if (a.kind === 'rest') a.ticksLeft -= 1;
    agent.animTicks += 1;
  }
}

/** Steps every agent of `pool` by `ticks` fixed steps, in place. */
export function stepInPlace(pool: AgentPool, ticks: number, ctx: AgentContext): void {
  for (const agent of pool.agents) for (let i = 0; i < ticks; i++) tick(ctx, pool.graph, agent);
}

/**
 * The pool for `spawns` on `graph`: spawns past a role's budget (plan Q11) are left out (the first ones in order are
 * kept); each agent starts at its home node, keeps only the goals it can reach from there and is run `phase` s ahead.
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
  const agents: Agent[] = [];
  for (const [i, spawn] of spawns.entries()) {
    const home = nodeOf(graph, spawn.home);
    if (!mayEnter(home, spawn.role))
      throw new Error(`agent ${spawn.sprite}: home "${home.id}" closed to ${spawn.role}`);
    if (used[spawn.role] >= budget[spawn.role]) continue;
    used[spawn.role] += 1;
    const goals = spawn.goals.filter((g) => findPath(graph, home.id, g, spawn.role) !== null);
    const agent: Agent = {
      id: i,
      role: spawn.role,
      sprite: spawn.sprite,
      spawn,
      goals,
      at: home.id,
      goal: -1,
      x: home.x,
      y: home.ground,
      facing: 1,
      activity: goals.length === 0 || spawn.speed <= 0 ? { kind: 'stand' } : { kind: 'rest', ticksLeft: 0 },
      animTicks: 0,
      rng: (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0,
    };
    for (let t = Math.round(spawn.phase * TICK_HZ); t > 0; t--) tick(ctx, graph, agent);
    agents.push(agent);
  }
  return { graph, agents };
}

/** A deep enough copy that stepping it leaves `pool` untouched. */
export const clonePool = (pool: AgentPool): AgentPool => ({
  graph: pool.graph,
  agents: pool.agents.map((a) => ({ ...a, activity: { ...a.activity } })),
});

/** The pool `ticks` fixed steps later (a new pool; the old one is untouched). */
export function stepAgents(pool: AgentPool, ticks: number, ctx: AgentContext = NOON): AgentPool {
  const next = clonePool(pool);
  stepInPlace(next, ticks, ctx);
  return next;
}

const cycleFrame = (ticks: number, fps: number, frames: number): number => Math.floor((ticks * fps) / TICK_HZ) % frames;

function writePose(a: Agent, slot: PoseSlot): void {
  const walking = a.activity.kind === 'walk';
  slot.id = a.id;
  slot.sprite = a.sprite;
  slot.x = Math.round(a.x);
  slot.ground = Math.round(a.y);
  slot.facing = a.facing;
  slot.anim = walking ? 'walk' : 'idle';
  slot.frame = walking
    ? cycleFrame(a.animTicks, WALK_FPS, WALK_FRAMES)
    : cycleFrame(a.animTicks, IDLE_FPS, IDLE_FRAMES);
}

const emptySlot = (): PoseSlot => ({ id: -1, sprite: 'kozak.a', x: 0, ground: 0, facing: 1, anim: 'idle', frame: 0 });

/** Writes whole-px poses into `out` (slots reused; its length follows the pool) and returns it. */
export function writePoses(pool: AgentPool, out: PoseSlot[]): readonly AgentPose[] {
  out.length = Math.min(out.length, pool.agents.length);
  for (const [i, a] of pool.agents.entries()) {
    const slot = out[i] ?? emptySlot();
    writePose(a, slot);
    out[i] = slot;
  }
  return out;
}

/** Whole-px poses, one per agent in pool order (fresh objects). */
export const agentPoses = (pool: AgentPool): AgentPose[] => [...writePoses(pool, [])];

/** Agents in the pool by role (`__CK__.stats.agents`). */
export function agentCounts(pool: AgentPool): AgentCounts {
  const counts = { total: pool.agents.length, villager: 0, cossack: 0, visitor: 0, cart: 0 };
  for (const a of pool.agents) counts[a.role] += 1;
  return counts;
}
