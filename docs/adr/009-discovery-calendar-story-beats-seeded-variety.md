# 009. Discovery calendar, story beats and seeded variety as measured pacing

- Status: Accepted (owner 2026-11-19)
- Date: 2026-11-19

## Context
- The owner worries the game gets boring: one land is not enough, players need a steady feeling of progress and something new unlocking, and nobody should finish in a week (2026-11-19: «календар відкриттів і сюжетні віхи … різноманіття»).
- SPEC §2.3 only targeted totals (bloom 4–6 days, actions per session); nothing guaranteed that each session shows something new, and nothing measured it.
- The core is pure and analytic (ADR 002), there is no backend (ADR 003) and ads are rewarded-only (ADR 006), so variety cannot come from live ops, server events or paid timers.

## Decision
- **Novelty is a measured quantity.** A novelty = noticeable purchase (§12.3), story beat, mechanic step, system/land unlock. Targets live in `src/content/pacing.ts` (`novelty`, `calendar`): week 1 — at least one per session; after — at least one per day; each calendar entry in its session/day window. `pnpm balance --check` enforces only entries whose system already exists in the build (M1: buildings, tiers, Sich, hire, church, storms, bloom).
- **Discovery calendar (SPEC §2.4)** fixes the *order* of unlocks per land and maps each entry to its milestone; the *timing* is a balance output. Each land's unique mechanic opens in three steps so long late lands still have inner novelties.
- **Story beats (SPEC §2.5)** are content records in `src/content/story.ts` with a monotonic trigger, a portrait, i18n title/text and a small scale-free reward (minutes of income/glory, pysanky, or an unlock). Fired by the core after `advance`/actions (so offline too), stored in `story.seen`, shown by UI as a cosmetic modal. Lands in M2 (save v2).
- **Variety (SPEC §2.6)** only through pure functions of `(seed, time window | day index)` or a roll stored once: building cosmetic variants (M2), wandering visitors (M2 cosmetic, M6 buff), daily news with two fixed-reward answers (M6), fair good of the day (M6), weather affecting economy (M6), daily raid board (M3). Each timed effect is a breakpoint in `advance`.

## Alternatives considered
- Hand-scripted timeline (unlocks by wall-clock day) — breaks the idle economy and the offline equivalence; rejected.
- Random events with random outcomes rolled at choice time — save-scum and non-analytic; rejected (choices have fixed rewards).
- Server-driven live events / rotating shops — needs a backend (ADR 003); rejected for v1.
- Only more numbers per land (longer growth curves) — longer, not more varied; the owner's concern stays.

## Consequences
- Positive: «щось нове щосесії» becomes a CI-checked target; story and variety are cheap (text + existing sprites + hash schedules); every player's village looks and plays slightly differently without breaking determinism.
- Negative / trade-offs: more content to write and translate (≈ 35 beats, ≥ 40 news for MVP); more breakpoints in `advance` (day boundary, visitor and weather segments); save v2 in M2 (`story`), another bump in M6 (`news`); the balance sim must model every system's novelties as it lands.
- Follow-ups: M1-14 novelty log and checks; M2 story system + land 1 beats; M6 news/visitors/fair good/weather.
- Owner answers (2026-11-19): v1 length ~3–4 months, +30 % per land by default; MVP culture branches Music and Customs; new heroes Sotnyk (land 6) and Military Scribe (land 8); v1→v2 marks already-met beats seen silently (no reward); week-1 gaps and M1 windows fail `--check`, days 8–60 report only; fair good / weather tuned in M6, beat rewards simulated from M2, first raid < 3 min measured from M3.
