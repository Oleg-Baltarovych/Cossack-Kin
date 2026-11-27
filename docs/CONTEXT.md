# Козацький хутір — Working Context

> Orientation map for AI agents and humans: read this first instead of exploring. Keep it terse (≤ ~20 KB).
> Update it in the same change that alters structure, systems, commands or decisions. Area-specific traps live in
> `.claude/rules/*.md` (load automatically for matching paths); per-task history lives in `docs/plans/` and git.
> Last updated: 2026-11-27 (M4-02 culture/hero content).

## 1. Status
- **Current:** M3 (Військо) accepted with open items (qa-lead, M3-20, 2026-11-25). Plan `docs/plans/2026-11-23-m3-army.md`; deferred items in its «Відкладено після M3» table (under M3-19). Fixed since acceptance: 412 quest-icon snap (#7), raid-map layout (#8), squad-at-gate baseline on a clock paused before load (#6). Still open before M4: «nightly green twice» not yet observed (#17).
- **M4 (Культура і герої):** plan `docs/plans/2026-11-27-m4-culture-heroes.md` approved 2026-11-27 (Q1–Q16 defaults); M4-01 done (SPEC + ADR 013), M4-02 done (content, unread by core), next M4-03.
- **Next (owner's MVP order):** M4 → M5 → M8 (+ daily calendar/quests from M6), then M7 and the rest of M6. Before M4: process diagnostic (this compaction is part of it).
- **M2** accepted with open items (M2-30, 2026-11-23; plan `docs/plans/2026-11-19-m2-living-village.md`): phone fps for AC M2 3 (steps in plan M2-28 «Результат») and cold start ≤ 3 s are unmeasured. Deferred list: plan M2-29 «Відкладено після M2».
- **Done:** M0 (2026-11-16), M-ART ART-01…21 (2026-11-17), M1 (2026-11-19, plan `docs/plans/2026-11-17-m1-core.md`), M2a (2026-11-20).
- MVP = M0, M-ART, M1–M5, M8 with lands 1–2 (SPEC §14). Repo `Oleg-Baltarovych/Cossack-Kin` is public (since 2026-11-20).
- The early single-HTML prototype is a reference for loop and mood only (its art was rejected — the reason for the art-first plan).

## 2. Repo map
Layout per SPEC §9.1. Root: `package.json` (pnpm 12.21, Node ≥ 24), `pnpm-workspace.yaml` (supply-chain settings only), `tsconfig.{base,app,tools,tests}.json` (solution `tsconfig.json`), `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.github/` (workflows/ci.yml, dependabot.yml, PR template).
```
src/
  core/      pure deterministic logic: big, rng, state (GameState v4 + validateState), economy, modifiers
             (collectModifiers), advance, offline (tick/resume/applyOffline), actions, events, selectors +
             raid-selectors (UI/render read path), store, systems/{army,bloom,raids,quests,story,reward,visitors,
             village-mechanics/wind}, save/{checksum,serialize,load,migrations 001–003}
  content/   all numbers and data: economy, pacing, story, quests, rewards, raids, relics, culture, heroes, effects (ranked effect kinds + reduction floors), juice, agents, variants;
             villages/khortytsia.{layout,paths}.ts (zones as ZoneScene → KHORTYTSIA_WORLD, path graph, agents)
  render/    Pixi world: App.ts, atlases.ts, viewport.ts, camera.ts + camera/motion.ts, clock.ts, zones.ts, cull.ts,
             bridge.ts (selectors + events only), scene.ts, screenMap.ts, plotHit.ts, layers/ (8 layers §6.2),
             atmosphere/ (config, dayCycle, sky, grading LUTs, emissive), fx/ (coins, smoke, construction, outline,
             moonRim), agents/ (graph, sim, driver: villagers, Cossacks, carts, visitors, raid squads), debug/
  ui/        React DOM: App.tsx, theme.ts, hooks/, components/ (Hud, Panel, Rows, QuestStrip, StoryModal, CoinFlight,
             Portrait, TierBanner, Raids, RaidMap, RaidChest, Treasury, Icon…), sheet.ts, storyQueue.ts,
             atlasSource.ts + icons.ts (DOM atlases ui/loot/map/people), debug/gameDebug.ts (dev/test presets)
  platform/  loop.ts (10 Hz), lifecycle.ts (driveGame), storage.ts, saves.ts, autosave.ts, singleTab.ts (Web Lock),
             chunkReload.ts, notifications.ts (mock until M6/M9); planned: ads, analytics, haptics, Capacitor
  audio/     empty until M7
  i18n/      index.ts (t, formatBig, formatDuration), locales/{uk,en}.json
assets-src/  palettes/master.json (88 colours, 14 ramps) · gen/lib/ (generator library, recipes) ·
             gen/<atlas>/<entity>/ generators (khortytsia, people, sky, ui, loot, map, debug…) · luts/gen.ts
public/      atlases/ and luts/ are generated (`pnpm sprites`, `pnpm luts`), git-ignored, never edited
tools/       build-sprites + lib/sprites, contact-sheet, anim-strip, build-luts, check-dist + lib/dist-leaks,
             lib/{png,csp,vite-atlases}.ts, balance-sim + lib/balance/{sim,report}.ts, capture-save.ts, hello-core.ts
tests/       unit/{core,content,render,tools,ui,i18n,lint,e2e-helpers} · e2e/specs/*.spec.ts ·
             e2e/helpers/{test,world,baseline,pixelGrid,reports,story,budgets}.ts · e2e/__screenshots__/ (Linux
             baselines) · fixtures/saves/v1–v4.json (immutable)
docs/        SPEC.md · SPEC-REVIEW.md · CONTEXT.md · AI-WORKFLOW.md · adr/ · plans/ · art/ (ART-BIBLE, palette, LICENSES)
.claude/     rules/ (area rules) · agents/ · skills/ · hooks/ (guard-paths, core-purity, format)
android/ ios/  Capacitor shells, added at M9 (M0–M8 run as a web build)
```
Commands: see `CLAUDE.md` «Commands» (single source).

## 3. Systems (SPEC §3, milestones §14)
| System | Milestone | Status |
|---|---|---|
| scaffold, integer scale, low-res target, debug params, `@screens`, security baseline, CI | M0 | ✅ |
| atmospheric slice: generators, sky/LUT, light shafts, water, weather, night, quality tiers | M-ART | ✅ `assets-src/gen/`, `src/render/atmosphere/` |
| economy (farm + Sich), kharch/defence, wind, infantry + passive glory, store, `advance`, saves, return window, `pnpm balance` | M1 | ✅ |
| living village: continuous world (3 zones), tiers + construction, camera/zoom, bottom sheet, villagers/Cossacks/carts/visitors, story beats, chain + chores, juice | M2 | ✅ with open items (phone fps, cold start) |
| raids: slots, board, rumours, relics + pity, map, chest, treasury, squad on the scene, notification hook, save v4 | M3 | ✅ with open items — `core/systems/raids.ts`, `core/raid-selectors.ts`, `ui/components/{Raids,RaidMap,RaidChest,Treasury}.tsx`, `render/agents/sim.ts` |
| culture (2 branches), heroes (3), modifier sources, save v5 | M4 | 🚧 M4-01 SPEC/ADR, M4-02 content (`content/culture.ts`, `heroes.ts`, `effects.ts`; not read yet) |
| bloom/prestige, legacy tree, land 2 (Velykyi Luh) | M5 | — |
| meta: daily/weekly quests, stork, real notifications, weather/seasons | M6 | — |
| audio | M7 | — |
| ads (AdMob rewarded, UMP) M8a · shop + Play Billing + pysanky sinks M8b | M8 | — |
| polish, en, a11y, Android release | M9 | — |
Legend: — not started · 🚧 in progress · ✅ done.

## 4. Key decisions (details in `docs/adr/README.md`)
- Pixi v8 world in a low-res target (320–400 px) + React DOM UI (001); pure core, one analytic `advance()` (002); Capacitor web-first, no backend (003).
- All pixel art by code: material generators + palette quantization + art-director gate (004); music/ambience synthesized, physical modelling (005).
- Rewarded ads only, UMP, caps in core (006, partly superseded by 010). Shop (010, SPEC §4): pysanky = the one premium currency, ad-free = instant rewards under the same caps, capped convenience + cosmetics, never power; bounds ads ≤ 1.5×, payer ≤ 1.75× (`pnpm balance --profile`); Play Billing via `StoreService`, entitlements re-queried from Play, never trusted from saves.
- Settlement = farm + suburb + Sich with kharch/defence links; lands follow the Host's path Khortytsia → Nova Sich (007).
- Toolchain & supply chain (008): TS ~6.0.3, exact versions, no dependency build scripts, 3-day release age, SHA-pinned CI on ubuntu-26.04, strict CSP, `pnpm security`.
- Pacing & variety (009, SPEC §2.4–2.6): novelty every session in week 1, daily after — measured by `pnpm balance` from `content/pacing.ts`; variety only from seed + time.
- Continuous world (011): one `KHORTYTSIA_WORLD` (1920 px: farm 0–768 → suburb 768–1152 → Sich 1152–1920); tabs follow the camera; 2 integer zoom levels; camera never in `GameState`.
- Raids (012, SPEC §3.4): army power is a snapshot (no losses); outcome rolled once at `startRaid` and stored; `returnAt` is an `advance` breakpoint; `applyOffline` finishes raids to the real `now`; board = pure `raidBoard(seed, day)`; relic pity; manual claim; preview = grant.
- Culture & heroes (013, SPEC §3.5; M4, planned): glory currency; permanent ranked nodes, whole tree visible, no respec; branch/hero unlocks derived (tavern 1 → «Музика», church → «Звичаї», beats → hero at level 1; all in land 1); `modifierSources` folded by `collectModifiers` and read by the UI breakdown; raid `returnAt` fixed at start within `[dur × minTimeMult, dur]`; Чайки not in M4 (M10+); save v5 with sparse `culture`/`heroes`.
- Quests (SPEC §3.10): chain «Наказ кошового» + chores (M2), daily/weekly (M6). Save is v4 (migrations 001–003).
- Names: «Козацький хутір» / «Cossack Kin»; applicationId `com.cossackkin.game` (fixed at first Play upload).

## 5. Conventions
- Docs: SPEC and SPEC-REVIEW in Ukrainian; code, identifiers, comments, commits, ADRs, agent/skill files in English. Markdown is hand-formatted (Prettier ignores `*.md`, `docs/`, `.claude/`).
- i18n keys `area.village.entity.field` (e.g. `building.dnipro.mill.name`); `uk` default, `en` second.
- Requirements are referenced by SPEC section (`SPEC §3.4`) and milestone task ID (`M3-04`).
- Plans: one file per milestone or feature in `docs/plans/`; each task's «Результат» note is ≤ 5 lines — what was built, commits, deviations, open items. Detail goes to the PR and git, traps go to `.claude/rules/`.
- PR flow (in force since 2026-11-26): `main` is protected; every task goes branch → PR → required checks → merge commit. Details: `docs/AI-WORKFLOW.md` «Git and PR flow», `/ship`.
- Where a new trap goes: a short imperative line in the `.claude/rules/*.md` whose paths match the files it concerns; only cross-cutting ones in §6 below; a real decision → ADR.

## 6. Cross-cutting gotchas
- **Windows dev machine:** hooks are Node scripts (no bash/jq); Git Bash heredocs with quotes break — use the Write tool or script files. Python writes CRLF in text mode — use `newline=''`, then `pnpm format`.
- **Node and pnpm:** the machine runs Node 26 (CI stays on Node 24, `engines >= 24`); pnpm 12.21.0 is a plain `npm i -g` install on PATH; `corepack enable` fails with EPERM — don't retry. «Agent skills awaiting approval: pixi.js» on install is harmless.
- **Node runs `.ts` directly** (no tsx): tools code is erasable-only, and relative imports in tools/core/content end in `.ts`.
- **Lint escapes:** `local/require-disable-reason` allows only `eslint-disable-next-line <rule> -- <reason>`; a file-wide `/* eslint-disable */` still silences the report about itself — catch it in review.
- **Debug hooks (dev/test only, compiled out of `dist/`):** `window.__CK__` (render: `stats`, `plotAt`, `buildingAt`), `window.__CK_GAME__` (`dispatch(action)`, `notifications()`); URL params in `CLAUDE.md`. `document.body.dataset.ready` = `"1"` after the first frame, `"error"` on a failed atlas load.
- **Agents and skills** load only when the Claude Code session starts in this folder.
- **CI shape:** push/PR → «Check, build» (typecheck → test → lint → format:check → sprites → build → `pnpm security`), «Secret scan (gitleaks)», «e2e (functional)» (`--grep-invert "@screens|@perf"`, skipped for docs-only changes by the `changes` job). `e2e-full` (7 jobs incl. `@screens`; 412 runs as 2 shards × 1 worker) runs nightly at 02:00 UTC if main changed, and on manual dispatch. Artifact `e2e-reports` (7 days).
- **Screenshot baselines (Linux only):** compared only when `process.platform === 'linux'`, under `tests/e2e/__screenshots__/`. Regenerate after an intended visual change: Actions → CI → Run workflow (branch, tick `update_snapshots`) → download every `screenshot-baselines-*` artifact → unzip into `tests/e2e/__screenshots__/` → review the images → commit. With no PNG committed the run uses `--ignore-snapshots`; otherwise missing/different = red.

## 7. SPEC index (`docs/SPEC.md`)
Read only the section you need: `grep -n "^##" docs/SPEC.md`, then read that range.
| § | Line | Topic |
|---|---|---|
| 0 | 14 | instructions for Claude Code (stage gates, core purity, balance, i18n, screenshots, art gate) |
| 1–2 | 27 | vision, names, pillars, micro/macro loop, pacing targets + novelty + free/ads/payer bounds, 2.4 discovery calendar, 2.5 story beats, 2.6 seeded variety |
| 3 | 172 | 3.0 settlement zones, currencies, farm + Sich buildings (tuned land-1 tables), taps/stork, army/raids (M3 model, presentation rules, Q16–Q21, raid time at start M4), culture/heroes (+ M4 model), prestige, lands, offline `advance`/`applyOffline`/`resume` + `ReturnReport`, meta, 3.10 quests |
| 4 | 449 | monetization: principles, 4.1 pysanky, 4.2 shop + sinks + never-sold, 4.3 rewarded placements/caps, 4.4 billing tech, 4.5 onboarding |
| 5 | 537 | art direction: 320–400 px, sizes, palette, font, code-generated art pipeline |
| 6 | 578 | visuals: screen + UI as built, layers, atmosphere stack, characters, buildings (tiers, construction), village life (agents), juice, a11y |
| 7 | 720 | audio: folk instruments via physical modelling, ambience, SFX |
| 8 | 755 | tech stack |
| 9 | 776 | architecture: repo tree, data flow + store + events, key types (GameState v4 + planned v5 + migration chain), platform interfaces, saves, modifiers (+ M4 `modifierSources`) |
| 10–11 | 1015 | UX flows (onboarding incl. `raid1`, «Січ» raids block, «Культура» M4), localization |
| 12 | 1045 | quality: unit, e2e + debug params, balance sim metrics (novelty, profiles, raids bot, culture bot M4, S1 cap), performance budgets |
| 13 | 1100 | analytics events (+ IAP, pysanky) |
| 14 | 1109 | roadmap M0 … M10 with acceptance criteria; status line; MVP |
| 15–17 | 1133 | release & store (+ billing setup), cultural notes, resolved/open questions |

Art: `docs/art/ART-BIBLE.md` (style source of truth), `docs/art/palette.png`, `assets-src/palettes/master.json`.
