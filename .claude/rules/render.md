---
paths:
  - "src/render/**"
---
# Render rules (PixiJS v8) — SPEC §5, §6, §12.4, docs/art/

- Render the world into a low-resolution render target (logical size) and upscale with integer scale + nearest filtering. Filters run at logical resolution (cheap, pixel-consistent). Smooth camera = sub-pixel offset applied only in the upscale pass.
- Sprites at integer positions (`roundPixels`), nearest scale mode; non-integer scaling only for deliberate squash/stretch tweens.
- Render never mutates `GameState`. It subscribes to store events via `bridge.ts` and reads snapshots. Cosmetic randomness may use `Math.random`.
- Layers per SPEC §6.2 (sky → clouds → far → mid → ground (Y-sorted) → foreground → fx → light), one module each in `layers/`.
- Atmosphere is code: time-of-day color grading via LUT (not only a darkening matrix), light shafts, fog, cloud shadows, water reflection, wind sway, emissive night masks. Every effect has a quality tier (low/med/high) and respects "less motion".
- Budgets (SPEC §12.4): draw calls ≤ 30, particles ≤ 300 (prefer shader rain/snow over particles), villagers ≤ 25, one atlas per village ≤ 2048² + shared atlas. Check the debug overlay before and after a change.
- Prefer `pixi-filters` (v8-compatible) over custom filters; check APIs with context7 or installed typings, not memory.
- Destroy what you create (textures, filters, tickers) on scene change; no leaks across village switches.
- Debug URL params (`?time=`, `?weather=`, `?season=`, `?seed=`, `?freeze`) make every screenshot reproducible — keep them working.
- Visual changes are verified with `/art-review` screenshots (day + night), not by reading code.
