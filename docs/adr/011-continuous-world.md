# 011. Continuous world: one layout, camera anchors, two integer zoom levels

- Status: Accepted (M2 plan approved by the owner 2026-11-19; implemented and reviewed in M2-01…M2-03)
- Date: 2026-11-20

## Context
- SPEC §3.0 / ADR 007: the settlement is one diorama — farm, suburb, Sich — linked by kharch and defence; SPEC §6.1 asks for a world wider than the screen, a finger-dragged camera with inertia, pinch between 2 integer zoom levels, tabs that move the camera.
- Until M2 each zone was a separate scene (`KHORTYTSIA_ZONES`, `?zone=` picked the scene); no seams, no camera, no zoom.
- Constraints: low-res worldRT + whole-scale nearest upscale and a pixel-grid check (ADR 001, SPEC §5); M-ART frames must stay (`@screens`); ≤ 30 draw calls and the §12.4 CPU budget; the camera is cosmetic (ADR 002: never in `GameState`).

## Decision
One continuous `WorldLayout` per land; the camera is a render-side position over it; zones are x ranges; zoom is a window of the same worldRT.
- **World.** `KHORTYTSIA_WORLD` = 1920 px (≈ 5 screens): farm 0–768 → suburb 768–1152 → Sich 1152–1920, same horizon. Zones are authored as `ZoneScene` in zone-local px and placed by `composeWorld` (x + zone edge; foreground x + round(x0 × 1.2)). Zone widths are multiples of 64 (ground tiles; tile variants count from the zone edge). Seams are art: edge decals (`val-end`, `maidan-edge`, `road-mouth`, `road-track`, `bank`), never a cut. Render reads only the world layout.
- **World-spanning layers.** `river { x0, x1, rows, taper }` in world px (water clipped per row, both passes skipped when no row is on screen); ground haze as a world-wide texture with per-column cover; far/mid planes painted for width = world × parallax + view; cloud layers and cloud-shadow tiles are world-phased (so a zone frame differs from its old standalone scene in parallax < 1 layers by design).
- **Anchors.** Each zone has `anchorX` (= its x0, the camera's left edge). `?zone=` is a camera start position, not a scene choice; `?cam=` sets x directly.
- **Camera.** Pure `render/camera/motion.ts` (press/drag/coast/glide/pinch; ms in, analytic inertia, bounds); tuning in `CAMERA` (`render/atmosphere/config.ts`). Camera x stays fractional; `split` snaps it to whole device px.
- **Tabs follow the camera.** `zoneAt(zones, viewCentre, held, CAMERA.zoneHysteresisPx = 32)` keeps the held zone while the centre is within 32 px past its edges; `world.onZoneChange` → Panel (suburb shows «Хутір»; «Ще» never switches). A tab press glides to the zone's anchor (keeping the normal framing's centre); «менше руху» = jump.
- **Culling.** Ground tiles, cloud shadows, decals, shadows and props outside the view + 16 px get `renderable = false` (`render/cull.ts`, only on change). `visible` stays owned by plots/tiers.
- **Zoom.** Exactly 2 levels: normal and closer = scale + 1 (`computeViewport(…, zoom)`; 390×844@3 → ×4, 292×633). worldRT and every layer stay laid out for the normal level; the closer level shows a window of it via the upscale sprite ×(s+1), y = −camY·(s+1) with camY in whole logical px. Culling, water, shafts, zone sync and draw calls are the normal level's. The flip is instant (a tween = fractional scale breaks the grid). Vertical pan exists only at the closer level, y ∈ [0, maxY]; back to normal → y = 0. The level is not persisted.
- **skyShift.** At the closer level the sky band moves down by whole rows, just enough to keep the sun (else the moon) in the window, ≤ camY and not below the horizon; light-shaft origin (`LayerFrame.skyY`) and water glints use the same shift; clouds do not move.

## Alternatives considered
- Separate zone scenes with a cut/fade between them — breaks «one living settlement» (ADR 007) and gives no drag/inertia.
- Re-layout worldRT at the closer scale — doubles layout/culling/water/shaft paths and draw-call variance; the window of one RT measured equal cost.
- Smooth or fractional zoom — non-integer upscale breaks the pixel grid (SPEC §5).
- Sorting sprites by atlas inside a Y band — unnecessary: Pixi v8 batches several textures per draw call (measured +0 calls with 2 atlases interleaved).
- Moving the camera in `GameState` — cosmetic state, would bloat saves (ADR 002).

## Consequences
- Positive: seamless pan farm → Sich; `?zone=`/`?cam=` give stable shots anywhere; draw calls 5–9 (budget 30); culling keeps CPU flat (M-ART 1.12/1.51 ms vs world 1.25/1.62 ms, within noise on SwiftShader); zoom costs nothing extra.
- Negative / trade-offs: zone frames change in parallax < 1 layers when the world grows; light-pool flicker seeds are index-based, so prop inserts can shift night frames; particle claims are world-wide worst cases; at the closer level HUD and sheet cover more (M2-13 `revealY`).
- Follow-ups: parallax under «менше руху» not flattened (far planes are painted for parallax widths — art-director/architect decision); «Ближчий вигляд» setting without a gesture (WCAG 2.5.1, M2-26/M9); culling gain and high-tier shafts while panning measured on A56 (M2-15/M2-28); new lands reuse `ZoneScene` + `composeWorld`.
