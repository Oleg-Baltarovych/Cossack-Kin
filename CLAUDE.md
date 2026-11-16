# Козацький хутір (Cossack Kin: Idle Village)

Atmospheric pixel-art idle game for mobile (Android first, then iOS; web build for dev and demo). Solo developer, portfolio-grade.
Source of truth: `docs/SPEC.md` (Ukrainian) + `docs/adr/`. Open findings and pending decisions: `docs/SPEC-REVIEW.md`. Read only the section you need.

## Orientation (read this before exploring)
1. `docs/CONTEXT.md` — status, repo map, system status, decisions, gotchas, SPEC section index. Read it first; it replaces broad exploration.
2. Need a spec detail? Pick the section from the index in `docs/CONTEXT.md` §7, then `grep -n "^##" docs/SPEC.md` and read only that range.
3. Area rules load automatically from `.claude/rules/` when you touch matching files. Do not duplicate them here.
4. At the end of every task that changes structure, systems, commands or decisions — update `docs/CONTEXT.md` (keep it terse).

## Stack (fixed by SPEC §8; verify current versions at scaffold, never from memory)
pnpm · Vite · TypeScript strict (`noUncheckedIndexedAccess`) · PixiJS v8 (world) · React 19 + CSS Modules (DOM UI over the canvas) ·
own store + `useSyncExternalStore` · `break_eternity.js` behind `Big` · Capacitor (Android/iOS) · Vitest · Playwright (390×844) · ESLint + Prettier.
No backend in v1.

## Commands
> pnpm 12.21 on PATH (corepack not used). Node 24 runs `tools/*.ts` directly (no tsx).
- `pnpm dev` — Vite dev server (web build)
- `pnpm typecheck && pnpm test && pnpm lint` — must be green before reporting a task done (typecheck covers app, tools and tests projects)
- `pnpm format` / `pnpm format:check` — Prettier (code only; markdown/docs are not reformatted)
- `pnpm build` — production build into `dist/`; then `pnpm check:dist` — fails if debug code (`freeze` param, `window.__CK__`, overlay) leaked into `dist/`
- Dev/test URL params: `?seed=1&freeze[=sec]&time=HH:MM&weather=&season=&zone=&quality=&overlay&cam=<logical px>` (`render/debug/params.ts`); `document.body.dataset.ready === "1"` after the first frame
- `pnpm exec vitest run tests/unit/render` — run a subset of unit tests
- `pnpm e2e` — Playwright (builds `--mode test` into `dist-test/`, serves it on :4317); `pnpm e2e --grep @screens` — M0 screenshot matrix (3 phones) → `reports/screens/<date>/`; first time: `pnpm exec playwright install chromium`
- Planned, not yet wired: `pnpm sprites` (M0-08), `pnpm balance` (M1)

## Non-negotiable rules
- If a task conflicts with the SPEC — stop and ask. Behaviour/architecture changes go into `docs/SPEC.md` + an ADR (`/adr`).
- Stay inside the task scope and the current milestone (SPEC §14). No new dependency without stating why (in the commit/PR body).
- `src/core/` is pure, deterministic TypeScript: no DOM, Pixi, React, Capacitor, `Date.now()`, `Math.random()`. Time comes in as `now`, randomness from the seeded RNG in state.
- Every balance number lives in `src/content/`. No magic numbers in logic. Content change → run `pnpm balance` and put the summary in the PR.
- Render and audio only react to store events; they never mutate game state. Economy is analytic, visuals are cosmetic.
- All player-facing text via i18n keys (`uk` default, `en` second). No string concatenation for plurals.
- Ads: a reward is granted only after the SDK `rewarded` callback. No forced ads, banners or interstitials — ever.
- No `any`, `@ts-ignore`, `as unknown as`, or non-null `!` without a one-line justification comment.
- Never read or edit `.env*` (except `.env.example`), keystores or signing configs. Never edit `public/atlases/` (generated) or committed save fixtures.

## Engineering principles
- Core logic: write the failing test first and see it fail for the expected reason. Skip test-first for wiring, Pixi scene composition, styling.
- Tests assert observable behaviour through public APIs. A test that would pass if every function returned nothing is deleted.
- Make illegal states unrepresentable (discriminated unions for raid/building/weather states).
- Smallest change that solves the problem; prefer deleting to adding; redesign instead of bolting on.
- Bugs: reproduce with a test, fix the cause. A guard that only hides the crash is not a fix.
- Visual work is verified by looking at it: screenshots in 390×844 (day + night), judged against `docs/art/` references, not by reading code.

## Git
- Branches `feat/*`, `fix/*`, `art/*`, `chore/*` from `main`; Conventional Commits; one logical change per commit/PR, referencing the milestone task ID / SPEC section.
- Never commit, push, force-push, or delete files/branches without the user's explicit approval in this session.

## Team & workflow (details: `docs/AI-WORKFLOW.md`)
- `architect` designs (plans in `docs/plans/`, ADRs, SPEC/CONTEXT) — never code. `lead-developer` implements approved plans.
- `test-writer` writes tests. Read-only reviewers: `code-reviewer`, `ui-reviewer`, `art-director`, `platform-reviewer`. `balance-designer` tunes `src/content/` with `pnpm balance`. `qa-lead` gives final acceptance. E2E: `playwright-test-{planner,generator,healer}`.
- Flow commands: `/feature` (plan → approve → implement → review → verify → accept) · `/plan` · `/implement` · `/review` · `/verify` · `/ship` · `/bugfix` · `/e2e` · `/art-review` · `/release-check` (pre-release only) · `/sync-context`.
- Procedures: `/sprite`, `/new-village`, `/balance`, `/save-migration`, `/adr`.
- Non-trivial work (new system, save schema change, new village, render pipeline change) goes through a plan first. Small fixes may skip the architect.
