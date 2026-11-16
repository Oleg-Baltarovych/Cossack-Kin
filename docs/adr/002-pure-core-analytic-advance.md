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
