---
name: e2e
description: Create or repair Playwright e2e tests for a critical player flow with the Playwright planner → generator → healer agents.
disable-model-invocation: true
argument-hint: "<flow, e.g. 'onboarding to first raid' | heal>"
---
Flow: $ARGUMENTS

Preconditions: `pnpm dev` runs and `@playwright/test` is installed. If not, tell the user what to start and stop.
Only the critical flows from SPEC §12.2 deserve e2e (onboarding → first raid, reload → return window, screenshot matrix); for anything else suggest a Vitest test instead.

- New flow: `playwright-test-planner` → plan saved in `tests/e2e/specs/`; show it to the user. Then `playwright-test-generator` for each scenario of the approved plan → tests in `tests/e2e/`.
- `heal` (or failing e2e): `playwright-test-healer` on the failing tests.
- Then run `pnpm e2e <files>` and report results. Tests use role/label locators for the DOM UI, deterministic URL params + fake clock, and no fixed timeouts.
