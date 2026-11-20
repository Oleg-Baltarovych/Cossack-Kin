// The agents (plan M2-16 skeleton, M2-18 villager FSM, M2-19 Cossacks; SPEC §6.4): people walking a land's path graph.
// Deterministic — whole fixed ticks in, a seeded RNG per agent (mulberry32), no clock or Math.random. The poses are a
// function of the seed, the context the pool was made with and the whole history of steps — how many ticks each step
// took and the context (time of day, visual tiers, the army) it saw — not of the current time and tiers alone: a tier
// that changes between two steps changes what follows (tested). `?freeze` frames repeat because a frozen frame is one
// step from creation. Cosmetic only: render state, never GameState; the context is read, never written.
//
// Three routines (content `AgentSpawn`): `wander` walks its goals in turn or at random and rests between (the girls,
// who go indoors after hours); `villager` lives a day — idle → walk to a work spot whose building stands → work there →
// walk to a chat spot → talk → idle → …, and outside the working hours (content `VILLAGER_DAY`) goes to its night spot:
// outside a door or the forge, or indoors (out of sight, no pose) when that spot does not stand; `cossack` (M2-19) has a
// duty — the ranks drill in step on the maidan by one clock for the whole pool (`pool.ticks`, content
// `COSSACK_DAY.drill`) facing the otaman, who speaks and then marches the front; free Cossacks idle from haunt to haunt
// (the suburb's tavern, smithy, fair); at night both sit by a Sich fire with a pipe or go into the kurin; guards keep
// their posts by the towers (spear by day, torch at night). Only the first `AgentContext.cossacks` Cossacks with a duty
// are on the scene (the army's count); one more hired walks out of the kurin door. Nodes tied to a building are open only
// while it stands (visual tier ≥ the node's `from`, default 1): nobody walks through (re-checked node by node while
// walking), works, drills or stands guard at an empty plot.
// At creation an agent is put straight where the hour finds it (at work, in the ranks, by its door), so a first frame —
// and a `?freeze` shot — already shows the village's day or night.
//
// The frame path steps in place (`stepInPlace`, `writePoses`: no allocation per tick but on a new step of the routine);
// `stepAgents`/`agentPoses` are the pure copies for tests and tools.
import {
  CART_PERIOD,
  CART_TRIP,
  COSSACK_ANIMS,
  COSSACK_DAY,
  GUARD_ANIMS,
  OTAMAN_ANIMS,
  VILLAGER_ANIMS,
  VILLAGER_DAY,
  isCossackAnim,
  isGuardAnim,
  isGuardSprite,
  isKozakSprite,
  isOtamanAnim,
  isOtamanSprite,
  isVillagerAnim,
  isVillagerSprite,
  type AgentRole,
  type AgentSpawn,
  type AgentSprite,
  type BasicAnim,
  type CartSpawn,
  type CartSprite,
  type CossackAnim,
  type CossackSpawn,
  type GirlSprite,
  type GuardAnim,
  type GuardSprite,
  type KozakSprite,
  type NodeBuilding,
  type OtamanAnim,
  type OtamanSprite,
  type PathGraph,
  type PathNode,
  type PersonAnim,
  type Spot,
  type VillagerAnim,
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

/** Frame count and rate of a person animation (walk/idle above; the villager and Cossack sets from content). */
export function personAnim(anim: PersonAnim): { readonly frames: number; readonly fps: number } {
  if (anim === 'walk') return { frames: WALK_FRAMES, fps: WALK_FPS };
  if (anim === 'idle') return { frames: IDLE_FRAMES, fps: IDLE_FPS };
  if (isVillagerAnim(anim)) return VILLAGER_ANIMS[anim];
  if (isCossackAnim(anim)) return COSSACK_ANIMS[anim];
  if (isOtamanAnim(anim)) return OTAMAN_ANIMS[anim];
  return GUARD_ANIMS[anim];
}

/** What every step reads: the time of day (working hours), the buildings standing (open nodes) and the army. */
export interface AgentContext {
  /** Time of day, minutes after midnight. */
  readonly minutes: number;
  /** Visual tier per building; `null` = no game attached (everything stands). */
  readonly tiers: VisualTiers | null;
  /**
   * Cossacks the army has on the scene (core `populationView`, M2-19): the first that many Cossacks with a duty are
   * there; absent = no game, all of them.
   */
  readonly cossacks?: number | undefined;
  /**
   * Seconds between food carts leaving the farm (core `populationView`, M2-20); `null` = no food, no carts; absent =
   * no game: the busiest traffic (`CART_PERIOD.minS`).
   */
  readonly cartPeriodS?: number | null | undefined;
}

/** Noon, every building standing: the context for tests and tools. */
export const NOON: AgentContext = { minutes: 12 * 60, tiers: null };

/** Whether villagers are at work at `minutes` (content `VILLAGER_DAY`). */
export const workingHours = (minutes: number): boolean => minutes >= VILLAGER_DAY.from && minutes < VILLAGER_DAY.until;

/** Whether the Sich keeps its day (drill, haunts; content `COSSACK_DAY`) at `minutes`; else the night (fires, torches). */
export const cossackHours = (minutes: number): boolean => minutes >= COSSACK_DAY.from && minutes < COSSACK_DAY.until;

/** Whether `node` is open in `ctx`: no building of its own, no game, or its building stands (at its `from` tier). */
export const nodeOpen = (ctx: AgentContext, node: PathNode): boolean =>
  node.building === undefined || ctx.tiers === null || ctx.tiers[node.building] >= (node.from ?? 1);

/** A step of the drill cycle (content `COSSACK_DAY.drill`). */
export type DrillPhase = keyof typeof COSSACK_DAY.drill;
const DRILL_STEPS: readonly DrillPhase[] = ['speak', 'cheer', 'drill', 'ease'];
/** Ticks of each drill step and of the whole cycle. */
const DRILL_TICKS: readonly number[] = DRILL_STEPS.map((p) => Math.round(COSSACK_DAY.drill[p] * TICK_HZ));
const DRILL_CYCLE = DRILL_TICKS.reduce((a, b) => a + b, 0);

/** Index of the drill step at pool tick `t` and the ticks since it began (one clock for the whole maidan). */
function drillAt(t: number, into: 'step' | 'ticks'): number {
  let left = ((t % DRILL_CYCLE) + DRILL_CYCLE) % DRILL_CYCLE;
  for (let i = 0; i < DRILL_TICKS.length; i++) {
    const len = DRILL_TICKS[i] ?? 0;
    if (left < len) return into === 'step' ? i : left;
    left -= len;
  }
  return 0;
}

/** The drill step at pool tick `t`. */
export const drillPhase = (t: number): DrillPhase => DRILL_STEPS[drillAt(t, 'step')] ?? 'speak';

/** Which drill cycle `t` is in (the otaman marches the front once per cycle). */
const drillCycle = (t: number): number => Math.floor(t / DRILL_CYCLE);

/** What a rank Cossack shows at each drill step. */
const RANK_ANIM: Readonly<Record<DrillPhase, CossackAnim | 'idle'>> = {
  speak: 'idle',
  cheer: 'cheer',
  drill: 'drill',
  ease: 'idle',
};

/** What an arriving walk turns into. */
type Errand =
  'rest' | 'work' | 'chat' | 'night' | 'indoors' | 'rank' | 'lead' | 'post' | 'haunt' | 'leave' | 'unload' | 'depot';

/** What an agent is doing (villager and Cossack states included; a wanderer stands, rests, walks and goes indoors). */
export type Activity =
  | { readonly kind: 'stand' }
  /** Idle where it stands (a wanderer's rest, a villager's pause, a free Cossack at a haunt). */
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
      /** The otaman's review step along the ranks (M2-19), else a plain walk. */
      readonly gait: 'walk' | 'march';
    }
  | { readonly kind: 'work'; ticksLeft: number; readonly anim: WorkAnim; readonly spot: string }
  | { readonly kind: 'chat'; ticksLeft: number }
  | { readonly kind: 'night'; readonly anim: 'sit' | 'talk' | 'idle' | 'sit-smoke' }
  /** Gone in at a door for the night: out of sight, no pose. */
  | { readonly kind: 'indoors' }
  /** A Cossack the army does not have now (M2-19): not on the scene, no pose. */
  | { readonly kind: 'absent' }
  /** In his place in the ranks: the drill clock picks the animation. */
  | { readonly kind: 'rank' }
  /** The otaman at his stand before the ranks: speaking or watching, by the drill clock. */
  | { readonly kind: 'lead' }
  /** A guard at his post: on the spear by day, a torch at night. */
  | { readonly kind: 'post'; readonly anim: 'watch' | 'torch' }
  /** A food cart waiting beyond the world's edge for its turn (M2-20): out of sight, no pose. */
  | { readonly kind: 'depot' }
  /** A cart stopped short of the gate, unloading (still full), then standing turned (empty) before the way back. */
  | { readonly kind: 'unload' | 'turn'; ticksLeft: number };

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
  /** Place among the Cossacks with a duty (on the scene while < `AgentContext.cossacks`); −1 for everyone else. */
  readonly enlist: number;
  /** The otaman: the drill cycle whose front he marched last (−1 before the first). */
  reviewed: number;
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
  /** Ticks the pool has been stepped: the clock the maidan drills by (M2-19). */
  ticks: number;
  /** The food carts' timetable (M2-20). */
  readonly carts: CartSchedule;
}

