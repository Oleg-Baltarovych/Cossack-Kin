---
paths:
  - "tests/**"
  - "**/*.{test,spec}.{ts,tsx}"
---
# Testing rules — SPEC §12

- Unit (Vitest) for `src/core` and `src/content` integrity: economy edge levels (0, 9/10, 24/25, 99/100), modifiers, offline equivalence (`applyOffline(dt)` ≈ integrated `tick()` within 0.1%), clock rollback → 0, forward jump → cap, prestige carry/reset, raids with fixed seed, save migrations from fixtures. Core coverage ≥ 90%.
- Big numbers: compare with a relative-tolerance helper, never `toBe` on floats.
- Time: pass `now` explicitly to core; fake timers only for platform/UI code.
- UI: Testing Library, query by role/label. Render code is checked by screenshots, not unit tests (except pure helpers: camera math, integer scale, path graph).
- E2E (Playwright, 390×844, Chromium with WebGL enabled): onboarding → first raid; reload → return window with the correct amount (fake clock); screenshot matrix per village × day/night via `?freeze&seed=&time=`. No `waitForTimeout`; role-based locators for DOM UI.
- A test must fail when the behaviour breaks. Assert outputs and events, not implementation calls. Delete tests that pass against an empty implementation.
- Test data via builders (`makeState({ ... })`); seeded randomness only.
