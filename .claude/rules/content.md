---
paths:
  - "src/content/**"
  - "tools/balance-sim.ts"
  - "tools/lib/balance/**"
---
# Content & balance rules — SPEC §2.3, §3, §12.3

- `src/content/` is data: typed objects plus a test that checks ids are unique, references resolve and i18n keys exist in `uk` and `en`. No logic beyond tiny pure helpers.
- Every id is a stable string-literal union (`BuildingId`, `VillageId`, …). Renaming a shipped id needs a save migration (`/save-migration`).
- Any change to numbers → `pnpm balance`; compare with the pacing corridor in SPEC §2.3; put the before → after summary in the PR. CI fails outside the corridor.
- Tune with `balance-designer` (`/balance`). Change one lever at a time (growth, baseProd, milestone mult, scale) and state why.
- Village files (`villages/<id>.ts`) hold: 8 buildings, plots, path graph, palette additions, mechanic config, music/ambience ids, sprite ids. Use `/new-village`.
- Real-world culture (crafts, songs, sayings, names): public domain or own text only; record the source in `docs/content-sources.md`. No modern state symbols in the world (SPEC §16). No caricatured enemies.

## Frozen order (append only)
- Quest chain and chore ids/order are frozen: append only. Any insertion (like `khortytsia.raid1` in v4) needs its own index-shift migration like `003`.
- New agent spawns go at the END of `KHORTYTSIA_AGENTS` (spawn index seeds the RNG: inserting earlier reshuffles every walk).
- Never renumber a `PLOT_VARIANTS` key; options may grow, never shrink. A new add-on stays clear of every tier (`gen-variants.test.ts`) and is appended after the zone's other props.
- A building's tier props are expanded in place from its `TierSprite`: never append its props elsewhere (light flicker seeds count by index). Tier counts/levels only from `TIER_LEVELS`; an art-pending building is listed in `TIER_ART_PENDING` until its art task deletes the line.

## Layout
- Author a zone in zone-local px (`ZoneScene`), never world px; `composeWorld` places it. Zone widths are multiples of 64. Decals draw in layout order, so an edge piece that must lie over the next zone is placed from that zone.
- The river's end is `river.bank` (per-row px); water, rain, boats and the `bank` decal all read it via `riverRowEnd` — change one, both follow.
- A plot band whose empty look is grass names `alt: 'grass'` (else an empty plot shows steppe). Props may stand in the steppe fill only down to `STEPPE_BAND.propsMax`.
- Props in the bottom ~10 rows of the front grass (y > 340) peek above the sheet tabs unless they are short.
- Anchors put the pivot on a whole px (`anchors.test.ts`).
- Night spots ≤ `NIGHT_SPOT_CAP` per side of a door; fire spots ≤ 2 (content tests).
- A dark tier sets `noPool` (a shared `@emissive` layer gives every variant a mask); `poolRx` must be > 0 (content test). A building in a wide shared canvas sets `poolRx` on its tier part (the default pool is 0.45 × frame width).

## Balance
- The glory content test checks `maxSlots × max gloryLootSec × max lootMult ≤ gloryCapSec` with the real `collectModifiers` — keep it when adding loot relics or tiers.
- A culture/hero/relic effect names one `EFFECT_KINDS` field (`effects.ts`); a new reducing source (`cost`, `cultureCost`, `raidTime`) must keep `culture.test.ts`'s Σ max ≤ 1 − `EFFECT_FLOORS` — add relic shares to that sum when relics use these kinds (M4-06).
- The bot ignores chores whose `requires` it never does — such a chore stalls its chore claims.
- Raid starts/claims are raid actions (`SessionLog.raids`), not economy actions; quest claims are not «дії» (`SessionLog.claims`).
- Judge robustness on `pnpm balance --seeds 1,…,12` before trusting seeds 1–3; for the S2+ action median use seeds 1–36 (±2 between seeds is noise).
- Tuning is touchy at the edges; offline is ~98 % of income at 2 × 7-min sessions/day (structural, no target). `--check` also gates sim speed (60 days ≤ 10 s CPU).
