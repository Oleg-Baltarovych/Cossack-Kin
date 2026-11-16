---
name: new-village
description: Add a new village (край) end to end — content file, unique mechanic in core, palette and art list, path graph, music/ambience, i18n, balance corridor, screenshots. Use for villages 2–8 from SPEC §3.7.
argument-hint: "<village id, e.g. 'karpaty'>"
---
# New village: $ARGUMENTS

This is always a `/feature`-sized change: start with the architect's plan; this checklist is what the plan must cover.

1. **Spec**: the row in SPEC §3.7 (passive bonus, unique mechanic, bloom goal), palette additions (§5.2), music character (§7.1). Missing details → ask before planning.
2. **Content** `src/content/villages/<id>.ts`: 8 buildings (id, base, growth, baseProd, tags, tiers), plots, path graph + POIs, `scale`, `regaliaThreshold`, passive bonus as modifiers, mechanic config, bloom goal, sprite/music/ambience ids.
3. **Mechanic** `src/core/systems/village-mechanics/<id>.ts`: pure, deterministic, offline-computable (function of seed + time), with its own state slice → save version bump + migration + fixture (`/save-migration`). Tests first.
4. **Render**: layers (far/mid/ground/foreground), water/fog/weather specifics, mechanic visuals, night emissives; art list for `/sprite` (what is new vs reused/recolored).
5. **UI**: mechanic panel in the "Край" tab, bloom progress, glossary tooltips for new realia.
6. **i18n**: all names, descriptions, sayings in `uk` + `en`; cultural sources in `docs/content-sources.md`.
7. **Audio**: theme + night variation, ambience layers.
8. **Balance**: `/balance <id>` — bloom inside corridor (+30–50% vs previous village).
9. **Verify**: `/art-review <id>` day + night, `/review`, `/verify`, `qa-lead`.
