---
paths:
  - "src/core/**"
---
# Core rules — SPEC §0, §3, §9

- Pure TypeScript. No imports from `render/`, `ui/`, `platform/`, `audio/`, `i18n/`, Pixi, React, Capacitor (hook `core-purity.mjs` warns; ESLint enforces after M0).
- Deterministic: time enters only as a `now: number` (ms) argument; randomness only from `core/rng.ts` (mulberry32) with the seed/cursor stored in `GameState`. Same state + same inputs → same output.
- One way to advance time: `advance(state, dtSec, now)` is analytic and valid for any `dt` (0.1 s tick or 8 h offline). `tick` and `applyOffline` are thin callers of it — this is what makes the offline-equivalence test hold (SPEC §12.1).
- Time-varying mechanics (wind, weather, salt price, pasture, events) are pure functions of `(seed, absoluteTime)`, so offline integrates them piecewise without step simulation.
- Random outcomes the player could re-roll by reloading (raid success, loot, stork reward) are rolled **once at start** and stored in state.
- Actions are pure `(state, payload, now) => state'` reducers in `actions.ts`; invalid preconditions return the unchanged state plus a rejected event — never throw for player errors.
- Store emits typed domain events (`BuildingUpgraded`, `TierReached`, `RaidReturned`, …) as a discriminated union of plain data.
- Scaling numbers use `Big` (wrapper over `break_eternity.js`); never mix raw `number` arithmetic with `Big` values. `Big` serializes to a string in saves.
- No magic numbers: formulas take constants from `src/content/`. A literal other than 0/1/unit conversion needs a content key.
- Every buff flows through `collectModifiers(state, now)`; systems never read culture/heroes/relics directly.
- Illegal states unrepresentable: `ActiveRaid` as a union of `running | returned`, weather as a union, etc.
