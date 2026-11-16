# Material recipes, set 1 (art-director, review of ART-02/03, 2026-11-16)

Pixel-level recipes that extend ART-BIBLE §5. Hex values are from `assets-src/palettes/master.json`. Generators must follow these; deviations need an art-director note.

## Khata roof (reed thatch, hipped)
- **Silhouette:** trapezoid hip roof — flat ridge 40–50 % of roof width, steep sides. Round only the corners: 2 px of 45° steps at ridge ends, 3-px quarter-round at eave corners. Roof ≈ 50–55 % of total sprite height (heavy mass). Never a dome/beehive.
- **Eaves:** overhang the wall by 3 px each side. Eave lip = 3-px rolled edge: top row `#d4ad52` with 1-px `#ebcc78` dashes on the left half only; middle `#93702e`; bottom `#6e5426`, ragged — every 3–5 px drop a single strand tip 1 px lower.
- **AO under eaves (on the wall):** 2-px band under the lip, upper `#7f7b90`, lower `#a6a2b0`; 1 px on the lit left third; 3 px at the shaded right end.
- **Ridge binding:** 2-px horizontal roll `#93702e` with 1-px `#ebcc78` highlight on top; 1-px `#6e5426` vertical ticks every 6–8 px.
- **Plane shading (no scallop courses):** front slope `#b68f3b`–`#d4ad52`; right hip end one step darker/cooler `#93702e`–`#b68f3b`; left hip end brightest `#d4ad52`–`#ebcc78`.

## Thatch strands
- Vertical strands 1 px wide, 4–7 px long, every 2–3 px; base `#b68f3b`.
- Shadow grooves 1-px `#93702e` between strand groups (~1 in 3 columns), runs of 6–10 px then break.
- Highlights: 1×2 `#ebcc78` dashes at strand tops on the left half of each plane; `#d4ad52` on the right half; `#f7e6a8` at most 3–4 single pixels per roof, top-left.
- Stagger strand ends between rows ±1 px; no row may end on one line (that creates scales).
- ≤ 5 thatch colours + eave darks; shaded planes use `#6e5426` grooves rather than more mid-browns.

## Whitewash
- Base flat `#f5eee0` on the lit wall; shaded right end `#e5ddd3` → `#cac4c6`. **No speckle.**
- 1–2 hairline cracks per 32 px tile, 3–6 px, broken, `#cac4c6` (`#a6a2b0` only near AO band and corners).
- One fresher-plaster patch per wall face, 4×3–6×4 px irregular, `#fffaf0` on the lit side.
- At most one clay show-through per wall, 2×2–3×2 px `#bd9a63` with a 1-px `#cac4c6` rim, no dark core, never within 4 px of a window.
- Ground splash: bottom 2 px above the pryzba dithered — `#e5ddd3`/`#cac4c6` checker, then `#cac4c6`/`#a6a2b0` on the row touching the pryzba.

## Window
- 7×8 px outside: 1-px frame `#774a28`, lit edge `#966233` top and left; glass 5×6 with 1-px vertical + horizontal mullion `#57351f`; day glass `#21162a` with a 1-px `#7f7b90` reflection in the top-left pane; 1-px sill `#cac4c6`.
- Centred ~1/3 from the left wall edge, top 3 px below the AO band. Tier I: one window; Tier III adds a mirrored second.
- Emissive mask = the 5×6 glass minus mullions.

## Pryzba
- Wall width + 1 px each side, never extends further. 4 px tall: top `#bd9a63` highlight row; two body rows `#9f7a48` with irregular 1-px `#805d35` vertical seams every 5–7 px; bottom `#634629`. Shaded end one step darker.

## Grass
- Ground solid `#2a5931`, mottled only with 2×1 / 3×1 `#1d3f2a` dashes (~15 %). No mid-tone checker.
- 6–8 tufts per 32×32, loose grid ±3 px jitter. Tuft 3–5 px wide, 3–4 px tall: fan of 1-px blades, centre tallest, sides 1 px shorter leaning 1 px outward at the top. Base `#1d3f2a`, middle `#3f7535`, top-left tips `#84ad45`, `#b3c95c` on ≤ 1 tip per tuft. ≤ 6 grass colours.
- Keep 2–3 gold/yellow flower flecks per tile.

