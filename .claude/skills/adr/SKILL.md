---
name: adr
description: Write an Architecture Decision Record in docs/adr. Use when a technical or production decision is made or changed (stack, render pipeline, save format, art pipeline, audio approach, monetization, platform).
argument-hint: "<short-kebab-title>"
---
# ADR: $ARGUMENTS

1. Next number: list `docs/adr/` and take max + 1 (3 digits). Check `docs/adr/README.md` (index) to avoid duplicates; add the new ADR to that index.
2. Create `docs/adr/NNN-<title>.md` in English:

```markdown
# NNN. <Title>

- Status: Proposed | Accepted | Superseded by NNN
- Date: YYYY-MM-DD

## Context
<forces, constraints, what problem; link docs/SPEC.md §>

## Decision
<the choice in one or two sentences, then specifics>

## Alternatives considered
- <option> — <why not>

## Consequences
- Positive: …
- Negative / trade-offs: …
- Follow-ups: …
```

3. Under ~60 lines; facts over prose.
4. If the decision changes behaviour described in the SPEC, update the owning `docs/SPEC.md` section in the same change.
5. Add a one-line entry to "Key decisions" in `docs/CONTEXT.md`.
