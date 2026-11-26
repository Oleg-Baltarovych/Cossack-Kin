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

## Generator contract (`assets-src/gen/lib/types.ts`)
- Frame names `<entity>[.<variant>][@emissive|@shadow]/<anim>/<nn>`; one namespace over all game atlases (`pnpm sprites` rejects duplicates; generator ids unique too).
- Determinism: RNG per frame seeded from `<atlas>:<frame name>` (golden test). In generator and LUT output use only + − × ÷, `Math.round`, `Math.sqrt` — no `**`, `Math.pow`, trig, `exp`, `cbrt` (engine-dependent last bits).
- Soft alpha only in `SOFT_ALPHA_ATLASES` (`fx`). Anything drawn into a graded container over the sky stays opaque or binary alpha (the grade filter un-premultiplies only).
- Recipe parts compose with `{ light: false, occlusion: false }`. A second `compose` into the same buffer turns `outline` off and reuses only shades the base has. Declare `Material` members as function properties, not methods (`unbound-method`).
- Pivots/anchors on whole px (`anchors.test.ts`): a half-px anchor is a texel tie the atlas packing decides.
- Companion layers (`@emissive`, `@shadow`) apply to every variant and frames are not trimmed: put lights in add-ons, not in a tier base.

## Budgets and palette
- Prop budget 16 colours / 4 ramps (`pnpm sprites:sheet` flags above); building bases are judged against 24 / 6 (busy bases: `composeOutlined(…, { drop: 1 })`). The brama and gate use 7 ramps (owner exception, tested). People tools use only ramps the outfit already has (≤ 6 per frame).
- `people` atlas is at the 2048-px width cap: new frames grow it in height. Moving a frame between atlases can flip a nearest-sampling texel tie under non-integer scale — re-check squashed sprites (`low-cloud.test.ts`).
- Ground texture never uses thatch 4 / gold 4 (the golden curve keeps them bright: «confetti»; flecks = thatch 3). Night: suburb roofs keep thatch ≤ 4; white cloth/whitewash night half-tone = plaster remap `[1,1,1,2,3,4,4]`.
- The farm's river band covers rows above 26: tall farm sprites (mill hub, sails) must stay under it (gen-farm test renders every sail frame).
- Every people generator uses `PEOPLE_SELECTIVE` (warm contour). A kazan stands beside a fire, never over it (post-grade flames hide it).
- Sky: dither fractions in quarters only; the lightest chain colour is reserved for the sun/moon disc; night ground constraints are unit-tested (`luts.test.ts`).

## Checks
- `pnpm sprites:sheet <id>` / `pnpm sprites:strip <id>` to look; `pnpm sprites` prints SHA-256 per file — two runs must match.
- Before merging any art task run the whole `@screens` matrix (or dispatch it in CI), not only the new task's shots: sprites have broken older checks on main.