## Wattle fence (tyn) and pot (глечик)
*Revised after the ART-05 review: the rod-and-gap version read as a rail fence.*
- Stakes 2 px wide every 8–10 px: body `#774a28`, lit left face `#b37d42`; rise 3–7 px above the weave, 1-px pointed tops.
- Weave: stacked courses of 4 rows. Row 1 is a rim `#b37d42` (it catches the moon, so the fence reads at night). Rows 2–4 are diagonal rods on a 3-px period: lit rod `#cf9d5c`, its shadow `#966233`, gap `#57351f`. Shaded half of a segment: `#966233` / `#774a28` / `#57351f`. A 2-px period of 1-px diagonals degenerates into a checkerboard — never use it.
- Over/under: the diagonal flips at every stake and every course. A course passes in front of stake A and behind stake B, swapping each course. Front: the course covers the stake, its bottom row `#774a28` over the stake. Behind: the stake stays intact, the course darkens 1 px before it.
- The weave ends 2 rows above the ground, so the stake feet show.
- Pot ~7×9 px: 1-px rim 4 wide; 2-px neck 3 wide; 3-px shoulder 7 wide; 2-px taper to a 4-px foot. Body `#9f7a48`, highlight `#bd9a63` upper-left shoulder, right side `#634629`, outline `#47321f`, optional 1-px `#805d35` glaze band. Hung **upside-down on a stake top**.

## Earth and path
- Pebbles mostly 2×1 / 1×1 `#a6a2b0` with 1-px `#5b5770` shadow below-right; ≤ 1 rounded 3×2 per tile; 3–4 per 32×32. Keep the diagonal earth smears.
- Path: 2 ruts 1–2 px `#634629`, wavering ±1 px every 6–8 px, 1-px `#bd9a63` lip on the upper edge, broken for 2–3 px every 10–15 px; irregular grass bite into the path edge, 1–3 px.

## Cast shadow (shadow layer)
- Small props: an ellipse under the object, 1–2 px wider than the base each side, 4–5 px tall: core `#21162a`, outer ring 50 % dither.
- Buildings (revised in ART-05): a solid 1-px `#21162a` contact line along the base, plus a parallelogram from the right half of the base that slides 12 px right over 5 rows, `#21162a` at 50 % Bayer (`castShadow`). Same for tower and church.

## Khata volume (ART-05 review)
- 3/4 view: the last ~9 px of the wall are a side wall under the right hip. Base `#cac4c6`, 1-px `#7f7b90` outer edge, its own 3-row AO, splash one step darker than the front.
- The front face stays lit (`#f5eee0`) up to a 1-px `#e5ddd3` corner.
- Eave AO on the front: a solid `#7f7b90` row, then `#7f7b90`/`#a6a2b0` at 50 %. The lit left third is one step lighter. The right end gets a third row.
- The right hip foot widens to cover the side wall and overhang; its last 7 columns are one thatch step deeper.
- Mallows are a separate prop, not part of the khata sprite (colour budget).

## Yard (двір) decal
- Ragged ellipse 80×20 under each khata, edge dithered into the grass (50 %, then 25 %).
- Sun-dried, lighter than the grass: `#9f7a48` base, `#bd9a63` at 50 % on the lit top-left third, 1-px `#805d35` rim on the bottom and right edges only.
- A few `#634629` foot and wheel marks, 2–3 pebbles. Never darker than the path (it reads as a mud pit).

## Other primitives
- Keep: tower log courses; tent roof's clean left-lit / right-dark split (model for roof plane shading); planks swatch as is.
- Pear dome: ґонт scales (rows of 2-px offset scales, `wood` ramp with silver-grey weathering) — the one place scales are correct. Church drum walls follow the whitewash recipe.
