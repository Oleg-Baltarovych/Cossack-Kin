---
name: feature
description: Full feature flow — plan (architect) → user approval → implement (lead-developer) → review → verify → accept.
disable-model-invocation: true
argument-hint: "<feature or milestone task, e.g. 'raids with 2 slots (M3)'>"
---
# Feature: $ARGUMENTS

Run these stages in order. Keep the main thread small: delegate, then relay summaries.

1. **Plan** — launch `architect` with the feature text. Show the user the plan path, the summary and the open questions.
   **Stop and wait for the user's approval** (or answers). If they request changes, send them to the architect again.
2. **Implement** — if the plan has substantial core logic, first launch `test-writer` for the failing tests (subagents cannot spawn subagents, so this happens here). Then launch `lead-developer` with the approved plan path (and the failing test files).
3. **Balance** — if `src/content/` changed, run `/balance`; out of corridor → `balance-designer` before review.
4. **Review** — run `/review`. Send blocker/should-fix findings back to `lead-developer` in one batch; repeat review at most once more.
5. **Verify** — run `/verify`. If red, return to step 2 with the failure output.
6. **Accept** — launch `qa-lead` with the plan path and the review findings. If REJECTED, send the list to `lead-developer` and repeat from step 4 (max 2 loops, then stop and ask the user).
7. **Report**: what was built, checks with results, review/art/QA verdicts, screenshots (paths), follow-ups. Make sure the task's «Результат» note in the plan is written and ≤ 5 lines (what was built, commits, deviations, open items). Suggest `/ship` (branch → PR → required checks → merge) — do not commit yourself.
