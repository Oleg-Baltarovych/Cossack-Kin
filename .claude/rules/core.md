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
- Every buff is a `ModSource` of `modifierSources(state)`, folded by `collectModifiers`/`steadyModifiers`; systems never derive a buff from culture/heroes/relics/buff buildings themselves, and never add a share outside the list (the UI breakdown reads the same list and would lie). One exception: a raid's own rumour share, added to its offer in `systems/raids.ts` (bound to the offer, not to the state).
- A purchase preview («зараз → після», `culture-selectors.ts`) measures the state the action would leave through the HUD's own functions (`meter`), never `perRank` × a field by hand; a new effect kind needs its `KIND_UNIT`/`KIND_METRIC` row.
- Source order changes the fold only by float epsilon, and it is deterministic: append new source kinds last so existing exact snapshots keep holding.
- Illegal states unrepresentable: `ActiveRaid` as a union of `running | returned`, weather as a union, etc.
- Relative imports end in `.ts` (Node runs core directly: `node tools/hello-core.ts`).

## Time and actions
- An action acts at `lastSeen` after `advance` (`at` in `applyAction`), never the raw `now`: a clock behind would store times before `created` and the save gate would refuse the game's own save. An action never integrates a gap itself (the store ticks first).
- `resume(state, now)` is the only path that reports `clockBack`; 10 Hz ticks stay quiet while the clock is behind.
- `integrate` is income only (capped offline). Anything that must reach the real `now` past the cap (raid returns) runs after it, like `returnRaids` in `advance`/`applyOffline`.
- Time alone never emits level/tier events: `TierReached` comes only from buy actions; `CultureBought`/`HeroLevelled` only from `buyCulture`/`levelHero`.
- A hero changes rates from his arrival on, and `advance` integrates rates fixed for the whole gap: a hero beat's trigger kind must be one an action meets — today `building`, `sich`, `hired` (the whitelist of the content test in `tests/unit/content/story.test.ts`) — never one time meets (storms, bloom, a raid return). A new action-raised kind (M4-08 `raidsWon`, raised by `claimRaid`) joins `StoryTrigger` and that whitelist together.
- Rewards use `steadyModifiers` (no wind of the moment), so online = offline. The glory cap (`gloryCapSec`) bounds only passive/offline accrual; grants from beats, quests and raid claims go straight in.

## State invariants
- `validateState` does not enforce derived invariants — formulas must not assume them. It drops unknown `story.seen`, `culture` and `heroes` ids (rename-safe); a stored rank/level is 1…max (0 is never stored: missing = 0 / not arrived); a stored hero needs his unlock beat in `story.seen`. A crafted rank in a closed branch still passes the gate, so modifier sources must count only open branches and arrived heroes. Read them through `cultureNodeOpen` / `heroLevel` (modifiers.ts), never `state.heroes[id]` raw. A stored rank with unmet prerequisites in an open branch is tolerated and counts: only `buyCulture` enforces prerequisites (play cannot reach such a rank). Migrations never read live beats/heroes (`004` pins `V4_HERO_BEATS`).
- Quest completion is derived (level ≥, or `stats[stat] − base ≥ n`), never stored. The quest day is monotone (`max(stored, now)`): clock back or a westward zone gives no new day.
- `raids.slots` length is frozen in the save shape (`V4_RAID_SLOTS` 3): changing `RAIDS.maxSlots` needs a migration. The v5 gate takes `returnAt − startedAt ∈ [ceil(dur × RAIDS.minTimeMult), dur]`: apply `raidTimeMult` only at the start (M4-06) and keep every `raidTime` source within `1 − minTimeMult` (content test).
- A relic has a `minTier`: «left to find» is per tier (`unfound(held, tier)`); a tier with none left turns its relic chance into pysanky and does not count the pity, and the gate's 30-min pysanky rule checks only that tier's relics. Append relics only (the order is in every pick); tests that need «every relic found» use `RELIC_IDS`, never a hand list.
- The raid gate bounds `pity` by `pityThreshold(found + relics in slots)`, not `relics.length`. A running slot's view shows no chance (the roll stores only `success`).
- Treasury levels raise raid loot twice (defence → income, and `lootMult`): isolate the loot share with `lootOf(sameState, tier, 1)`.

## Seeded picks (frozen)
- `hash32` values, `VARIANT_SALT`, plot-variant `key`s, chore/visitor salts are pinned by golden tests: changing them reshuffles saved schedules.
- `pickStable` options may grow, never shrink. Chores: the first `CHORES.moduloCount` (8) keep the modulo pick; every appended chore joins by the reservoir step (`nextChore`) — never widen the modulo set.
- `choreSystems` offers raid chores only when `raidReady` (no chore skip exists — never offer one the player cannot begin).
- `core/systems/visitors.ts` is imported by nothing else in core (test).