/**
 * When the next food cart may leave (pool tick; `null` before the first) and whose turn it is (index among the pool's
 * carts). One departure per period: after each, `next` moves on by the period of that moment, so a live change of the
 * period never bunches carts or skips one; while every cart is out, the departure waits for the first one back.
 */
export interface CartSchedule {
  next: number | null;
  turn: number;
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

/** Which animations each person sprite family has frames for (M2-17 villagers, M2-19 Cossacks). */
type Look =
  | { sprite: VillagerSprite; anim: BasicAnim | VillagerAnim }
  | { sprite: KozakSprite; anim: BasicAnim | CossackAnim }
  | { sprite: OtamanSprite; anim: BasicAnim | OtamanAnim }
  | { sprite: GuardSprite; anim: BasicAnim | GuardAnim }
  | { sprite: GirlSprite; anim: BasicAnim }
  | { sprite: CartSprite; anim: BasicAnim };

/**
 * A person this frame. Each sprite family has its own animations beyond walk/idle — the villagers' work set (M2-17),
 * the Cossacks' drill / pipe / cheer, the otaman's speak / march, the guards' watch / torch (M2-19) — so a pose naming
 * a frame that does not exist does not type-check.
 */
export type AgentPose = PoseBase & Readonly<Look>;

/** A pose slot reused frame to frame (`writePoses`). */
export type PoseSlot = { -readonly [K in keyof PoseBase]: PoseBase[K] } & Look;

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

/** The pause before trying again (no goal open, no way there): by routine. */
const pauseTicks = (agent: Agent): number =>
  agent.spawn.routine === 'villager'
    ? span(agent, VILLAGER_DAY.idleS)
    : agent.spawn.routine === 'cossack'
      ? span(agent, COSSACK_DAY.hauntS)
      : restTicks(agent.spawn);

/**
 * Moves `speed / TICK_HZ` px along its path (to `dx` beside the last node); on reaching the end, arrives. A node ahead
 * that closed since the path was found (its building gone: a reset, a new land) is never entered: the agent picks
 * again from the last node it reached.
 */
function walk(ctx: AgentContext, pool: AgentPool, agent: Agent, t: number): void {
  const { graph } = pool;
  const a = agent.activity;
  if (a.kind !== 'walk') return;
  let left = agent.spawn.speed / TICK_HZ;
  while (left > 0 && a.next < a.path.length) {
    const node = nodeOf(graph, a.path[a.next] ?? '');
    if (a.next > 0 && !nodeOpen(ctx, node)) {
      replan(ctx, pool, agent, t);
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
  if (a.next >= a.path.length) arrive(ctx, pool, agent, a.then, t);
  else agent.animTicks += 1;
}

/** A walk whose way closed: a villager or a Cossack plans afresh, a wanderer rests and picks another goal. */
function replan(ctx: AgentContext, pool: AgentPool, agent: Agent, t: number): void {
  const spawn = agent.spawn;
  if (spawn.routine === 'cart') homeward(ctx, pool, agent, spawn, t);
  else if (spawn.routine === 'villager') plan(ctx, pool, agent, spawn, t);
  else if (spawn.routine === 'cossack') duty(ctx, pool, agent, spawn, t);
  else rest(agent, restTicks(spawn));
}

/** Turns to face a shared spot's middle (the left one faces right). */
function faceSpot(agent: Agent): void {
  if (agent.offset !== 0) agent.facing = agent.offset < 0 ? 1 : -1;
}

/** What an agent does at the end of a walk. One whose errand no longer fits the hour idles a moment. */
function arrive(ctx: AgentContext, pool: AgentPool, agent: Agent, then: Errand, t: number): void {
  const spawn = agent.spawn;
  if (spawn.routine === 'cossack') {
    cossackArrive(ctx, pool, agent, spawn, then, t);
    return;
  }
  if (spawn.routine === 'cart') {
    cartArrive(agent, then);
    return;
  }
  const day = workingHours(ctx.minutes);
  if (then === 'indoors' && !day) {
    setActivity(agent, { kind: 'indoors' });
    return;
  }
  if (spawn.routine !== 'villager') {
    rest(agent, restTicks(spawn));
    return;
  }
  const node = nodeOf(pool.graph, agent.at);
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
function goTo(
  ctx: AgentContext,
  pool: AgentPool,
  agent: Agent,
  target: string,
  then: Errand,
  dx: number,
  t: number,
): void {
  const path = findPath(pool.graph, agent.at, target, agent.role, (n) => nodeOpen(ctx, n));
  if (!path) {
    rest(agent, pauseTicks(agent));
    return;
  }
  // From index 0: an agent stopped beside a node (or turned back mid-edge) first returns to it — 0 px when it is there.
  setActivity(agent, { kind: 'walk', path, next: 0, then, dx, gait: 'walk' });
  walk(ctx, pool, agent, t);
}

/** Ids of `ids` that are open in `ctx`. */
const openOf = (ctx: AgentContext, graph: PathGraph, ids: readonly string[]): string[] =>
  ids.filter((id) => nodeOpen(ctx, nodeOf(graph, id)));

/** Whether a spot's node is open in `ctx`. */
const spotOpen = (ctx: AgentContext, graph: PathGraph, spot: Spot): boolean => nodeOpen(ctx, nodeOf(graph, spot.at));

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
function plan(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: VillagerSpawn, t: number): void {
  if (!workingHours(ctx.minutes)) {
    const night = nightPlace(ctx, pool.graph, spawn);
    goTo(ctx, pool, agent, night.at, night.then, night.dx, t);
    return;
  }
  const work = pick(agent, openOf(ctx, pool.graph, spawn.work));
  if (work !== undefined) goTo(ctx, pool, agent, work, 'work', 0, t);
  else chat(ctx, pool, agent, spawn, t);
}

/** Off to talk at one of its open chat spots (another than where it stands, when it has one); else a pause. */
function chat(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: VillagerSpawn, t: number): void {
  const open = openOf(ctx, pool.graph, spawn.chat);
  const away = open.filter((id) => id !== agent.at);
  const target = pick(agent, away.length > 0 ? away : open);
  if (target === undefined) rest(agent, span(agent, VILLAGER_DAY.idleS));
  else goTo(ctx, pool, agent, target, 'chat', agent.offset, t);
}

function recordDone(done: WorkDoneLog, agent: Agent, building: NodeBuilding): void {
  const slot = done.slots[done.count];
  if (!slot) return;
  slot.x = Math.round(agent.x);
  slot.ground = Math.round(agent.y);
  slot.building = building;
  done.count += 1;
}

function villagerTick(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: VillagerSpawn, t: number): void {
  const a = agent.activity;
  const day = workingHours(ctx.minutes);
  switch (a.kind) {
    case 'walk':
      walk(ctx, pool, agent, t);
      return;
    case 'rest':
      if (a.ticksLeft <= 0) plan(ctx, pool, agent, spawn, t);
      else {
        a.ticksLeft -= 1;
        agent.animTicks += 1;
      }
      return;
    case 'work': {
      const spot = nodeOf(pool.graph, a.spot);
      if (!day || !nodeOpen(ctx, spot)) {
        plan(ctx, pool, agent, spawn, t);
      } else if (a.ticksLeft <= 0) {
        if (spot.building !== undefined) recordDone(pool.done, agent, spot.building);
        chat(ctx, pool, agent, spawn, t);
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
      if (day) plan(ctx, pool, agent, spawn, t);
      else agent.animTicks += 1;
      return;
    default:
      agent.animTicks += 1;
  }
}

// ── Cossacks (M2-19) ────────────────────────────────────────────────────────────────────────────────────────────────

/** Whether the army has this Cossack on the scene now. */
const enlisted = (ctx: AgentContext, agent: Agent): boolean =>
  agent.enlist < 0 || ctx.cossacks === undefined || agent.enlist < ctx.cossacks;

/** A free Cossack (or a rank one without a maidan) off to another open haunt; a pause when none is open. */
function haunt(ctx: AgentContext, pool: AgentPool, agent: Agent, haunts: readonly string[], t: number): void {
  const open = openOf(ctx, pool.graph, haunts);
  const away = open.filter((id) => id !== agent.at);
  const target = pick(agent, away.length > 0 ? away : open);
  if (target === undefined || target === agent.at) rest(agent, span(agent, COSSACK_DAY.hauntS));
  else goTo(ctx, pool, agent, target, 'haunt', agent.offset, t);
}

/** The node and errand a Cossack is bound for now (by the hour and what stands), and px beside it. */
function cossackGoal(
  ctx: AgentContext,
  graph: PathGraph,
  spawn: CossackSpawn,
): { readonly at: string; readonly then: Errand; readonly dx: number } | 'haunt' {
  const day = cossackHours(ctx.minutes);
  const home = { at: spawn.home, then: 'indoors', dx: 0 } as const;
  switch (spawn.duty) {
    case 'guard':
      return spotOpen(ctx, graph, spawn.post) ? { at: spawn.post.at, then: 'post', dx: spawn.post.dx } : home;
    case 'otaman':
      return day && spotOpen(ctx, graph, spawn.stand) ? { at: spawn.stand.at, then: 'lead', dx: spawn.stand.dx } : home;
    case 'rank':
    case 'free': {
      if (!day) {
        const n = spawn.night;
        return n.anim !== 'indoors' && spotOpen(ctx, graph, n) ? { at: n.at, then: 'night', dx: n.dx } : home;
      }
      if (spawn.duty === 'rank' && spotOpen(ctx, graph, spawn.rank))
        return { at: spawn.rank.at, then: 'rank', dx: spawn.rank.dx };
      return 'haunt';
    }
  }
}

/** A Cossack's next step: where his duty, the hour and the buildings standing send him. */
function duty(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: CossackSpawn, t: number): void {
  const goal = cossackGoal(ctx, pool.graph, spawn);
  if (goal === 'haunt')
    haunt(ctx, pool, agent, spawn.duty === 'otaman' || spawn.duty === 'guard' ? [] : spawn.haunts, t);
  else goTo(ctx, pool, agent, goal.at, goal.then, goal.dx, t);
}

/** A guard's animation at his post: the torch after dark. */
const postAnim = (ctx: AgentContext): 'watch' | 'torch' => (cossackHours(ctx.minutes) ? 'watch' : 'torch');

function cossackArrive(
  ctx: AgentContext,
  pool: AgentPool,
  agent: Agent,
  spawn: CossackSpawn,
  then: Errand,
  t: number,
): void {
  if (then === 'leave') {
    // Back in the kurin: the army no longer has him (or, re-hired on the way, he turns out again next tick).
    setActivity(agent, enlisted(ctx, agent) ? { kind: 'rest', ticksLeft: 0 } : { kind: 'absent' });
    return;
  }
  const goal = cossackGoal(ctx, pool.graph, spawn);
  // Bound elsewhere now (the hour turned, a building fell while it walked): off again, after a breath.
  const due = goal === 'haunt' ? 'haunt' : goal.then;
  if (then !== due) {
    rest(agent, 1);
    return;
  }
  switch (then) {
    case 'post':
      if (spawn.duty === 'guard') agent.facing = spawn.post.facing;
      setActivity(agent, { kind: 'post', anim: postAnim(ctx) });
      return;
    case 'lead':
      if (spawn.duty === 'otaman') agent.facing = spawn.stand.facing;
      setActivity(agent, { kind: 'lead' });
      // Arriving mid-drill does not start another march this cycle.
      agent.reviewed = drillPhase(t) === 'drill' ? drillCycle(t) : agent.reviewed;
      return;
    case 'rank':
      if (spawn.duty === 'rank') agent.facing = spawn.rank.facing;
      setActivity(agent, { kind: 'rank' });
      return;
    case 'night':
      if ((spawn.duty === 'rank' || spawn.duty === 'free') && spawn.night.anim !== 'indoors') {
        agent.facing = spawn.night.facing;
        setActivity(agent, { kind: 'night', anim: spawn.night.anim });
      }
      return;
    case 'indoors':
      setActivity(agent, { kind: 'indoors' });
      return;
    default:
      faceSpot(agent);
      rest(agent, span(agent, COSSACK_DAY.hauntS));
  }
}

/** The otaman sets off along the front (stand → review nodes → stand) in the review step. */
function march(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: CossackSpawn, t: number): void {
  if (spawn.duty !== 'otaman') return;
  agent.reviewed = drillCycle(t);
  const path = [spawn.stand.at, ...spawn.review, spawn.stand.at];
  setActivity(agent, { kind: 'walk', path, next: 0, then: 'lead', dx: spawn.stand.dx, gait: 'march' });
  walk(ctx, pool, agent, t);
}

/** Whether a Cossack where he is (at a duty place, indoors) should be somewhere else now. */
function misplaced(ctx: AgentContext, graph: PathGraph, agent: Agent, spawn: CossackSpawn): boolean {
  const goal = cossackGoal(ctx, graph, spawn);
  const kind = agent.activity.kind;
  if (goal === 'haunt') return kind !== 'rest';
  const want: Readonly<Record<Errand, Activity['kind']>> = {
    post: 'post',
    lead: 'lead',
    rank: 'rank',
    night: 'night',
    indoors: 'indoors',
    rest: 'rest',
    haunt: 'rest',
    work: 'work',
    chat: 'chat',
    leave: 'absent',
    unload: 'unload',
    depot: 'depot',
  };
  return want[goal.then] !== kind;
}

/** Puts a Cossack at his home door (a hire walks out of the kurin). */
function atNode(graph: PathGraph, agent: Agent, id: string, dx: number): void {
  const node = nodeOf(graph, id);
  agent.at = id;
  agent.x = node.x + dx;
  agent.y = node.ground;
}

function cossackTick(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: CossackSpawn, t: number): void {
  const a = agent.activity;
  if (!enlisted(ctx, agent)) {
    // The army lost him (a reset, a new land): he walks back into the kurin, then is gone — never popped mid-drill.
    if (a.kind === 'absent') return;
    if (a.kind === 'indoors') setActivity(agent, { kind: 'absent' });
    else if (a.kind === 'walk' && a.then === 'leave') walk(ctx, pool, agent, t);
    else goTo(ctx, pool, agent, spawn.home, 'leave', 0, t);
    return;
  }
  if (a.kind === 'walk' && a.then === 'leave') {
    // Re-hired on his way out: back to his duty from where he is.
    duty(ctx, pool, agent, spawn, t);
    return;
  }
  switch (a.kind) {
    case 'absent':
      // Hired: out of the kurin door, off to his duty.
      atNode(pool.graph, agent, spawn.home, 0);
      duty(ctx, pool, agent, spawn, t);
      return;
    case 'walk':
      walk(ctx, pool, agent, t);
      return;
    case 'rest':
      if (a.ticksLeft <= 0) duty(ctx, pool, agent, spawn, t);
      else {
        a.ticksLeft -= 1;
        agent.animTicks += 1;
      }
      return;
    case 'lead':
      if (misplaced(ctx, pool.graph, agent, spawn)) duty(ctx, pool, agent, spawn, t);
      else if (drillPhase(t) === 'drill' && agent.reviewed !== drillCycle(t)) march(ctx, pool, agent, spawn, t);
      else agent.animTicks += 1;
      return;
    case 'post':
      if (misplaced(ctx, pool.graph, agent, spawn)) duty(ctx, pool, agent, spawn, t);
      else if (a.anim !== postAnim(ctx)) setActivity(agent, { kind: 'post', anim: postAnim(ctx) });
      else agent.animTicks += 1;
      return;
    default:
      if (misplaced(ctx, pool.graph, agent, spawn)) duty(ctx, pool, agent, spawn, t);
      else agent.animTicks += 1;
  }
}

/**
 * Puts a Cossack where the hour finds him: in the ranks, at the stand, at his post, by the fire, at a haunt (part way
 * through his idle there) or indoors; one the army does not have is absent.
 */
function placeCossack(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: CossackSpawn, t: number): void {
  if (!enlisted(ctx, agent)) {
    setActivity(agent, { kind: 'absent' });
    return;
  }
  const goal = cossackGoal(ctx, pool.graph, spawn);
  if (goal !== 'haunt') {
    atNode(pool.graph, agent, goal.at, goal.dx);
    cossackArrive(ctx, pool, agent, spawn, goal.then, t);
    return;
  }
  const at = pick(agent, openOf(ctx, pool.graph, spawn.duty === 'rank' || spawn.duty === 'free' ? spawn.haunts : []));
  if (at === undefined) {
    rest(agent, span(agent, COSSACK_DAY.hauntS));
    return;
  }
  atNode(pool.graph, agent, at, agent.offset);
  cossackArrive(ctx, pool, agent, spawn, 'haunt', t);
  const a = agent.activity;
  if (a.kind === 'rest') a.ticksLeft = Math.floor(roll(agent) * a.ticksLeft);
}

// ── food carts (M2-20) ───────────────────────────────────────────────────────────────────────────────────────────

/** Ticks between departures for `ctx` (null: no food, no carts; no game: the busiest). */
function cartPeriodTicks(ctx: AgentContext): number | null {
  const s = ctx.cartPeriodS === undefined ? CART_PERIOD.minS : ctx.cartPeriodS;
  return s === null ? null : Math.max(1, Math.round(s * TICK_HZ));
}

/**
 * The timetable at tick `t`: when a departure is due, the first cart waiting in its depot from the one whose turn it
 * is (round the pool's carts, so never more out than the pool has: ≤ the budget) sets off, the turn passes to the
 * cart after it and the next departure is one period on. None waiting: it waits. No food: nothing leaves.
 */
function dispatch(ctx: AgentContext, pool: AgentPool, carts: number, t: number): void {
  const p = cartPeriodTicks(ctx);
  const sched = pool.carts;
  if (p === null || carts === 0) return;
  sched.next ??= t;
  if (t < sched.next) return;
  for (let k = 0; k < carts; k++) {
    const want = (sched.turn + k) % carts;
    let index = 0;
    for (const agent of pool.agents) {
      if (agent.spawn.routine !== 'cart') continue;
      if (index++ !== want) continue;
      if (agent.activity.kind !== 'depot') break;
      setOut(ctx, pool, agent, agent.spawn, t);
      sched.turn = (want + 1) % carts;
      sched.next = t + p;
      return;
    }
  }
}

/** Carts in the pool (the timetable goes round them). */
function cartCount(pool: AgentPool): number {
  let n = 0;
  for (const agent of pool.agents) if (agent.spawn.routine === 'cart') n += 1;
  return n;
}

/** One tick of the carts, all together (they share the timetable): departures first, then each cart's step. */
function cartsTick(ctx: AgentContext, pool: AgentPool, carts: number, t: number): void {
  dispatch(ctx, pool, carts, t);
  for (const agent of pool.agents) if (agent.spawn.routine === 'cart') tick(ctx, pool, agent, t);
}

/** Sets off along `path`; homeward from its second node (it stands beside the gate: never a step toward it). */
function drive(
  ctx: AgentContext,
  pool: AgentPool,
  agent: Agent,
  path: readonly string[] | null,
  then: Errand,
  dx: number,
  t: number,
): void {
  if (!path) {
    setActivity(agent, { kind: 'depot' });
    return;
  }
  const next = then === 'depot' && path.length > 1 ? 1 : 0;
  setActivity(agent, { kind: 'walk', path, next, then, dx, gait: 'walk' });
  walk(ctx, pool, agent, t);
}

/** Out of the depot, full, toward the gate: it stops `CART_TRIP.reach` px short of it, so the oxen never pass it. */
function setOut(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: CartSpawn, t: number): void {
  atNode(pool.graph, agent, spawn.depot.at, spawn.depot.dx);
  const path = findPath(pool.graph, spawn.depot.at, spawn.gate, 'cart', (n) => nodeOpen(ctx, n));
  drive(ctx, pool, agent, path, 'unload', -CART_TRIP.reach, t);
}

/** Back west, empty, to the depot beyond the world's edge. */
function homeward(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: CartSpawn, t: number): void {
  const path = findPath(pool.graph, agent.at, spawn.depot.at, 'cart', (n) => nodeOpen(ctx, n));
  drive(ctx, pool, agent, path, 'depot', spawn.depot.dx, t);
}

function cartArrive(agent: Agent, then: Errand): void {
  setActivity(
    agent,
    then === 'unload' ? { kind: 'unload', ticksLeft: span(agent, CART_TRIP.unloadS) } : { kind: 'depot' },
  );
}

function cartTick(ctx: AgentContext, pool: AgentPool, agent: Agent, spawn: CartSpawn, t: number): void {
  const a = agent.activity;
  switch (a.kind) {
    case 'depot':
      // Waits for its turn (`dispatch`).
      return;
    case 'walk':
      walk(ctx, pool, agent, t);
      return;
    case 'unload':
    case 'turn':
      if (a.ticksLeft > 0) {
        a.ticksLeft -= 1;
        agent.animTicks += 1;
      } else if (a.kind === 'unload') {
        setActivity(agent, { kind: 'turn', ticksLeft: Math.round(CART_TRIP.turnS * TICK_HZ) });
      } else {
        homeward(ctx, pool, agent, spawn, t);
      }
      return;
    default:
      setActivity(agent, { kind: 'depot' });
  }
}

/** Whether a cart is loaded now (on the way to the gate, or unloading there). */
const cartFull = (a: Activity): boolean => a.kind === 'unload' || (a.kind === 'walk' && a.then === 'unload');

// ── wanderers ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A wanderer picks its next open goal and starts toward it (this tick); rests again when none is open. */
function depart(ctx: AgentContext, pool: AgentPool, agent: Agent, t: number): void {
  const { goals } = agent;
  const { graph } = pool;
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
  goTo(ctx, pool, agent, target, 'rest', 0, t);
}

function wanderTick(ctx: AgentContext, pool: AgentPool, agent: Agent, t: number): void {
  const a = agent.activity;
  const spawn = agent.spawn;
  const door = spawn.routine === 'wander' && !workingHours(ctx.minutes) ? spawn.indoors : undefined;
  if (a.kind === 'indoors') {
    if (door === undefined) rest(agent, restTicks(spawn));
    else agent.animTicks += 1;
  } else if (door !== undefined && !(a.kind === 'walk' && a.then === 'indoors')) {
    // After hours a wanderer with a door goes in (few walkers at night, art-director M2-18).
    goTo(ctx, pool, agent, door, 'indoors', 0, t);
  } else if (a.kind === 'walk') {
    walk(ctx, pool, agent, t);
  } else if (a.kind === 'rest' && a.ticksLeft <= 0) {
    depart(ctx, pool, agent, t);
  } else {
    if (a.kind === 'rest') a.ticksLeft -= 1;
    agent.animTicks += 1;
  }
}

/** One tick of `agent`; `t` = the pool's clock at this tick (the drill). */
function tick(ctx: AgentContext, pool: AgentPool, agent: Agent, t: number): void {
  const spawn = agent.spawn;
  if (spawn.routine === 'villager') villagerTick(ctx, pool, agent, spawn, t);
  else if (spawn.routine === 'cart') cartTick(ctx, pool, agent, spawn, t);
  else if (spawn.routine === 'cossack') cossackTick(ctx, pool, agent, spawn, t);
  else wanderTick(ctx, pool, agent, t);
}

/** Steps every agent of `pool` by `ticks` fixed steps, in place; `pool.done` then holds that step's finished work. */
export function stepInPlace(pool: AgentPool, ticks: number, ctx: AgentContext): void {
  pool.done.count = 0;
  // People step on their own (each reads only itself and the clock); the carts tick together, tick by tick.
  for (const agent of pool.agents) {
    if (agent.spawn.routine === 'cart') continue;
    for (let i = 0; i < ticks; i++) tick(ctx, pool, agent, pool.ticks + i);
  }
  const carts = cartCount(pool);
  if (carts > 0) for (let i = 0; i < ticks; i++) cartsTick(ctx, pool, carts, pool.ticks + i);
  pool.ticks += ticks;
}

/**
 * Puts an agent where the hour finds it: a villager at its night place, at an open work spot, at a chat spot, or idle
 * at home; a Cossack at his duty (`placeCossack`); a wanderer with a door indoors after hours (else it stays at home).
 */
function place(ctx: AgentContext, pool: AgentPool, agent: Agent): void {
  const spawn = agent.spawn;
  const { graph } = pool;
  const at = (id: string, dx: number): void => {
    atNode(graph, agent, id, dx);
  };
  if (spawn.routine === 'cossack') {
    placeCossack(ctx, pool, agent, spawn, pool.ticks);
    return;
  }
  if (spawn.routine === 'cart') {
    at(spawn.depot.at, spawn.depot.dx);
    setActivity(agent, { kind: 'depot' });
    return;
  }
  const night = !workingHours(ctx.minutes);
  if (spawn.routine === 'wander') {
    if (night && spawn.indoors !== undefined) {
      at(spawn.indoors, 0);
      arrive(ctx, pool, agent, 'indoors', pool.ticks);
    }
    return;
  }
  if (night) {
    const n = nightPlace(ctx, graph, spawn);
    at(n.at, n.dx);
    arrive(ctx, pool, agent, n.then, pool.ticks);
    return;
  }
  const work = pick(agent, openOf(ctx, graph, spawn.work));
  const talk = work === undefined ? pick(agent, openOf(ctx, graph, spawn.chat)) : undefined;
  if (work !== undefined) {
    at(work, 0);
    arrive(ctx, pool, agent, 'work', pool.ticks);
    // Part way through its spell, so the village does not down tools at once.
    const a = agent.activity;
    if (a.kind === 'work') a.ticksLeft = Math.floor(roll(agent) * a.ticksLeft);
  } else if (talk !== undefined) {
    at(talk, agent.offset);
    arrive(ctx, pool, agent, 'chat', pool.ticks);
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
 * The pool for `spawns` on `graph` at the context `ctx` (the hour, the buildings and the army of the first frame):
 * spawns past a role's budget (plan Q11) are left out (the first ones in order are kept); a wanderer starts at its home
 * and keeps only the goals it can reach from there, a villager or a Cossack starts where the hour finds it; each is run
 * `phase` s ahead. `seed` seeds every agent. A spawn whose home is unknown or closed to its role is a content bug: it
 * throws.
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
    ticks: 0,
    carts: { next: null, turn: 0 },
  };
  let enlist = 0;
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
      offset: spawn.routine === 'wander' || spawn.routine === 'cart' ? 0 : spotOffset(i),
      enlist: spawn.routine === 'cossack' ? enlist++ : -1,
      reviewed: -1,
      at: home.id,
      goal: -1,
      x: home.x,
      y: home.ground,
      facing: 1,
      activity: still ? { kind: 'stand' } : { kind: 'rest', ticksLeft: 0 },
      animTicks: 0,
      rng: (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0,
    };
    if (!still) place(ctx, pool, agent);
    for (let k = 0; k < Math.round(spawn.phase * TICK_HZ); k++) tick(ctx, pool, agent, k);
    pool.agents.push(agent);
  }
  // The carts run their history before the pool's clock starts (ticks −warm … −1): the first frame finds them on the
  // road.
  const carts = cartCount(pool);
  const warm = Math.round(CART_TRIP.warmS * TICK_HZ);
  if (carts > 0) for (let k = 0; k < warm; k++) cartsTick(ctx, pool, carts, k - warm);
  // Work finished while running agents ahead is not news.
  pool.done.count = 0;
  return pool;
}

/** A deep enough copy that stepping it leaves `pool` untouched. */
export const clonePool = (pool: AgentPool): AgentPool => ({
  graph: pool.graph,
  agents: pool.agents.map((a) => ({ ...a, activity: { ...a.activity } })),
  done: { count: pool.done.count, slots: pool.done.slots.map((s) => ({ ...s })) },
  ticks: pool.ticks,
  carts: { ...pool.carts },
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

/** The animation an activity shows (`t` = the pool's clock: the drill) and the ticks its frames count from. */
function animOf(a: Activity, animTicks: number, t: number): { readonly anim: PersonAnim; readonly ticks: number } {
  switch (a.kind) {
    case 'walk':
      return { anim: a.gait, ticks: animTicks };
    case 'work':
      return { anim: a.anim, ticks: animTicks };
    case 'chat':
      return { anim: 'talk', ticks: animTicks };
    case 'night':
    case 'post':
      return { anim: a.anim, ticks: animTicks };
    case 'rank':
      return { anim: RANK_ANIM[drillPhase(t)], ticks: drillAt(t, 'ticks') };
    case 'lead':
      return drillPhase(t) === 'speak'
        ? { anim: 'speak', ticks: drillAt(t, 'ticks') }
        : { anim: 'idle', ticks: animTicks };
    default:
      return { anim: 'idle', ticks: animTicks };
  }
}

/** Whether `sprite` has frames for `anim` (each family its own set beyond walk/idle). */
function hasFrames(sprite: AgentSprite, anim: PersonAnim): boolean {
  if (anim === 'walk' || anim === 'idle') return true;
  if (isVillagerSprite(sprite)) return isVillagerAnim(anim);
  if (isKozakSprite(sprite)) return isCossackAnim(anim);
  if (isOtamanSprite(sprite)) return isOtamanAnim(anim);
  if (isGuardSprite(sprite)) return isGuardAnim(anim);
  return false;
}

function writePose(a: Agent, slot: PoseSlot, t: number): void {
  const { anim, ticks } = animOf(a.activity, a.animTicks, t);
  // Each routine reaches only its sprites' animations (content); a broken pairing is a bug, never a missing frame.
  if (!hasFrames(a.sprite, anim)) throw new Error(`agent ${String(a.id)}: ${a.sprite} has no "${anim}" frames`);
  slot.id = a.id;
  slot.x = Math.round(a.x);
  slot.ground = Math.round(a.y);
  slot.facing = a.facing;
  const { frames, fps } = personAnim(anim);
  slot.frame = cycleFrame(ticks, fps, frames);
  slot.sprite = a.sprite;
  // `hasFrames` above checked the pairing the `Look` union describes.
  slot.anim = anim;
}

/** A cart's driver's pose id: negative, so it never meets an agent's (spawn index) id. */
export const driverId = (cartId: number): number => -1 - cartId;

/**
 * A cart's two poses (M2-20): the cart, drawn in the direction of its load (full east, empty west — `facing` stays 1,
 * never mirrored), and its driver at the oxen's left shoulder (`CART_TRIP.driver`), walking or standing with them.
 */
function writeCart(a: Agent, spawn: CartSpawn, cart: PoseSlot, driver: PoseSlot): void {
  const full = cartFull(a.activity);
  const dir = full ? 1 : -1;
  const anim = a.activity.kind === 'walk' ? 'walk' : 'idle';
  const { frames, fps } = personAnim(anim);
  const frame = cycleFrame(a.animTicks, fps, frames);
  cart.id = a.id;
  cart.x = Math.round(a.x);
  cart.ground = Math.round(a.y) + (full ? 0 : CART_TRIP.lane);
  cart.facing = 1;
  cart.frame = frame;
  cart.sprite = full ? 'viz.full' : 'viz.empty';
  cart.anim = anim;
  driver.id = driverId(a.id);
  driver.x = cart.x + dir * CART_TRIP.driver.ahead;
  driver.ground = cart.ground - dir * CART_TRIP.driver.aside;
  driver.facing = dir;
  driver.frame = frame;
  driver.sprite = spawn.driver;
  driver.anim = anim;
}

const emptySlot = (): PoseSlot => ({ id: -1, sprite: 'kozak.a', x: 0, ground: 0, facing: 1, anim: 'idle', frame: 0 });

/** Whether an agent is out of sight: gone indoors, or a Cossack the army does not have. */
const unseen = (a: Agent): boolean =>
  a.activity.kind === 'indoors' || a.activity.kind === 'absent' || a.activity.kind === 'depot';

/**
 * Writes whole-px poses into `out` (slots reused) and returns it: one per agent in sight, in pool order — an agent
 * indoors or absent has none (layers drop its sprite by id and make it again when it comes out).
 */
export function writePoses(pool: AgentPool, out: PoseSlot[]): readonly AgentPose[] {
  let n = 0;
  for (const a of pool.agents) {
    if (unseen(a)) continue;
    const slot = out[n] ?? emptySlot();
    out[n] = slot;
    n += 1;
    if (a.spawn.routine === 'cart') {
      const driver = out[n] ?? emptySlot();
      out[n] = driver;
      n += 1;
      writeCart(a, a.spawn, slot, driver);
    } else {
      writePose(a, slot, pool.ticks);
    }
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

/** Agents on the scene by role (`__CK__.stats.agents`): a Cossack the army does not have is not counted. */
export function agentCounts(pool: AgentPool): AgentCounts {
  const counts = { total: 0, villager: 0, cossack: 0, visitor: 0, cart: 0 };
  for (const a of pool.agents) {
    if (a.activity.kind === 'absent' || a.activity.kind === 'depot') continue;
    counts.total += 1;
    counts[a.role] += 1;
  }
  return counts;
}
