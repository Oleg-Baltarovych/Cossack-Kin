// Quality auto-detect (plan ART-18, SPEC §12.4). Pure: frame times are passed in. The App feeds every frame's
// timestamp until the probe has a verdict, then applies the tier once (no oscillation between tiers).
import { AUTO_QUALITY } from './atmosphere/config.ts';
import type { Quality } from './settings.ts';

/** The tier for a measured mean fps. */
export function pickTier(fps: number): Quality {
  return fps >= AUTO_QUALITY.high ? 'high' : fps < AUTO_QUALITY.low ? 'low' : 'med';
}

export interface FpsProbe {
  /** Records a frame at `nowMs`. */
  sample(nowMs: number): void;
  /** The picked tier once warm-up + window have passed, else `null`. */
  verdict(): Quality | null;
}

export function createFpsProbe(): FpsProbe {
  let start: number | null = null;
  let windowStart: number | null = null;
  let frames = 0;
  let last: number | null = null;
  let result: Quality | null = null;
  return {
    sample(nowMs) {
      if (result) return;
      if (last !== null && nowMs - last > AUTO_QUALITY.maxGapMs) {
        // rAF stopped (hidden tab, paused webview): measure again from scratch.
        start = null;
        windowStart = null;
        frames = 0;
      }
      last = nowMs;
      start ??= nowMs;
      const t = (nowMs - start) / 1000;
      if (t < AUTO_QUALITY.warmup) return;
      if (windowStart === null) {
        windowStart = nowMs;
        return;
      }
      frames += 1;
      const elapsed = (nowMs - windowStart) / 1000;
      if (elapsed >= AUTO_QUALITY.window) result = pickTier(frames / elapsed);
    },
    verdict: () => result,
  };
}
