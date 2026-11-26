---
name: implement
description: Implement an approved plan with the lead-developer agent, then review, verify and accept.
disable-model-invocation: true
argument-hint: "<docs/plans/....md> [step range] | <backlog file> <task ID>"
---
1. Check that `$ARGUMENTS` points to an existing plan in `docs/plans/`, or to a backlog file plus a task ID with `Flow: direct` (its AC act as the plan). If not, list the plans and ask which one.
2. Launch `lead-developer` with the plan path (and step range or task ID if given).
3. If `src/content/` changed → `/balance`. Then `/review`, then `/verify`. Send blockers back to `lead-developer` once.
4. Launch `qa-lead` with the plan path and review findings; on REJECTED send the list back to `lead-developer` once.
5. Check the task's «Результат» note in the plan (≤ 5 lines: what was built, commits, deviations, open items). Report the result and suggest `/ship` (branch → PR → required checks → merge).
