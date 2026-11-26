---
name: bugfix
description: Fix a bug test-first — reproduce with a failing test (or a reproducible screenshot for visual bugs), fix the root cause, review, verify.
disable-model-invocation: true
argument-hint: "<bug description / save string / error output>"
---
Bug: $ARGUMENTS

1. Locate: use `docs/CONTEXT.md` to find the system; read only the relevant files. State the hypothesis of the root cause.
2. Reproduce:
   - Logic/economy/save bug: the smallest failing Vitest test (a pasted save export → decode it into a fixture under `tests/fixtures/`; use `test-writer` for a larger setup). Confirm it fails for the expected reason.
   - Visual bug: reproduce with debug URL params (`?seed=&time=&weather=&freeze`) and capture the screenshot.
   If you cannot reproduce, stop and report what you tried.
3. Fix the cause, not the symptom — no guards that only hide the crash. Smallest change.
4. Run the test + `pnpm test`. Then `/review` on the changed files.
5. If the bug reveals a non-obvious trap, add a one-line imperative rule (what to do + why) to the matching `.claude/rules/*.md` (cross-cutting: `docs/CONTEXT.md` §6, ≤ 15 bullets).
6. Report: root cause, fix, test name (or before/after screenshots), checks. Suggest `/ship`.
