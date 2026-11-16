# 000. Record architecture decisions

- Status: Accepted
- Date: 2026-11-16

## Context
- Козацький хутір is a solo, portfolio-grade game developed together with AI coding agents (see `docs/AI-WORKFLOW.md`).
- Agents and future readers need the "why" behind stack, render pipeline, save format, art pipeline and monetization choices; `docs/SPEC.md` describes "what".
- The SPEC review (`docs/SPEC-REVIEW.md`) produces decisions that need a durable record.

## Decision
We record every significant technical or production decision as a Markdown ADR in `docs/adr/`.
- File name: `NNN-kebab-title.md`, 3-digit zero-padded number, assigned sequentially (max + 1). Numbers are never reused.
- Template (from `.claude/skills/adr/SKILL.md`): title, Status, Date, Context, Decision, Alternatives considered, Consequences.
- Status values: `Proposed` → `Accepted`; a replaced ADR becomes `Superseded by NNN` and is not edited otherwise.
- Language: English. Length: ~60 lines, facts over prose.
- If an ADR changes behaviour described in the SPEC, `docs/SPEC.md` is updated in the same change, and a one-line entry is added to "Key decisions" in `docs/CONTEXT.md`.
- `docs/adr/README.md` holds the index.

## Alternatives considered
- Decisions only inside the SPEC — mixes "what" and "why"; history of reversals is lost.
- Wiki / external tool — not versioned with code, invisible to agents working in the repo.

## Consequences
- Positive: decisions are reviewable in PRs, discoverable by agents, usable as portfolio material.
- Negative / trade-offs: extra writing per decision; drift risk if the SPEC-update rule is skipped.
- Follow-ups: ADRs 001+ for the stack and pipeline decisions after the SPEC review is resolved.
