// Drives the agent pool from the render clock (plan M2-16). Each frame steps the pool, in place, by the whole ticks the
// clock moved (round(seconds × TICK_HZ)), so the poses are a function of (seed, pool ticks) only. A frozen clock
// (`?freeze=<s>`) has no step cap: its one jump is stepped in full, so that frame is exactly a run of round(s × 60)
// ticks. A live clock steps at most `MAX_CATCH_UP_S` per frame and drops the rest of a longer gap (a hidden tab, a
// debugger pause): cosmetic people need no history, and a resumed tab must not stall on minutes of ticks.
// `ticks()` reports the pool's own ticks (skipped time excluded).
import {
  agentCounts,
  stepInPlace,
  TICK_HZ,
  writePoses,
  type AgentContext,
  type AgentCounts,
  type AgentPool,
  type AgentPose,
  type PoseSlot,
} from './sim.ts';

/** Longest stretch a live clock steps in one frame (s); the rest of a longer gap is skipped. */
export const MAX_CATCH_UP_S = 3;

/** Ticks one `advance` may step: all of them for a frozen clock, else `MAX_CATCH_UP_S` worth. */
export const stepCap = (frozen: boolean): number => (frozen ? Infinity : MAX_CATCH_UP_S * TICK_HZ);

export interface AgentDriver {
  /** Steps the pool to the clock's `seconds` (at most `cap` ticks); a clock that went back is ignored. */
  advance(seconds: number, ctx: AgentContext): void;
  /** This frame's poses (the array and its slots are reused frame to frame). */
  poses(): readonly AgentPose[];
  counts(): AgentCounts;
  /** Ticks the pool has been stepped (skipped time excluded). */
  ticks(): number;
}

/** Takes ownership of `pool` (it is stepped in place). */
export function createAgentDriver(pool: AgentPool, cap: number): AgentDriver {
  let clockTicks = 0;
  let poolTicks = 0;
  const slots: PoseSlot[] = [];
  let poses = writePoses(pool, slots);
  return {
    advance: (seconds, ctx) => {
      const target = Math.round(seconds * TICK_HZ);
      if (target <= clockTicks) return;
      const n = Math.min(target - clockTicks, cap);
      clockTicks = target;
      stepInPlace(pool, n, ctx);
      poolTicks += n;
      poses = writePoses(pool, slots);
    },
    poses: () => poses,
    counts: () => agentCounts(pool),
    ticks: () => poolTicks,
  };
}
