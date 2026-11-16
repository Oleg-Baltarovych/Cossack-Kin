---
name: balance
description: Run the balance simulation and compare pacing with the SPEC corridor; delegate tuning to balance-designer when out of corridor. Use after any change in src/content/ or in core formulas.
argument-hint: "[village id | 'all'] [--ads]"
---
# Balance: ${ARGUMENTS:-all}

1. Run `pnpm balance` (add `--ads` if requested; for a quick check, the village given). If the script does not exist yet, say so and stop.
2. Read the generated markdown report (`reports/balance/latest.md`). Build the table `metric | target (SPEC §2.3) | actual | ✅/❌`:
   first purchase < 15 s · first raid < 3 min · bloom per village (V1 4–6 days at 2 sessions/day; each next +30–50%) · 8 h offline = 2–4 noticeable purchases · 5–15 actions per session · ads effect on bloom ≤ ~1.5× (honest ads).
3. All ✅ → report the table and stop.
4. Any ❌ → launch `balance-designer` with the failing metrics and the report path. Relay its before → after table. If it reports a formula problem, stop and ask the user whether to plan a core change (`/plan`).
5. Remind: the summary table goes into the PR description.
