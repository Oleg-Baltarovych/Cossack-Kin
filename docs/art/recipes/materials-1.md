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
- Stakes 2 px wide every 8–10 px: lit left `#966233`, dark right `#57351f`; rise 4–6 px above the top rod (±2 px), 1-px pointed/split tops.
- Rods 2 px tall: top row `#b37d42` on front-passing segments, bottom `#774a28`; 1-px `#3b2419` gap row between rods.
- Over/under: a rod passes in front of stake A, behind stake B, swapping each row. Front: rod over stake, stake darkened 1 px above/below. Behind: rod breaks 1 px before the stake, stake drawn intact. 1-px sag mid-segment.
- Pot ~7×9 px: 1-px rim 4 wide; 2-px neck 3 wide; 3-px shoulder 7 wide; 2-px taper to a 4-px foot. Body `#9f7a48`, highlight `#bd9a63` upper-left shoulder, right side `#634629`, outline `#47321f`, optional 1-px `#805d35` glaze band. Hung **upside-down on a stake top**.

## Earth and path
- Pebbles mostly 2×1 / 1×1 `#a6a2b0` with 1-px `#5b5770` shadow below-right; ≤ 1 rounded 3×2 per tile; 3–4 per 32×32. Keep the diagonal earth smears.
- Path: 2 ruts 1–2 px `#634629`, wavering ±1 px every 6–8 px, 1-px `#bd9a63` lip on the upper edge, broken for 2–3 px every 10–15 px; irregular grass bite into the path edge, 1–3 px.

## Cast shadow (shadow layer)
- Ellipse under the object, 1–2 px wider than the base each side, 4–5 px tall: core `#21162a`, outer ring 50 % dither.
- Buildings: right-and-down skew wedge — khata ≈ 8–10 px to the right of the wall at ground level, 3–4 px tall at the wall foot, tapering. Same for tower and church.

## Other primitives
- Keep: tower log courses; tent roof's clean left-lit / right-dark split (model for roof plane shading); planks swatch as is.
- Pear dome: ґонт scales (rows of 2-px offset scales, `wood` ramp with silver-grey weathering) — the one place scales are correct. Church drum walls follow the whitewash recipe.
