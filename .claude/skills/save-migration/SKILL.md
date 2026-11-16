---
name: save-migration
description: Change the persisted GameState shape safely — bump save version, write the migration, capture a fixture, test the full chain. Use for any added/renamed/removed state field, changed id or changed number encoding.
argument-hint: "<what changes, e.g. 'add raids.relicPity'>"
---
# Save migration: $ARGUMENTS

1. Read `src/core/save/` (current `SAVE_VERSION`, migrations registry) and `.claude/rules/save.md`.
2. Before changing anything, capture the current format: create `tests/fixtures/saves/v<current>.json` from a realistic state (builder or exported save) if it does not exist yet. Existing fixtures are immutable.
3. Change the state types and `createInitialState()`.
4. Bump `SAVE_VERSION` to N+1. Add `src/core/save/migrations/NNN-vN-to-vN+1.ts`: pure function, sensible defaults for new fields, id renames mapped explicitly; register it.
5. Tests (first, see them fail): fixture vN → migrate → expected shape; oldest fixture → latest passes `validateState`; newer-than-supported version is rejected without overwriting.
6. Capture the new fixture `tests/fixtures/saves/v<N+1>.json`.
7. Run `pnpm test`. Note the version bump in the PR description.
