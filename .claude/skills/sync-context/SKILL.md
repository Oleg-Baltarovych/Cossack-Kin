---
name: sync-context
description: Refresh docs/CONTEXT.md from the actual repo state (cheap, structural only).
disable-model-invocation: true
---
1. Gather facts cheaply — no full file reads: `git log --oneline -15`, the tree of `src/*` (incl. `src/core/systems/*`, `src/content/villages/*`, `src/render/layers/*`), `assets-src/`, `tools/`, the `scripts` from `package.json`, the list of `docs/adr/` and `docs/plans/`, current save `version`.
2. Update `docs/CONTEXT.md`: Status (milestone), Repo map (mark ✅ what exists), System status, Commands (also sync them into the CLAUDE.md "Commands" section), Key decisions (one line per ADR). Keep Gotchas; drop the ones no longer true.
3. Keep the file under ~150 lines. Update "Last updated". Show the user a short diff summary.
