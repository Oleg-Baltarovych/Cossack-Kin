# 014. UI skin: carved wood and рушник, colour roles, a separate `ui-frame` sheet

- Status: Accepted (owner decision 2026-11-28)
- Date: 2026-11-28

## Context
- The DOM UI (ADR 001) works and reads, but it is a programmer's skin: flat `wood 0–2` fills about 15 % apart, 1-px lines, no material, no surface hierarchy; one gold for buy, claim, selection, the active tab and progress; ochre for headings and for warnings; a cold `stone 2` slate for disabled; crimson almost absent (art audit `docs/art/reviews/2026-11-28-ui-audit.md`).
- ART-BIBLE §9 asks for «UI-рамки — дерево й полотно з вишиваним орнаментом (9-slice)»; no `border-image` exists in `src/ui` yet.
- The usability audit (`docs/art/reviews/2026-11-28-ux-audit.md`) finds the shell too thin for M5: the tab bar cannot fit 5 tabs + the sheet arrow at 360–390, the HUD is 4 rows, settings hold only the language.
- The world is painted with light from the top-left, textures and hue-shifted ramps (ADR 004); the UI must belong to it, stay dark at night and keep the pixel grid (`--px`, whole device px for the font).

## Decision
- **Direction A, «Різьблене дерево й рушник»** (the UI as khata furniture):
  - frame (HUD, sheet top, modal border): dark oak `wood 0` with a 2-px bevel lit from the top-left;
  - panel: `wood 1` planks with sparse vertical grain (≤ 1 step of contrast);
  - cards are sunken, controls are raised; disabled = flat `wood 1`, `plaster 2` text and a lock (no slate);
  - рушник cross-stitch (`crimson` on `plaster` linen) in exactly three places: the modal title band, the section rule, the centre of the HUD's lower edge.
- **Colour roles (one meaning each):** crimson = selection and culture identity; gold = buy or claim now, nothing else; ochre (`thatch 5`) = headings and levels; green = gains (the delta only); `crimson 5` + an icon = a shortage. Status is never colour alone (SPEC §6.8).
- **Direction B (parchment)** only for document windows: story beats, relic lore, the return window, the raid map. **Direction C (кахлі)** only as tiny accents (portrait plinths).
- **Tokens:** `src/ui/theme.ts` owns a role table (role → palette ramp + index) and writes `--ui-*` CSS variables next to `--c-<ramp>-<i>`; components use roles, not ramps, for accents and surfaces. Every role resolves into `master.json` (unit test); UI CSS holds no colour literals.
- **Two stages:** CSS + palette quick wins inside M4 (M4-16a, which updates its own baselines); the `ui-frame` sheet and the shell restructure in milestone M4.5 «Оновлення інтерфейсу» (SPEC §14), before M5 adds «Край».
- **`ui-frame` is its own generated sheet** (≈ 4 nine-slices, 16–24 px; `assets-src/gen/ui-frame/`), not part of the `ui` icon atlas (which must not grow, `.claude/rules/ui.md`). Frames are drawn with `border-image` at whole `--px` steps, `image-rendering: pixelated`.

## Alternatives considered
- B «Універсал і печатка» everywhere: a light surface glares at night, kills the dusk under the half sheet and needs every text colour re-checked.
- C «Кахлі» everywhere: too colourful against the world; cobalt on white drifts to Delft.
- Keep the flat skin and fix only usability: leaves the UI out of step with the art bible and the portfolio bar.
- Frames inside the `ui` atlas: the atlas is at its size limit (HUD icons went soft at 412@3.5).

## Consequences
- Positive: one surface recipe and one colour meaning per role; crimson gets a job; the UI shares the world's wood and light direction and stays dark at night; one small new sheet.
- Negative / trade-offs: every Linux screenshot baseline with DOM UI moves twice (in M4-16a, then during M4.5); the ornament turns kitsch if it spreads past three places, and grain above 1 step of contrast becomes noise (art-director gate).
- Follow-ups: the M4.5 plan (`ui-frame` generator, HUD, tab bar, «Ще», settings); ART-BIBLE §9 points here.
