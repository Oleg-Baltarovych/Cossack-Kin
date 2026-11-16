// Render clock (plan M0-05): animation time is real or pinned (screenshots), time of day is the
// player's local time or pinned. Cosmetic randomness comes from a seeded RNG so frozen frames repeat.
// Time sources are injected; render code passes `performance.now` and `new Date()`.

export interface RenderClock {
  /** `true` when animation time is pinned. */
  readonly frozen: boolean;
  /** Animation time in seconds (since clock creation, or the pinned value). */
  seconds(): number;
  /** Time of day in minutes after midnight, fractional. */
  minutesOfDay(): number;
}

export interface ClockOptions {
  readonly frozenAt: number | null;
  readonly fixedMinutes: number | null;
  /** Monotonic milliseconds. */
  readonly nowMs: () => number;
  /** Local time of day in minutes. */
  readonly localMinutes: () => number;
}

export function createClock({ frozenAt, fixedMinutes, nowMs, localMinutes }: ClockOptions): RenderClock {
  const startMs = nowMs();
  return {
    frozen: frozenAt !== null,
    seconds: frozenAt === null ? () => (nowMs() - startMs) / 1000 : () => frozenAt,
    minutesOfDay: fixedMinutes === null ? localMinutes : () => fixedMinutes,
  };
}

export function realLocalMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** mulberry32: small, fast, deterministic. Cosmetic use only (never game state). */
export function createCosmeticRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
