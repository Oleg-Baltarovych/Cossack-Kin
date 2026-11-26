---
name: plan
description: Ask the architect for an implementation plan only (no code).
disable-model-invocation: true
argument-hint: "<task or milestone ID>"
---
Launch the `architect` agent with: "$ARGUMENTS". Relay to the user the plan path, the 5-line summary and the open questions. Do not start implementation. Each plan task ends with a «Результат» placeholder; whoever finishes the task fills it in ≤ 5 lines: what was built, commits, deviations, open items (details stay in git and the PR).
