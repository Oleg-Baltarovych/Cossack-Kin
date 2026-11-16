# 005. Music and ambience synthesized by code (physical modelling)

- Status: Accepted
- Date: 2026-11-16

## Context
- The owner decided that all music is made by Claude Code (SPEC-REVIEW D-5). Chiptune pulse/triangle would clash with the atmospheric art.
- Melodies must be public-domain folk or original (SPEC §7.1, §16). APK ≤ 40 MB.

## Decision
- Songs are tracker-style data in `src/audio/songs/*.ts`. Instruments are synthesized with Web Audio: Karplus–Strong plucked strings (bandura, kobza, tsymbaly), noise + sine with vibrato (sopilka), filtered saw (trembita, surma), noise + sine percussion (bubon, kettle drums), plus generated convolution reverb.
- Ambience (water, wind in reeds, birds, frogs, crickets, rain, fire, distant Sich) is also synthesized (filtered noise, granular patterns).
- Render mode decided at M7 by CPU measurement: live synthesis, or pre-render via `OfflineAudioContext` (`pnpm music`) to OGG + M4A played as files.

## Alternatives considered
- Chiptune synth (SPEC v1 variant A) — clashes with the art direction.
- Composing in external trackers / recorded samples — not doable by the agent; sample licensing.

## Consequences
- Positive: tiny size, fully editable melodies, consistent "warm folk" timbre.
- Negative / trade-offs: synthesis quality is the risk → a short audio spike with one theme before M7 scope is fixed.
- Follow-ups: list melody sources in `docs/content-sources.md`.
