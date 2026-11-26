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
- Never hard-code a balance number in a test (a retune breaks it): read it from the row / content.

## Unit specifics
- Economy tests mark all story beats seen in their builders; a new debug preset joins `tests/unit/ui/debug-presets.test.ts` via `PRESETS` (every preset must be a state play can reach).
- jsdom: React listens for `webkitAnimationEnd` — dispatch both `animationend` names; `checkVisibility` is missing; fake timers also fake rAF + `performance` (count frames with `vi.getTimerCount()`).
- `tests/unit/lint/core-purity.test.ts` lints a virtual `src/core/…` path, so it applies `disableTypeChecked`; ESLint core-purity rules mirror `.claude/hooks/core-purity.mjs` — change both.
- Content/tool tests read frame names from generator metadata (`frameNames`), never from `public/atlases/` (CI runs tests before `pnpm sprites`).

## E2E harness
- Import `test`/`expect` only from `tests/e2e/helpers/test.ts` (ESLint `imports[test-fixture]`): it paces frames on the GPU and drains it on teardown. Default `frames: 'native'`; a paused clock draws one moment until `runFor`, then wait one rAF. Specs that step frames with `runFor` opt in with `test.use({ frames: 'clock' })`. Recheck the fixture on every Playwright upgrade (it relies on the clock assigning `window.requestAnimationFrame`, pinned 1.65.1).
- WebGL: keep `--use-angle=swiftshader --enable-unsafe-swiftshader`; never `--disable-gpu`. Assert a WebGL context + `__CK__.stats.drawCalls` before any pixel check.
- E2E serves a `--mode test` build from `dist-test/` on :4317 with `reuseExistingServer`: kill a leftover `vite preview` after source changes, or it serves stale atlases.
- `gotoReady` appends `ui=0` unless the URL has `ui=`; UI tests pass `ui=1`. `waitReady` allows 20 s; `body[data-ready="error"]` fails at once.
- `?freeze` freezes the render clock and the game clock (`FROZEN_NOW`, no loop). Fixed clock + new game: `advance` returns early for now ≤ lastSeen, so step the clock once after `waitReady` (progress.spec `newGame`); zone-dependent specs pin `test.use({ timezoneId: 'UTC' })` like CI.
- A hidden tab is an absence: `page.clock.install` + override `document.visibilityState` + dispatch `visibilitychange`; `clock.pauseAt` before coming back so later ticks do not move `lastSeen`.
- `?state=` presets are memory-only (cannot survive a reload): for reload/return flows or late chain steps, build the save with the core in Node (`createInitialState` + `applyAction`/`advance`, `encodeSave`) and seed `ck.save_a` once (raids.spec, quest-target.spec).
- Actions without UI: `window.__CK_GAME__.dispatch(action)` (dev/test only). Taps are capped per second — under `setFixedTime` step the clock to tap more.
- A new game shows «Берег Дніпра» on its first tick: close it (`helpers/story.ts`). A spec that claims a raid must close the chest window.
- Half sheet: a click on a row below the visible part hangs at «stable» — open the sheet fully first. Finish the sheet's CSS transition before a shot. Status queries: scope to the region (two `role=status` live regions exist).
- World taps must hit open ground (`__CK__.plotAt` null), else the sheet opens. Camera: poll `__CK__.buildingAt(b)` non-null, then wait for `cameraSettled` (same `stats.cam` ≥ 3 frames) before reading or shooting; read the horizon from `horizonY`, never a ratio.
- Touch on a fake clock: drag via CDP `Input.dispatchTouchEvent`; Chrome delivers moves only at its next real frame — poll each move with `requestRealFrame` (camera.spec) before `runFor`; advance ≥ 3 frames (`SETTLE_MS`) before reading the camera.
- Live scenes that depend on wall time (builders ≈ 25 s, glints) need `clock.install` without `?freeze`.
- Timeouts under load are usually SwiftShader contention: re-run with `--workers=1|2` before calling it real. Locally run the functional e2e + only the task's own `@screens`, `--workers=1`.

## Screenshots and baselines
- Real shots only via `pnpm e2e --grep @screens` (viewport emulation); headless Edge/Chrome `--screenshot` lays out at ≈ 480 css px and crops.
- `expectBaseline(page, name, mask?)` (`helpers/baseline.ts`): `toHaveScreenshot` only on Linux; elsewhere the frame goes to `reports/screens/<date>/baseline-<name>-<project>.png` — hash across local runs to check stability. It waits for `cameraSettled`.
- Every baseline pins clock (`setFixedTime` or a paused stepped clock), seed, `?freeze`, and `?still` where the UI animates. A live render-clock scene (raid squad at the gate) cannot have a baseline yet: the render clock starts at `performance.now()` on load.
- Pixel grid (`helpers/pixelGrid.ts`): no colour edge inside a `scale×scale` block, column phase from `split(cam).fracDevicePx`; it covers floor(css × dpr) px only (412@3.5 has a blended last row). PNGs via `tools/lib/png.ts` (no PNG dependency).
- Scene-wide checks are scoped: «never black» only on dark keys; «sky on palette» only above the clouds and where `shaftLevel` is 0 (full band: `sky-palette.test.ts`).
- Before merging an art/render task run its `@screens` and look at them; for a wide visual change dispatch the full CI matrix on the branch. Review-only shots go in a temporary `@screens @<tag>` spec, deleted before merge; dir helper `helpers/reports.ts`.
- Perf: `PERF=1 pnpm e2e --grep "settlement drag" --workers=1` → `reports/perf/<date>/m2.md`; `PROFILE=1` adds a `.cpuprofile` (build unminified into `dist-test` and start the preview first). Compare rows of one run (laptop runs vary ×2).
