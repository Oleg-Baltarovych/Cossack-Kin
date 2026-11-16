---
paths:
  - "src/content/**"
  - "tools/balance-sim.ts"
---
# Content & balance rules — SPEC §2.3, §3, §12.3

- `src/content/` is data: typed objects plus a test that checks ids are unique, references resolve and i18n keys exist in `uk` and `en`. No logic beyond tiny pure helpers.
- Every id is a stable string-literal union (`BuildingId`, `VillageId`, …). Renaming a shipped id needs a save migration (`/save-migration`).
- Any change to numbers → `pnpm balance`; compare with the pacing corridor in SPEC §2.3; put the before → after summary in the PR. CI fails outside the corridor.
- Tune with `balance-designer` (`/balance`). Change one lever at a time (growth, baseProd, milestone mult, scale) and state why.
- Village files (`villages/<id>.ts`) hold: 8 buildings, plots, path graph, palette additions, mechanic config, music/ambience ids, sprite ids. Use `/new-village`.
- Real-world culture (crafts, songs, sayings, names): public domain or own text only; record the source in `docs/content-sources.md`. No modern state symbols in the world (SPEC §16). No caricatured enemies.
