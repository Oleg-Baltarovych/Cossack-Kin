# 001. PixiJS v8 world in a low-res render target, React DOM UI on top

- Status: Accepted
- Date: 2026-11-16

## Context
- The game is an atmospheric pixel-art diorama with shaders (light shafts, LUT grading, water reflection, weather) that must hold 60 fps on mid-range Android (SPEC §5.1, §6, §12.4).
- UI is text-heavy (Ukrainian/English, plurals, big numbers) and needs accessibility settings (SPEC §6.8, §11).

## Decision
- **World:** PixiJS v8 renders into a render target of the logical size (320–400 px wide, integer scale `floor(screenWidthPx / 320)`), which is upscaled with nearest filtering. All filters run at logical resolution. Smooth camera: sub-pixel offset applied only in the upscale pass.
- **UI:** React 19 + CSS Modules as DOM over the canvas; sizes are multiples of the integer scale (`--px`), 9-slice via `border-image`.
- State reaches both through the core store (`useSyncExternalStore` for React, event bridge for Pixi).

## Alternatives considered
- Native-resolution rendering with scaled sprites — filters cost ~9–16× more fill rate; pixel grid breaks under effects.
- UI drawn in Pixi — worse text, i18n and accessibility; more code.
- Phaser / a game engine — more than we need for a diorama + menus; React UI is the author's strength.

## Consequences
- Positive: cheap shaders, guaranteed single pixel grid, readable UI.
- Negative / trade-offs: two rendering systems to keep pixel-aligned; DOM over WebGL needs care for input and z-order.
- Follow-ups: ✅ versions verified at M0 (pixi.js 8.23.0, pixi-filters 6.1.5; see plan §1). Strict CSP needs `pixi.js/unsafe-eval` (eval-free polyfills) and `preferWorkers: false` (ADR 008). Draw calls are counted in dev by wrapping the GL draw methods.

## Amendment (2026-11-17, M-ART ART-04…10): the atmosphere pipeline
- **Order inside worldRT:** sky (CPU-painted, ungraded) → far and mid landscape (CPU-painted in the sky's colour chain, ungraded) → graded container (clouds, ground, props, characters; one `ColorMapFilter` with the CPU-blended time-of-day LUT) → **water passes** (the band above the horizon mirrored into the river: 2 draw calls) → light layer (haze band, light shafts, dust; ungraded) → post-grade (emissive). The world renders in two parts (`world`, `world-top`) with the water between them.
- **Light shafts (ART-10 spike decision):** pixi-filters `GodrayFilter` is **not used** — it blurs over the pixel grid, ignores clouds and was the slowest. Shafts are a CPU polar shadow map from the sun (clouds as ellipses solved in closed form, bluffs/groves as a horizon height field), painted at stepped opacities with feathered edges and angular bands, drawn additively. Tiers: `high` = full resolution, 8 repaints/s; `med` (default) = ½ resolution, 4/s; `low` = a static fan of 5 beams clipped by the bluffs and gated by the clouds. Cost on desktop (SwiftShader, CPU ×4): high 84 %, med 85 %, low 97 % of the no-shaft frame rate; +2 draw calls while a low sun shines. Phone numbers (A56) are pending; if high at full res costs > 15 % there, high falls back to ½ res (ART-18).
- pixi-filters stays for the grading `ColorMapFilter` only.
