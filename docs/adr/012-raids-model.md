# 012. Raids: army snapshot, roll at start, `returnAt` breakpoint, board as a pure function

- Status: Accepted (M3 plan `docs/plans/2026-11-23-m3-army.md` approved by the owner 2026-11-24, Q1–Q21 at the recommended defaults)
- Amended by [ADR 013](013-culture-heroes-modifier-sources.md) (2026-11-27): M4 adds no raid slot (Чайки move to «Військова справа», M10+), and raid time is fixed at start within `[ceil(dur × minTimeMult), dur]` instead of exactly `dur`.
- Date: 2026-11-24

## Context
- SPEC §3.4 asks for 2 raid slots, durations 5 min … 8 h, `successChance = clamp(ArmyPower / P, 0.35, 1)` rolled once at start (no save-scum), failure = 30 % loot and never 0, relics as a collection; §2.6 a daily raid board with one «rumour»; §3.8 timers on absolute timestamps; §14 M3: «start, close the game, come back and claim; the result does not change on reload».
- ADR 002: core is pure, one analytic `advance(state, now)` for online and offline; online = offline (equivalence test). Offline income is capped (`offlineCapSec`), clock back gives nothing, `lastSeen` never moves back.
- ADR 009: variety only from seed + time; no stored state that changes with time unless it is a one-off roll.
- Owner's standing requirement: take the genre's best practices and do them better (plan §0.1) — honest previews, no punishing loss, no chore loop.

## Decision
- **Army is a snapshot, not a resource (Q1, Q2).** `startRaid` reads `ArmyPower` at start; the army stays home in the economy (passive glory, the other slot's power unchanged). No casualties. Only the render shows a squad leaving (cosmetic, from the agents already on the scene).
- **Everything random is rolled at start and stored (Q4).** `startRaid { slot, tier }` draws from `state.rng`: success, pysanky, relic; loot in `Big` is computed at the same moment from `steadyModifiers` (no wind of the moment). The result lives in `RaidRoll` inside the slot. Consequences: reload, offline and tick order cannot change it; the pre-start card (`previewRaid`) equals what `claimRaid` grants; purchases during the raid do not change the loot. The UI selector for a running slot does not expose `success` (the reveal stays a reveal).
- **Slot state is a discriminated union in a fixed-length array.** `RaidSlot = idle | running { raid } | returned { raid }`, `raids.slots.length = RAIDS.maxSlots` (3); open slots are derived (`openSlots` = 2 in M3; heroes/culture M4, legacy tree M5, pysanky M8b add without a save bump). A slot past the open count must be `idle` (`validateState`).
- **`returnAt` is a breakpoint, not a rate change.** `advance` splits at every `returnAt ∈ (lastSeen, now]` → `running → returned` + `RaidReturned`. Raids do not change any rate, so the income integral is unchanged; the split exists for the event and the state transition only. Ticks of 0.1 s = one `advance` = `applyOffline` (same event, same slot).
- **Offline finishes raids to the real `now`.** `applyOffline` integrates income to `lastSeen + eff` (cap) but completes raids up to the real `now`: raid timers have no offline cap. Clock back (`now ≤ lastSeen`) completes or cancels nothing. A forward jump completes raids (Q8, same policy as chore days §3.9). `RaidReturned` may come from time; `RaidClaimed` / `RelicFound` only from an action. Claim is manual (Q9); a returned raid waits forever.
- **The board is a pure function, not state.** `raidBoard(seed, day)` = one offer per duration tier, region via `pickStable(hash32(seed, BOARD.salt), day)` (salt frozen, golden test); one offer of the day is the rumour. Day = `dayAt(maxSeen, tzOffsetMin)` (monotonic, §3.9). The only stored board state is `raids.rumorDay` (rumour used on the first start of the day). A day change never touches running or returned raids. Offers may be repeated without limit (Q3).
- **Relics: no duplicates, deterministic pity (Q5).** The relic roll draws only among unfound relics of the land; when all are found the relic chance becomes a pysanky chance. `raids.pity` counts successful rolls of tier ≥ `RELICS.pityMinTier` (30 min) without a relic; at `pityThreshold(found)` (content `RELICS.pityAt` = [4, 6]: 4 for the first relic, then 6; last entry repeats) a success guarantees one; a failure does not move it; a find resets it (Q16: pity covers every relic). Relic and pysanky chances are clamped to `min(1, …)` after multipliers. Relic effects only via `collectModifiers` (`powerMult`, `lootMult`, `relicChanceMult`).
- **Save v4** (`003-v3-to-v4.ts`): `raids { slots, rumorDay, pity }`, `relics`, `stats.raidsSent/Done/Won`; migration: all idle, `rumorDay` −1, `pity` 0, counters 0, chain step `raid1` inserted after `hire1` (Q7: later indices shift by one, step met silently). Fixture `v4.json`.
- **Notifications hook only.** Pure `raidAlerts(state)` (returns within 30 min merged); the platform reschedules through `NotificationService` (mock in M3; real plugin and permission prompt M6/M9).

## Alternatives considered
- Roll at return / on claim — reload or offline order could change the outcome (save-scum, SPEC B-03); loot would depend on purchases made during the raid.
- Army leaves the economy while away — offline becomes piecewise in the army count, slots stop being equal, and the passive glory rate jumps on every start/return; no gameplay gain worth the complexity (Q1).
- Raid timers capped by the offline limit — a raid started before an 8-h night would be «stuck»; players read it as a bug.
- Stored board (offers in state) — needs a refresh rule, migration per change, and invites expiry pressure; the pure function gives the same board for free (ADR 009).
- `slots: (ActiveRaid | null)[]` + `unlockedSlots` (SPEC v1 sketch) — `null` cannot tell running from returned; `unlockedSlots` duplicates a derived value.

## Consequences
- Positive: the result is a function of the state at start (unit + e2e testable); online = offline holds by construction; the preview is honest (shown = granted); no new time-varying state beyond one-off rolls; opening a 3rd slot later is content, not a save bump.
- Negative / trade-offs: the roll is readable in an exported save (single-player, accepted, §9.5); a forward clock jump completes raids and their rare pysanky (accepted until the M8b pysanky-in-export decision); the chain list is no longer strictly append-only (one insert at `raid1`, handled by the v4 migration).
- Follow-ups: ads speed-up/×2 (M8a) apply to `returnAt`/loot of a stored roll without re-rolling; `raidTimeMult` (Характерник, M4) applies at start only; sea raids (land 3) reuse the slot union with their own tiers.
