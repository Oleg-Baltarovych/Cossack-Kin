---
paths:
  - "assets-src/**"
  - "tools/build-sprites.ts"
  - "docs/art/**"
---
# Art pipeline rules — SPEC §5, docs/art/

- Source of style: `docs/art/` (art bible, palette, references). A sprite that contradicts it is wrong even if it "looks fine".
- Sources, all ending in the same Pixi spritesheet format: `.aseprite` (hand/commissioned) → `aseprite -b --sheet --data`; code-generated sprites (`assets-src/gen/*.ts` procedural generators, `.px` masks only for tiny items); licensed packs recolored to our palette.
- Light from top-left; colored dark outline (never `#000`); hue-shifted ramps (cooler shadows, warmer lights); no pillow shading; textures (thatch, planks, plaster, grass) instead of flat fills.
- Sizes and grid per the art bible; pivot at feet/base for Y-sorting; frame names `<entity>/<anim>/<nn>`.
- Building tiers and village variants are assembled from modular parts (base + roof + add-ons) where possible — less art, more variety.
- Night: an emissive mask (windows, forge, fire) next to the sprite instead of a separate night sprite.
- Third-party assets: commercial use allowed, license kept, entry in `docs/art/LICENSES.md` (source, author, license, URL, what changed). Unknown license = do not use.
- AI-generated images are references/drafts only unless the user approves a specific tool and its license; final sprites are cleaned up to the palette and grid.
- Never edit `public/atlases/` — run `pnpm sprites`. Check atlas size limits after each build.
- After a sprite change run `/art-review` for the affected scene.
