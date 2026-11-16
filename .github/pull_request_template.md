## Summary
<!-- What and why, 1–3 lines. -->

Closes #
Milestone task / SPEC: <!-- e.g. M3-04 · docs/SPEC.md §3.4 -->
Plan: <!-- docs/plans/... (if any) -->

## How it was verified
- [ ] `pnpm typecheck && pnpm test && pnpm lint` green
- [ ] Core logic covered by tests (test-first); offline-equivalence test green
- [ ] Screenshots 390×844 day + night attached (visual changes)
- [ ] Performance overlay checked: draw calls ≤ 30, particles ≤ 300 (render changes)

## Balance (if `src/content/` or formulas changed)
<!-- Paste the `pnpm balance` summary: metric | target | before | after -->

## Checklist
- [ ] No magic numbers in logic; new ids are literal unions
- [ ] i18n keys added to `uk` and `en`
- [ ] Save shape changed? Version bumped, migration + new fixture + test
- [ ] Ads: reward only after `rewarded`; caps respected (platform changes)
- [ ] Third-party art/audio? License recorded in `docs/art/LICENSES.md`
- [ ] New dependency? Reason: <!-- or "none" -->
- [ ] SPEC / ADR updated if behaviour changed; `docs/CONTEXT.md` updated if structure/systems/commands changed
