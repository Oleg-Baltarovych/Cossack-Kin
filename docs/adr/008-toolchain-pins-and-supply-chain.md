# 008. Toolchain pins and supply-chain policy

- Status: Accepted
- Date: 2026-11-16

## Context
- TypeScript 7.0 (native compiler) is `latest`, but typescript-eslint 8.72 supports only `typescript <6.1.0`: TS 7 has no JS API until 7.1 (plan M0, Q1).
- Security is the owner's top priority. The game has no backend, so the main attack surface is the supply chain (npm, GitHub Actions) and the build (plan M0-12, `.claude/rules/security.md`).

## Decision
- **Exact versions** for every dependency; TypeScript pinned `~6.0.3`; pnpm 12.21.0 via `packageManager`; Node ≥ 24.
- **pnpm policy** (`pnpm-workspace.yaml`): `allowBuilds: {}` + `strictDepBuilds: true` (no dependency lifecycle scripts), `minimumReleaseAge: 4320` (no versions younger than 3 days). Temporary exact-version excludes only with an expiry comment.
- **No dependency when the platform suffices:** PNG codec on `node:zlib` instead of `pngjs`; tools run on Node 24 type stripping instead of `tsx`.
- **CI:** actions pinned by commit SHA, `permissions: contents: read`, `persist-credentials: false`, gitleaks binary verified by SHA-256, runner image pinned (`ubuntu-26.04`) because screenshot baselines depend on it.
- **Build gates:** strict CSP (no `unsafe-*`, Pixi via `pixi.js/unsafe-eval` eval-free polyfills, no blob workers); `pnpm security` = prod audit (high) + `check:dist` (no debug code, eval/Function only at pinned Pixi signatures, exact CSP); Dependabot weekly with a 3-day cooldown.

## Alternatives considered
- TypeScript 7 now — no type-aware linting; core-purity and strict rules depend on it.
- Caret ranges + Renovate auto-merge — faster updates, but a compromised release could land within hours.
- `pngjs`, `tsx` — convenient, but each adds maintainers and transitive packages to trust.

## Consequences
- Positive: a small, reviewable dependency surface; known-good builds; debug or eval code cannot reach production unnoticed.
- Negative / trade-offs: manual bumps (Dependabot PRs), the 3-day delay also delays fixes (security updates bypass the cooldown in Dependabot), Pixi upgrades may need `check:dist` signature updates.
- Follow-ups: revisit TS 7 when typescript-eslint supports 7.1; remove `minimumReleaseAgeExclude` after 2026-11-17T15:00Z; HTTP-header CSP + `frame-ancestors` if the web build is ever hosted.
