---
paths:
  - "src/core/**"
---
# Core rules — SPEC §0, §3, §9

- Pure TypeScript. No imports from `render/`, `ui/`, `platform/`, `audio/`, `i18n/`, Pixi, React, Capacitor (hook `core-purity.mjs` warns; ESLint enforces after M0).
- Deterministic: time enters only as a `now: number` (ms) argument; randomness only from `core/rng.ts` (mulberry32) with the seed/cursor stored in `GameState`. Same state + same inputs → same output.
- One way to advance time: `advance(state, now)` is analytic and valid for any gap (0.1 s tick or 8 h offline). `tick`, `applyOffline` and `resume` (first tick after a return or a load) are thin callers of it — this is what makes the offline-equivalence test hold (SPEC §12.1, ADR 002 am. 3–4). `lastSeen` never moves back.
- Time-varying mechanics (wind, weather, salt price, pasture, events) are pure functions of `(seed, absoluteTime)`, so offline integrates them piecewise without step simulation.
- Random outcomes the player could re-roll by reloading (raid success, loot, stork reward) are rolled **once at start** and stored in state.
- Actions are pure `(state, payload, now) => state'` reducers in `actions.ts`; invalid preconditions return the unchanged state plus a rejected event — never throw for player errors.
- Store emits typed domain events (`BuildingUpgraded`, `TierReached`, `RaidReturned`, …) as a discriminated union of plain data.
- Scaling numbers use `Big` (wrapper over `break_eternity.js`); never mix raw `number` arithmetic with `Big` values. `Big` serializes to a string in saves.
- No magic numbers: formulas take constants from `src/content/`. A literal other than 0/1/unit conversion needs a content key.
- Every buff is a `ModSource` of `modifierSources(state)`, folded by `collectModifiers`/`steadyModifiers`; systems never derive a buff from culture/heroes/relics/buff buildings themselves, and never add a share outside the list (the UI breakdown reads the same list and would lie).
- Source order is part of the result (float sums): append a new source kind after the existing ones, or the fold stops matching the old per-system sums.
- Illegal states unrepresentable: `ActiveRaid` as a union of `running | returned`, weather as a union, etc.
- Relative imports end in `.ts` (Node runs core directly: `node tools/hello-core.ts`).

## Time and actions
- An action acts at `lastSeen` after `advance` (`at` in `applyAction`), never the raw `now`: a clock behind would store times before `created` and the save gate would refuse the game's own save. An action never integrates a gap itself (the store ticks first).
- `resume(state, now)` is the only path that reports `clockBack`; 10 Hz ticks stay quiet while the clock is behind.
- `integrate` is income only (capped offline). Anything that must reach the real `now` past the cap (raid returns) runs after it, like `returnRaids` in `advance`/`applyOffline`.
- Time alone never emits level/tier events: `TierReached` comes only from buy actions.
- Rewards use `steadyModifiers` (no wind of the moment), so online = offline. The glory cap (`gloryCapSec`) bounds only passive/offline accrual; grants from beats, quests and raid claims go straight in.

## State invariants
- `validateState` does not enforce derived invariants — formulas must not assume them. It drops unknown `story.seen` ids (rename-safe).
- Quest completion is derived (level ≥, or `stats[stat] − base ≥ n`), never stored. The quest day is monotone (`max(stored, now)`): clock back or a westward zone gives no new day.
- `raids.slots` length is frozen in the save shape (`V4_RAID_SLOTS` 3): changing `RAIDS.maxSlots` needs a migration. The v4 gate wants `returnAt = startedAt + duration` exactly — widen it when `raidTimeMult` is applied (M4).
- The raid gate bounds `pity` by `pityThreshold(found + relics in slots)`, not `relics.length`. A running slot's view shows no chance (the roll stores only `success`).
- Treasury levels raise raid loot twice (defence → income, and `lootMult`): isolate the loot share with `lootOf(sameState, tier, 1)`.

## Seeded picks (frozen)
- `hash32` values, `VARIANT_SALT`, plot-variant `key`s, chore/visitor salts are pinned by golden tests: changing them reshuffles saved schedules.
- `pickStable` options may grow, never shrink. Chores: the first `CHORES.moduloCount` (8) keep the modulo pick; every appended chore joins by the reservoir step (`nextChore`) — never widen the modulo set.
- `choreSystems` offers raid chores only when `raidReady` (no chore skip exists — never offer one the player cannot begin).
- `core/systems/visitors.ts` is imported by nothing else in core (test).
