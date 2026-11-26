# AI-assisted workflow

Козацький хутір is built with Claude Code. The configuration is committed so the workflow is reproducible and reviewable.
It is adapted from the Applyra setup (same layering and gates), re-targeted from a web CRM to a game: pure deterministic
core, balance as data, art judged by eyes, and store-policy instead of web-security review.

## Context layers (cheapest first)
| Layer | Loaded | Purpose |
|---|---|---|
| `CLAUDE.md` | every session (~60 lines) | non-negotiable rules, commands, where to look |
| `docs/CONTEXT.md` | on demand, read first (≤ ~20 KB) | status, repo map, system status, decisions, cross-cutting gotchas, SPEC index |
| `.claude/rules/*.md` | automatically when matching files are touched | core, content, render, ui, art, audio, platform, save, security, testing — area rules plus the traps learned in that area |
| `docs/SPEC.md` | only the section needed | product/engineering spec (source of truth) + `docs/adr/` |
| `docs/art/` | for visual work | art bible, palette, references, licenses |
| `docs/plans/*.md` | per task | architect's implementation plan for one feature |
| `.claude/skills/*` | body loads only when invoked | flow commands and procedures |

Token budget rules: agent descriptions are always in context, so they stay one sentence; flow commands use
`disable-model-invocation: true` (zero cost until typed) — except `/review`, `/verify`, `/art-review` and the procedures,
which other flows call as steps; heavy work (`/release-check`) runs only on explicit trigger.

## Team — who owns what
| Agent | Model | Access | Owns | Never does |
|---|---|---|---|---|
| `architect` | opus | read + write `docs/` only | plans, ADRs, SPEC/CONTEXT consistency, state & save design, boundaries | application code |
| `lead-developer` | inherit | full (no git commit/push) | implementing approved plans across core/content/render/ui/platform, screenshots | redesign without the architect, commits |
| `test-writer` | sonnet | edits tests only, runs tests | test-first core logic, offline equivalence, migrations, e2e | production code |
| `balance-designer` | sonnet | edits `src/content/` only, runs `pnpm balance` | pacing inside the SPEC corridor | formulas in core |
| `code-reviewer` | sonnet | read-only | purity, determinism, data/logic split, events, save versioning, types, tests | edits |
| `ui-reviewer` | sonnet | read-only | mobile UX, pixel-perfect DOM, i18n/plurals, a11y settings, states | edits |
| `art-director` | opus | read-only (+ run screenshot spec) | atmosphere, pixel discipline, palette, readability, cultural authenticity | edits |
| `security-reviewer` | opus | read-only (+ audit/grep) | supply chain, CI hardening, untrusted input (save import, URL params), CSP/XSS, debug code in prod, mobile hardening, secrets | edits |
| `platform-reviewer` | sonnet | read-only | rewarded-ads integrity, consent/privacy, Play policy, saves, clock cheats | edits |
| `playwright-test-planner/generator/healer` | sonnet | browser via MCP | e2e plans, e2e tests, fixing flaky e2e | unit tests |
| `qa-lead` | sonnet | read-only + runs checks | final acceptance: every AC has code + a test or a screenshot, findings resolved | fixes |

The main session is the orchestrator (subagents cannot spawn subagents): it routes work, enforces the gates
(`/balance` → `/review` → `/verify` → `qa-lead`) and stops for user approval at plan and ship.

## Flow commands (`/name`)
| Command | When | Agents involved |
|---|---|---|
| `/feature <task>` | any non-trivial feature | architect → **you approve** → (test-writer) → lead-developer → balance → reviewers → verify → qa-lead |
| `/plan <task>` | design only | architect |
| `/implement <plan>` | plan already approved | lead-developer → reviewers → verify → qa-lead |
| `/review [base]` | before verify/ship | only the reviewers matching the touched paths, in parallel |
| `/verify` | Definition-of-Done gate | none (typecheck/test/lint, balance, screenshots + DoD) |
| `/ship [issue]` | commit + PR + merge | verify → drafts → **you approve** → commit → push branch → PR → required checks → merge commit |
| `/bugfix <bug>` | bugs | failing test (or reproducible screenshot) first → fix → review |
| `/e2e <flow>` | critical flows only (SPEC §12.2) | Playwright planner → generator → healer |
| `/art-review [scene]` | after render/sprite changes | screenshots day/dusk/night → art-director |
| `/release-check [target]` | before closed test / production / web demo | platform-reviewer + code-reviewer + all checks + store checklist |
| `/sync-context` | after structural changes | none (refreshes `docs/CONTEXT.md`) |

Procedures (model-invocable, used inside flows): `/sprite`, `/new-village`, `/balance`, `/save-migration`, `/adr`.

## Plans and what they record
- A plan (`docs/plans/<date>-<slug>.md`) holds decisions and ordered steps; each task ends with a «Результат» note of **≤ 5 lines**: what was built, commits, deviations, open items. Detail belongs in the PR and git history.
- A non-obvious trap found during a task becomes one imperative line (what to do + why) in the matching `.claude/rules/*.md`; only cross-cutting ones go to `docs/CONTEXT.md` §6; a real decision becomes an ADR.

