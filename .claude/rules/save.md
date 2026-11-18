---
paths:
  - "src/core/save/**"
  - "tests/fixtures/saves/**"
---
# Save format rules — SPEC §9.5

- Envelope `{ version, seq, checksum, payload }` (`seq` = write counter, orders two slots with equal `lastSeen`; checksum = FNV-1a 32 over the payload string). `version` bumps on every change to the persisted shape (added/renamed/removed field, changed id, changed `Big` encoding).
- One migration per step: `src/core/save/migrations/NNN-vX-to-vY.ts`, pure function, registered in order. Use `/save-migration`.
- Every version has a fixture `tests/fixtures/saves/vN.json` captured from a real game state. Fixtures are immutable once committed (hook blocks edits) — they prove old saves still load. Migration code itself may be fixed if buggy.
- Tests per migration: fixture vN → migrate → expected vN+1 shape; the full chain v1 → latest loads and passes `validateState`.
- Loading never throws at the player: corrupted slot → other slot → otherwise offer import / fresh start with an explanation.
- Save from a newer version (downgrade) → never overwrite it; tell the player to update.
