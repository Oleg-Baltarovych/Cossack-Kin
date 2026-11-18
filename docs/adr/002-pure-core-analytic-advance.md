# 002. Pure deterministic core with one analytic `advance()`

- Status: Accepted
- Date: 2026-11-16

## Context
- Idle games live on offline progress. SPEC §3.8 originally computed offline as `incomeBase × time`, which ignores time-varying mechanics (wind, boosts, raids, water level, salt price) and breaks the offline-equivalence test (SPEC §12.1, review B-02).
- Balance must be simulated quickly for months of play (`pnpm balance`).

## Decision
- `src/core` is pure TypeScript: no DOM/Pixi/React/Capacitor, no clock reads, no `Math.random`. Time enters as `now`; randomness from a seeded RNG stored in state. Enforced by a hook now and ESLint after M0.
- One function `advance(state, dt, now)` integrates income **piecewise-analytically** between breakpoints (boost ends, raid returns, wind/weather/water/salt changes). `tick` (10 Hz) and offline both call it.
- Time-varying mechanics are pure functions of `(seed, time window)`; random outcomes the player could re-roll (raid success, loot) are rolled once at start and stored.
- All numbers live in `src/content/`; `balance-sim` drives the same core.

## Alternatives considered
- Step simulation offline — slow for 24 h, battery cost, rounding drift.
- Separate offline formula — two code paths that diverge (the original problem).

## Consequences
- Positive: online == offline by construction; fast balance simulation; easy tests.
- Negative / trade-offs: every new mechanic must be expressible as a schedule with breakpoints.
- Follow-ups: breakpoint scheduler and equivalence tests in M1.

## Amendment 3 (2026-11-18, M1-18 platform review): the clock never moves `lastSeen` back
- **Problem.** SPEC §3.8 said: if `now < lastSeen`, offline reward is 0 and `lastSeen` is updated (to `now`). With saves (M1-13) that is an exploit: set the clock 8 h back (0 earned, `lastSeen` lowered), set it back to the real time — an 8 h "absence" inside `maxSeen + 7 d` counts in full. Repeatable.
- **Decision (owner, 2026-11-18).** `lastSeen` is monotonic: `applyOffline` with `now < lastSeen` reports `clockBack` (0 earned) and keeps `lastSeen` and `maxSeen`. Time spent with the clock behind earns nothing until the clock passes `lastSeen` again (`advance` ignores `now ≤ lastSeen`).
- **`resume(state, now)`** (`core/offline.ts`, `store.resume`): the first tick of a returning page or a loaded save. Like `tick`, but a clock behind `lastSeen` by more than `onlineGapSec` goes to `applyOffline`, so the return window can say why nothing grew. Running 10 Hz ticks stay quiet while the clock is behind (the notice would otherwise repeat every tick). `platform/loop.ts` `start` calls `resume`; M1-13 calls it after a load.
- **Accepted:** stepping the clock forward by ≤ 7 d still gives the 8 h cap per step, after which `maxSeen` freezes the player until the real clock catches up (single-player; no server time in v1).
