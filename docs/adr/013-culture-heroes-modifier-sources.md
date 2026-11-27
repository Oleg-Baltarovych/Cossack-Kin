# 013. Culture and heroes: glory-bought ranked nodes, heroes via beats, `modifierSources`, raid time fixed at start

- Status: Accepted (M4 plan `docs/plans/2026-11-27-m4-culture-heroes.md` approved by the owner 2026-11-27, Q1–Q16 at the recommended defaults)
- Date: 2026-11-27

## Context
- SPEC §3.5 asks for a culture tree (4 branches of 6–8 nodes, prerequisites, bought with glory) and collectible heroes with levels, levelled with glory; §14 M4: MVP branches «Музика» and «Звичаї», heroes Кошовий отаман, Кобзар, Характерник, `collectModifiers`; acceptance: «buffs are visible in UI hints and in numbers».
- SPEC §3.6: culture and heroes carry over the move to the next land; §4.3: no ads for culture or heroes.
- ADR 002: pure core, one analytic `advance`; online = offline. ADR 012: a raid's outcome is rolled and stored at start (preview = grant); the v4 gate checks `returnAt = startedAt + duration` exactly.
- §9.6: every buff goes through `collectModifiers`; inside a field sources add, fields multiply. Until M4 the UI had no way to say where a multiplier comes from.
- The owner's standing requirement: build each system from the genre's best practices and improve on them (plan §0.1). The typical weaknesses are a blind tree, fear of a wasted build, and a hidden stack of multipliers.

## Decision
- **Currency: glory (Q1).** No new currency. Culture and heroes compete with the Sich buildings for glory, and `pnpm balance` measures the split.
- **Culture = permanent ranked nodes, no respec (Q2).** A branch has 6 nodes: a root, two rows of 2 nodes, and a top node. A node needs any node of the row above at rank ≥ 1; the top node needs both nodes of row 3. Each node has ranks `1..maxRank` and costs `base × growth^rank × cultureCostMult` glory, one rank per action (`buyCulture`). No choice excludes another and every effect is positive, so there is nothing to undo: respec is not needed and does not exist. The whole tree is visible from the start, locked nodes included (effect + condition).
- **Branch and hero unlocks are derived, not stored.** «Музика» opens when the tavern reaches level 1. «Звичаї» opens with the church, the same trigger as the «Освячення Покрови» beat (Q4). A hero arrives through a story beat with the reward `{ kind: 'unlock'; hero }`: «Рада на майдані» brings the отаман, «Кобзар біля шинку» (tavern 10) the Кобзар, and a beat after 15 raids won the Характерник (Q4, Q5; 10 in the plan, 15 since M4-08 — the beat came at S5–S7 with 10). Arrival = level 1 for free (`HeroJoined`). Levels go to `levelMax` (25 in M4), with linear effects (`levelHero`, shared ×1/×10/×25/Max picker; Q6).
- **`modifierSources` is the single source for the engine and the UI.** `modifierSources(state): ModSource[]`, `ModSource = { field, source, share }` (source = Sich building, farm building, relic, culture node, hero, land passive, defence). `collectModifiers` / `steadyModifiers` fold it: `1 + Σ share` for a bonus, `1 − Σ share` for a reduction (the floor lives in content and a content test bounds it), then the wind of the moment. The UI breakdown (`modifierBreakdown(state, field)`) reads the same list, so «where this ×1.38 comes from» equals the number the economy uses, by construction (test: folded sources = field). Effects of locked branches and absent heroes do not count (like locked Sich buildings). One new field, `cultureCostMult`; every other M4 effect maps 1:1 onto an existing field. No cache until measurements need one.
- **Raid time is fixed at start (Q8).** `rollRaid` sets `returnAt = startedAt + ceil(durationMs × raidTimeMult)` (the same rounding as the gate, so a fresh raid always passes it) (steady modifiers) and stores it. Raids already on the road do not change when the Характерник levels up, and loot does not depend on duration. The save gate accepts `returnAt − startedAt ∈ [ceil(durationMs × RAIDS.minTimeMult), durationMs]` (`minTimeMult` 0.75). A content test keeps the maximum Σ of the `raidTime` sources ≤ 1 − `minTimeMult`.
- **Save v5, sparse records.** `culture: Partial<Record<CultureNodeId, number>>` and `heroes: Partial<Record<HeroId, number>>` (missing = 0 / not arrived; unknown id dropped, like `story.seen`), plus monotone `stats.cultureRanks` and `stats.heroLevels`. Later nodes and heroes need no bump. Migration `004-v4-to-v5.ts`: empty culture; a hero at level 1 for every unlock beat already seen (otherwise he could never arrive); one chain step `khortytsia.culture1` inserted after the tavern step with an `index` shift (Q12, like `raid1` in v4).
- **No raid slot from culture in M4 (Q9).** Чайки (+1 slot) belongs to «Військова справа» (M10+, land 3). A 3rd slot would also break the `raidActionsMax` 4 gate.

## Alternatives considered
- Respec, free or for pysanky: it only matters when choices exclude each other. Here it would add a sink with no decision behind it, and selling respec for pysanky would sell a convenience over power.
- Unlocks stored in state: a duplicate of derived facts (beats seen, levels). A stored flag can disagree with the trigger after a content change.
- Dense records keyed by every id (like `levels`): every new node or hero would need a version bump.
- A breakdown computed separately in the UI: two formulas drift apart; the hint would lie exactly when it matters.
- Applying `raidTimeMult` to running raids (retroactive): the countdown would jump, `returnAt` would no longer be stored truth, and the gate could not check it.
- Building Характерник and «Звичаї» now but unlocking them only in land 2 (SPEC §2.4 before M4): M4 could not be tested by play.

## Consequences
- Positive: every buff is explainable to the player and testable as a sum; culture/heroes are static modifiers (they change only by action), so `advance` needs no new breakpoints and offline equivalence holds; new content needs no save bump.
- Negative / trade-offs: glory split between the Sich (bloom needs Sich ≥ 25) and culture may move bloom, which M4-09 tunes. A third relic («Кобза діда») changes future relic rolls (golden tests updated on purpose). SPEC §2.4/§2.5 moves Характерник and «Звичаї» from land 2 to land 1, so land 2's «Вечорниці» beat needs another reward (M5).
- Follow-ups: hero price scaling across lands (M5; glory carries over); Колядки / Троїсті музики / daily Толока with seasons (M6) and «Ярмарковий день» (M8); the ad «halve the remaining time» (M8a) widens the raid-time gate again; 48×48 hero portraits (M9).
