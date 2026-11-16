---
name: ship
description: Prepare and (after explicit approval) commit, push and open a PR for the current work.
disable-model-invocation: true
argument-hint: "[issue number]"
---
1. Run `/verify`. If NOT DONE — stop and report.
2. If on `main`, propose a branch name (`feat/…`, `fix/…`, `art/…`, `chore/…`) from the change.
3. Draft:
   - Conventional Commit message(s) — one logical change each; body: why, what changed, how verified, milestone task / SPEC §, `Closes #$ARGUMENTS` if given.
   - PR description from `.github/pull_request_template.md`: summary, SPEC refs, test evidence, balance summary (if content changed), screenshots day + night (if visual), new dependencies with reasons.
4. Show the drafts and **ask for explicit approval** before `git checkout -b`, `git commit`, `git push`, `gh pr create`. Never force-push.
5. After the PR is created, report the URL.
