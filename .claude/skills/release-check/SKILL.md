---
name: release-check
description: Pre-release gate (closed testing / production / web demo) — platform & policy review, performance and size budgets, balance, screenshot matrix, store checklist. Costly; run only before a release.
disable-model-invocation: true
argument-hint: "[closed-test | production | web-demo]"
---
Release: ${ARGUMENTS:-closed-test}. Warn the user that this uses many tokens, and confirm before starting.

1. Scope: changes since the last tag (`git describe --tags --abbrev=0`, fallback: first commit).
2. In parallel (one message): `platform-reviewer` on `src/platform/**`, `src/core/save/**`, ads/analytics/notifications code, `capacitor.config.ts`, `android/**`; `code-reviewer` on `src/core/**` changes since the tag.
3. Checks: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm balance` (all corridors ✅), `pnpm e2e` incl. `@screens` for every village day + night (`art-director` on the matrix).
4. Budgets (SPEC §12.4) — ask the user to run on a mid-range Android device and report, or read the numbers they provide: 60 fps, draw calls ≤ 30, cold start ≤ 3 s, APK/AAB ≤ 40 MB.
5. Store checklist (SPEC §15): privacy policy URL, Data safety answers match what the code collects, IARC answers, target audience not children, test ad ids removed from release config, version code bumped, closed-testing requirements for a personal account.
6. Write `docs/releases/<yyyy-mm-dd>-<target>.md`: findings (severity, `file:line`, fix, status), check results, budget numbers, store checklist. Summarize criticals and highs to the user. Do not tag or upload anything.
