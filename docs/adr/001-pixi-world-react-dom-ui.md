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

## Amendment 2 (2026-11-17, M-ART ART-11…20): final pipeline, weather, quality tiers
Extends the amendment above (order and shaft decision unchanged); numbers live in `src/render/atmosphere/config.ts`, the look in ART-BIBLE §8.
- **Graded vs ungraded.** Ungraded, CPU-painted in palette colours: sky (`SkyLook` chain per key, weather-aware via `skyPaint.weatherLook`), far/mid planes (same chain), the world-top light layer (haze/fog band, shafts, dust, light pools, fireflies, rain). Graded: the `graded` container (clouds, ground with cloud-shadow tiles, props, people, foreground). Post-grade (`postGrade.ts`, world-top): `@emissive` frames at `EMISSIVE_LEVELS` alpha, campfire flame frames, sparks.
- **LUT blending.** `pnpm luts` bakes 6 LUTs 16³ (256×16 strips, `public/luts/<HHMM>.png`) from `GRADE_LOOKS`. `dayCycle` gives `keyA/keyB/t` (smoothstep after each key's hold); the two LUTs are blended on the CPU into one `BufferImageSource` (`rgba8unorm`) at most once per `LUT_UPDATE_MINUTES` game minute; one `ColorMapFilter` (linear between lattice steps) over the whole worldRT (`filterArea`). Under rain `gradeCycle` caps the night key's weight at `RAIN_NIGHT_GRADE` (0.7, the rest from dusk) so silhouettes read without a moon.
- **Light pools are alpha-blended**, not additive (additive orange on the blue night ground lands on grey-pink); shafts, dust and fireflies stay additive.
- **Weather** (`?weather=clear|rain|fog`): overcast/fog sky chains, no clouds, cloud shadows, shafts, water path or fireflies; rain is two whole-px-scrolled CPU streak tiles + wet film + puddles + splashes in the light layer (no shader pass, no extra draw call), not the shader rain SPEC v1.1 sketched.
- **Quality tiers + auto-detect (ART-18).** `QUALITY_TIERS` low/med/high scale shaft variant (as above), dust, sparks, fireflies, splashes, far rain layer, cloud shadows; layers implement `setQuality` (rebuild without leaks) and each emitter `claimParticles` its tier ceiling. `?quality` fixes the tier; otherwise start `med`, a pure fps probe (`render/quality.ts`, `AUTO_QUALITY`: 1 s warm-up, 3 s mean, ≥ 57 → high, < 45 → low) switches once, never under `?freeze`, and restarts after a > 250 ms frame gap.
- **Two clocks per frame.** `LayerFrame.seconds` (people, game-state motion) and `LayerFrame.ambient` (= seconds, or 0 under «менше руху»: clouds, water, sails, sway, fire, rain, stars stand still; particles off).
- **Measured (desktop SwiftShader, CPU ×4, `reports/perf/<date>/quality.md`):** 7–9 draw calls (≤ 30), ≤ 136 particles (≤ 300), no regression vs ART-10. Open: ≥ 55 fps on the A56 (owner). If high's full-res shadow map is visibly costly in the evening on the phone, either re-run the probe on key change or drop high to ½ res.
