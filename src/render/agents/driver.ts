// Drives the agent pool from the render clock (plan M2-16). Each frame steps the pool, in place, by the whole ticks the
// clock moved (round(seconds × TICK_HZ)), so the poses are a function of (seed, pool ticks) only. A frozen clock
// (`?freeze=<s>`) has no step cap: its one jump is stepped in full, so that frame is exactly a run of round(s × 60)
// ticks. A live clock steps at most `MAX_CATCH_UP_S` per frame and drops the rest of a longer gap (a hidden tab, a
// debugger pause): cosmetic people need no history, and a resumed tab must not stall on minutes of ticks.
// `crew(building)` tells the build fx whether a scaffold's builders are there (M2-29 D).
// `ticks()` reports the pool's own ticks (skipped time excluded).
import {
  agentCounts,
  assignCrews,
  crewState,
  stepInPlace,
  TICK_HZ,
  workingCount,
  writePoses,
  type AgentContext,
  type AgentCounts,
  type AgentPool,
  type AgentPose,
  type PoseSlot,
  type WorkDoneLog,
} from './sim.ts';
import type { NodeBuilding } from '../../content/agents.ts';

/** Longest stretch a live clock steps in one frame (s); the rest of a longer gap is skipped. */
export const MAX_CATCH_UP_S = 3;

/** Ticks one `advance` may step: all of them for a frozen clock, else `MAX_CATCH_UP_S` worth. */
export const stepCap = (frozen: boolean): number => (frozen ? Infinity : MAX_CATCH_UP_S * TICK_HZ);

export interface AgentDriver {
  /**
   * Steps the pool to the clock's `seconds` (at most `cap` ticks); a clock that went back is ignored. The first call
   * makes the pool with that frame's context, so the people start where its hour and its buildings put them.
   */
  advance(seconds: number, ctx: AgentContext): void;
  /** This frame's poses (the array and its slots are reused frame to frame); none before the first `advance`. */
  poses(): readonly AgentPose[];
  /** The work spells finished by the last `advance` (the log is reused; empty when it stepped nothing). */
  done(): WorkDoneLog;
  counts(): AgentCounts;
  /** Villagers at a work spot now (debug stats). */
  working(): number;
  /** Ticks the pool has been stepped (skipped time excluded). */
  ticks(): number;
  /** The builders of a scaffold (M2-29 D, `crewState`); `none` before the pool exists. */
  crew(building: NodeBuilding): 'none' | 'coming' | 'ready';
}

const NO_COUNTS: AgentCounts = { total: 0, villager: 0, cossack: 0, visitor: 0, cart: 0 };
const NO_DONE: WorkDoneLog = { count: 0, slots: [] };

/** Makes its pool with `make` on the first `advance` and owns it (it is stepped in place). */
export function createAgentDriver(make: (ctx: AgentContext) => AgentPool, cap: number): AgentDriver {
  let pool: AgentPool | null = null;
  let clockTicks = 0;
  let poolTicks = 0;
  const slots: PoseSlot[] = [];
  let poses: readonly AgentPose[] = [];
  return {
    advance: (seconds, ctx) => {
      const target = Math.round(seconds * TICK_HZ);
      if (!pool) {
        pool = make(ctx);
        poses = writePoses(pool, slots);
      }
      pool.done.count = 0;
      // A scaffold put up this frame gets its builders even when no tick is due (else it reads `none` and starts).
      assignCrews(ctx, pool);
      if (target <= clockTicks) return;
      const n = Math.min(target - clockTicks, cap);
      clockTicks = target;
      stepInPlace(pool, n, ctx);
      poolTicks += n;
      poses = writePoses(pool, slots);
    },
    poses: () => poses,
    done: () => pool?.done ?? NO_DONE,
    counts: () => (pool ? agentCounts(pool) : NO_COUNTS),
    working: () => (pool ? workingCount(pool) : 0),
    ticks: () => poolTicks,
    crew: (building) => (pool ? crewState(pool, building) : 'none'),
  };
}
