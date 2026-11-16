---
name: review
description: Review current changes with only the reviewers relevant to the touched paths, in parallel.
argument-hint: "[base ref, default: main]"
---
1. Collect the changed files: `git diff --name-only ${ARGUMENTS:-main}...HEAD` plus `git diff --name-only` and `git ls-files --others --exclude-standard`. If nothing changed, say so and stop.
2. Route — launch the matching agents **in parallel, in one message**, each with only its list of files:
   | Touched paths | Agent |
   |---|---|
   | `src/core/**`, `src/content/**`, `src/render/**`, `src/audio/**`, `tools/**` | `code-reviewer` |
   | `src/ui/**`, `src/i18n/**` | `ui-reviewer` |
   | `src/render/**`, `assets-src/**`, `docs/art/**` | `art-director` — first produce screenshots with `/art-review` and pass their paths |
   | `src/platform/**`, `src/core/save/**`, ads/analytics/notifications code, `capacitor.config.ts`, `android/**`, `ios/**`, `.github/workflows/**` | `platform-reviewer` |
   | test files only | `code-reviewer` (test-quality focus) |
   Skip any agent with no files. Docs-only changes: no agents — just check `docs/CONTEXT.md` is consistent.
3. Merge the findings into one list ordered by severity, deduplicated, with `file:line` (or screenshot + area). End with a combined verdict: ready / fix first (list) / rework.
