// Rolling fps / CPU frame-time averages for the debug overlay (plan M0-06). Pure: time is passed in.

export interface FrameAverages {
  /** Frames per second over the last full window. */
  readonly fps: number;
  /** Mean CPU time per frame (ms) over the last full window. */
  readonly frameMs: number;
}

export interface FrameStats {
  /** Records one frame; returns `true` when a new average was published. */
  sample(nowMs: number, cpuMs: number): boolean;
  current(): FrameAverages;
}

export function createFrameStats(windowMs = 1000): FrameStats {
  let windowStart: number | null = null;
  let frames = 0;
  let cpuTotal = 0;
  let averages: FrameAverages = { fps: 0, frameMs: 0 };

  return {
    sample(nowMs, cpuMs) {
      if (windowStart === null) {
        windowStart = nowMs;
        return false;
      }
      frames += 1;
      cpuTotal += cpuMs;
      const elapsed = nowMs - windowStart;
      if (elapsed < windowMs) return false;
      averages = { fps: (frames * 1000) / elapsed, frameMs: cpuTotal / frames };
      windowStart = nowMs;
      frames = 0;
      cpuTotal = 0;
      return true;
    },
    current: () => averages,
  };
}
