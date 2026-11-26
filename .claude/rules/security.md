---
paths:
  - "package.json"
  - "pnpm-lock.yaml"
  - "pnpm-workspace.yaml"
  - ".npmrc"
  - "index.html"
  - "vite.config.ts"
  - ".github/workflows/**"
  - ".github/dependabot.yml"
  - "src/core/save/**"
  - "src/platform/**"
  - "src/render/debug/**"
  - "tools/check-dist.ts"
  - "tools/lib/{csp,dist-leaks}.ts"
  - "capacitor.config.ts"
  - "android/**"
  - "ios/**"
---
# Security rules — client-side game, no backend (SPEC §4, §9.5, §15; ADR 003, 006)

Threats that matter here: supply chain (npm, GitHub Actions), untrusted input (save import string, URL params), web build (XSS/CSP), mobile shell hardening, secrets, ad-reward integrity.

- **Supply chain:** exact versions in `package.json`, lockfile committed, `pnpm install --frozen-lockfile` in CI. Dependency lifecycle scripts stay blocked unless explicitly allowed in the pnpm build allowlist with a reason. New dependency → one-line reason + check its maintainer, downloads, last release, install scripts. `pnpm audit --prod` has no high/critical in CI. Keep `minimumReleaseAge` (do not install versions younger than the configured age).
- **GitHub Actions:** third-party actions pinned by full commit SHA (comment with the tag); workflow `permissions: contents: read` by default, widen per job only; no `pull_request_target`; no secrets in logs; Dependabot for npm + actions.
- **Untrusted input:** save import / load and URL params are untrusted. Decode → size limit (e.g. ≤ 256 KB) → `JSON.parse` → schema validation (`validateState`) → migrate. Reject unknown keys and `__proto__` / `constructor` / `prototype`; never `Object.assign`/spread untrusted objects into state without validation; numbers must be finite and within bounds; `Big` strings parsed strictly. Errors never crash the game.
- **Web build:** strict CSP via `<meta http-equiv="Content-Security-Policy">` (no `unsafe-eval`; `unsafe-inline` only where unavoidable and documented); no `eval`, `new Function`, `innerHTML`/`dangerouslySetInnerHTML` with dynamic data (i18n strings render as text). Debug params, `window.__CK__` and overlays are compiled out of production builds (`import.meta.env` guards + CI grep on `dist/`).
- **Hosted web build (itch.io demo, M9+):** send `frame-ancestors 'none'` (or the host's allowlist) and the CSP as HTTP headers — `frame-ancestors` in `<meta>` is ignored by browsers.
- **Lint backstop:** `no-eval` and `no-new-func` stay on; the `check:dist` tripwire covers minified output.
- **Mobile shell (M8+):** release builds not debuggable; no cleartext traffic; `allowNavigation` empty; Android backup rules exclude nothing sensitive but saves must not contain secrets; minimal permissions; WebView remote debugging only in debug builds.
- **Secrets:** never in the repo, logs or bundles: keystores, `key.properties`, `.env*`, real AdMob unit ids for release (test ids in dev). CI secret scanning on every push.
- **Ads integrity:** reward only on `rewarded`; caps in core; offline/clock-cheat rules from SPEC §3.8 (see `platform.md`).
- Review: changes under these paths → `security-reviewer` (and `platform-reviewer` for policy). Before each release → `/release-check`.

## Toolchain facts
- pnpm 12 `pnpm-workspace.yaml` keys: `allowBuilds` (map), `strictDepBuilds`, `minimumReleaseAge` (minutes; 4320 = 3 d). Unknown keys fail. `install --frozen-lockfile` also checks locked versions against the age policy. `pnpm ignored-builds` printing «no node_modules found» is harmless.
- TypeScript stays `~6.0.x` (typescript-eslint needs `< 6.1`). Tools code is erasable-only (`erasableSyntaxOnly`) with `.ts` import extensions (Node runs it without tsx).
- CI: pnpm comes from `packageManager` via pnpm/action-setup without `version` (both error). `pnpm security` stays after `build`. To bump a pinned action resolve the SHA with `gh api repos/<o>/<r>/git/ref/tags/<tag>` and dereference annotated tags. Workflow YAML is Prettier-formatted.

## Debug code and dist
- Debug-only code sits behind `__CK_DEBUG__` (vite `define`, `isDebugMode` = development | test) so Rolldown drops it. Name `RenderSettings` fields neutrally (`frozenAt`, not `freeze`): property names survive minification.
- `check:dist` matches quoted keys (`"freeze"`, `` `freeze` ``, `"zoom"`, `"tier"`), `location.search`/`URLSearchParams`, `__CK__`, `debug-overlay`, source maps. Positive control: `node tools/check-dist.ts <test-mode outDir>` must fail.
- Pixi probes `new Function` and Rolldown prints it as `Function(`: check-dist bans `eval(` and any `Function(` except the Pixi sites in `PIXI_FUNCTION_SIGNATURES` — a Pixi upgrade may add one: review, then extend the list.
- `page.evaluate` bypasses CSP: CSP e2e probes use an inline `<script>` and a string `setTimeout`. The dev server has a relaxed policy (React-refresh preamble, Vite `<style>`, `ws:`).

## gitleaks exceptions
- `.gitleaks.toml`, inline `gitleaks:allow` and commit-less fingerprints are refused. `.gitleaksignore` holds only exact `<40-hex commit>:<path>:<rule>:<line>` entries, each with a dated `#` reason above.
- False positive: reproduce locally with the pinned version (`gitleaks git --redact --no-banner --exit-code 1 .`), confirm it is not a secret (a real one → rotate + history rewrite, never an exception), add one fingerprint, rerun → 0, security-reviewer reviews, owner approves. A rewritten commit changes the SHA and the finding returns.
