---
name: ship
description: Prepare and (after explicit approval) commit, push, open a PR, wait for the required checks and merge it.
disable-model-invocation: true
argument-hint: "[issue number]"
---
`main` is protected (no direct pushes, no force-push, conversation resolution required, merge commits only). Every change lands through a PR.

1. Run `/verify`. If NOT DONE — stop and report.
2. If on `main`, propose a branch name from the change: `feat/…`, `fix/…`, `art/…`, `chore/…`, `docs/…`, `test/…`.
3. Draft:
   - Conventional Commit message(s) — one logical change each; body: why, what changed, how verified, milestone task / SPEC §, `Closes #$ARGUMENTS` if given.
   - PR body from `.github/pull_request_template.md`: what / why, verification (commands + results, screenshots day + night if visual), balance summary (if `src/content/` or formulas changed), new dependencies with reasons.
4. Show the drafts and **ask for explicit approval** before `git checkout -b`, `git commit`, `git push`, `gh pr create`, `gh pr merge`. Never force-push.
5. After approval: commit → `git push -u origin <branch>` → `gh pr create --base main --title … --body-file …`.
6. Pixels: if the change can move pixels (render, art, CSS, layout, fonts), run the full matrix on the branch before merging: `gh workflow run ci.yml --ref <branch>` (without `update_snapshots`) and wait for it (`gh run watch`); the nightly run is the safety net, not the gate.
7. Wait for the required checks: «Check, build», «Secret scan (gitleaks)», «e2e (functional)» (`gh pr checks <N> --watch`). Docs-only changes skip the functional e2e through the `changes` job — that counts as passed. Red → stop and report the failing job.
8. Resolve every review conversation, then `gh pr merge <N> --merge` (merge commit; the branch is deleted on merge). Then `git switch main && git pull --ff-only`.
9. Report the PR URL, the checks and the merge commit.
