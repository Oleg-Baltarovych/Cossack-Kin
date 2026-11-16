---
name: sprite
description: Create or change a sprite / animation / tile through the asset pipeline (assets-src → pnpm sprites → atlas), then check it in the scene with art-director. Use for any new or changed visual asset.
argument-hint: "<entity, e.g. 'dnipro/mill tier 3' | 'villager walk cycle'>"
---
# Sprite: $ARGUMENTS

1. Read `docs/art/` (art bible: grid, sizes, palette, light, outline, references) and the entity's entry in SPEC §5–6 (sizes, frames @ fps, tiers).
2. Choose the source and say why:
   - **Aseprite file** exists or the asset is a key piece (hero building, character) → do not draw it yourself; prepare a brief for the user/artist (size, frames, palette, references, emissive mask needs) unless the user asked for a code-drawn placeholder.
   - **Procedural generator** (`assets-src/gen/*.ts`) — terrain, sky, clouds, water, trees, fences, props, variations, modular building parts.
   - **Licensed pack** — recolor to the palette; add `docs/art/LICENSES.md` entry first.
3. Build modular where possible: base + roof + add-ons per tier; emissive mask for night; pivot at the base; frame names `<entity>/<anim>/<nn>`.
4. Run `pnpm sprites`; check atlas size and that frame names resolve in `src/content/` / render code.
5. Run `/art-review <scene>` (day + night). Apply the art-director's ⚠/❌ notes, at most 2 iterations, then report what is left.
6. Report: files in `assets-src/`, atlas impact (size, frame count), screenshots, remaining art notes.