## Git and PR flow
`main` is protected (admins included): no direct pushes, no force-push or deletion, conversation resolution required, 0 approvals (solo project), merge commits only.

1. Branch from `main`: `feat/*`, `fix/*`, `art/*`, `chore/*`, `docs/*`, `test/*`; Conventional Commits, one logical change per PR, referencing the milestone task / SPEC §.
2. Commit → push the branch → `gh pr create` with the template body: what / why / verification / balance (if content or formulas changed).
3. Required checks green: «Check, build», «Secret scan (gitleaks)», «e2e (functional)». Docs-only changes (`docs/`, `.claude/`, top-level and `.github/` markdown) skip the functional e2e via the `changes` job.
4. A change that can move pixels: run the full `@screens` matrix on the branch first (`gh workflow run ci.yml --ref <branch>`); otherwise the nightly run (02:00 UTC, if main changed) is the safety net.
5. `gh pr merge <N> --merge`; the branch is deleted on merge. `/ship` runs steps 2–5 after `/verify` and the user's approval.

## Guardrails (`.claude/settings.json`, `.claude/hooks/`)
- `guard-paths.mjs`: blocks any access to `.env*`, keystores and signing properties; blocks edits to generated `public/atlases/` and to committed save fixtures.
- `core-purity.mjs`: after each edit in `src/core/`, flags framework imports, clock reads, `Math.random`, browser globals and timers.
- `format.mjs`: Prettier on the edited file (skips atlases, fixtures, `assets-src/`).
- Permissions: checks, tests, balance, sprites, read-only git, local branch work (`git add`, `git commit`, `git switch`, `git checkout -b`, `git fetch origin`, `git pull --ff-only`) and read-only `gh run`/`gh pr` are allowed; dependency changes, Capacitor/Gradle/adb, pushes, merges, rebases, branch deletion, `--force`/`--amend`/`restore`/plain `checkout` (they can drop work or stage ignored files) and GitHub repo/PR creation ask; force-push, hard reset and `git clean` are denied.

## Plugins & external tools
Enabled at project scope (`enabledPlugins`, `extraKnownMarketplaces` in `.claude/settings.json`). On a fresh clone: trust the folder, then
`claude plugin install <name>@<marketplace> --scope project` for each entry (enabling does not download).

| Tool | Area |
|---|---|
| superpowers | **disabled** (2026-11-25): duplicated the project's own agents and flow skills and loaded its context on every turn |
| pr-review-toolkit | silent-failure hunter, type-design and test-coverage analyzers |
| typescript-lsp | type-aware navigation |
| frontend-design | **disabled** (2026-11-25): `ui-reviewer` + `.claude/rules/ui.md` cover DOM UI quality |
| context7 | current docs for Pixi v8, pixi-filters, Capacitor, break_eternity (hosted MCP; queries leave the machine) |
| Playwright Test Agents | `.claude/agents/playwright-test-*`, `.mcp.json` (`pnpm exec playwright run-test-mcp-server`, pinned via the lockfile; `cmd /c` wrapper on Windows). Adapted from Playwright 1.65.1: after a major upgrade re-run `npx playwright init-agents --loop=claude`, then re-apply the short descriptions, `tests/e2e/` paths and the «Game-specific notes» block |

### Recommended external skills (verified 2026-11-16, not installed yet — review SKILL.md/scripts and pin a commit before installing)
| When | Tool | Install | Why |
|---|---|---|---|
| before M0 | **pixijs-skills** (official PixiJS) | `/plugin marketplace add pixijs/pixijs-skills` | Pixi v8 scene graph, filters, rendering, v7→v8 pitfalls |
| M8–M9 | **capawesome-team/skills** | `claude plugin marketplace add capawesome-team/skills` → `capacitor-core` | Capacitor + React, plugins, upgrades, Android optimisation |
| M9 | **android/skills** (official Google) — only `play`, `performance`, `build-system` | `/plugin marketplace add android/skills` | Gradle/AGP, R8, Play policy for the Android shell |
| M9 | **tamtom/gplay-cli-skills** + play-console-cli | `npx skills add tamtom/gplay-cli-skills` | scripted Play release, preflight, metadata, vitals |
| M9 | **appeeky/aso-skills** | `npx skills add appeeky/aso-skills` | store listing / ASO |
| ideas only | gamedev-skills/awesome-gamedev-agent-skills (`shader-programming`, `game-feel`, `audio-design`) | cherry-pick | reference material for juice, shaders, adaptive audio |
Rejected: Claude-Code-Game-Studios (clashes with this setup), game-creator (Phaser/Three, AGPL audio), Aseprite MCP (we do not use Aseprite; raw Lua tool), store-credential MCP servers (prefer the auditable CLI).

Not carried over from Applyra (no use in a backend-less game): shadcn skill, Trail of Bits security skills, security-guidance,
`/new-endpoint`, `/prisma-migration`, `/ai-task`, `security-reviewer` (replaced by `platform-reviewer`).
