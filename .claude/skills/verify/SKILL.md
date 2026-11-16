---
name: verify
description: Definition-of-Done gate — run typecheck/test/lint (+ balance and screenshots when relevant) and walk the Definition-of-Done checklist.
---
1. Find the changed files (`git diff --name-only main...HEAD` + uncommitted).
2. Run `pnpm typecheck`, `pnpm test`, `pnpm lint`. Quote failures verbatim. Do not "fix" by weakening or skipping tests.
3. If `src/content/` or core formulas changed: `pnpm balance` — every corridor metric inside SPEC §2.3?
4. If `src/render/`, `src/ui/` or `assets-src/` changed: run the `@screens` Playwright spec and look at the day + night screenshots.
5. DoD checklist (answer each yes / no / n.a. with evidence — `file:line`, test name or screenshot path):
   - AC from the plan met · core logic tested (test-first) · core stays pure (no hook warnings)
   - no magic numbers in logic · i18n keys in `uk` + `en` · save version + migration + fixture if state changed
   - offline-equivalence test still green · performance budget respected (draw calls / particles / fps) for render changes
   - accessibility settings honored (less motion, larger text) for UI/render changes
   - no `any` / `@ts-ignore` without comment · SPEC/ADR updated if behaviour changed · `docs/CONTEXT.md` updated
6. Output: a table of checks + a DoD table + verdict **DONE** or **NOT DONE** (with what is missing).
