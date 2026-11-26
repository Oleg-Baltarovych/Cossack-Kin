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

## Pipeline
- `import 'pixi.js/unsafe-eval'` stays at the top of `App.ts` and `Assets.setPreferences({ preferWorkers: false })` in `atlases.ts`: without either the scene never reaches `data-ready` under the strict CSP.
- Ticker order: debug begin (HIGH) → world → worldRT (NORMAL) → stage render (LOW) → debug end + `data-ready` (UTILITY).
- worldRT = ceil(device/scale) + 1 (not logicalW + 1), `dynamic: true` so the upscale sprite follows `resize`; Pixi creates the canvas (StrictMode double mount destroys the first app safely). `computeViewport` floors device px (rounding up dropped a device row); 401–639 device px → logical < 320 by design (400 cap).
- `camera.split` rounds camX·scale to whole device px; the remainder moves the whole upscale sprite (sky included) by design. The camera stays fractional and is never in `GameState`.
- Closer zoom is a window of the normal worldRT (scale + 1): culling, water, shafts and draw calls stay the normal level's. Pinch flips instantly (a fractional scale breaks the grid).
- The sky is not graded; graded content sits in one `ColorMapFilter` container; emissive and the dev swatch are post-grade. `ColorMapFilter` un-premultiplies but never re-multiplies: keep graded content over the sky opaque or binary alpha (smoke has no sprite `alpha`).
- `BufferImageSource` from a `Uint8Array` defaults to `bgra8unorm` — pass `format: 'rgba8unorm'`. `ColorMapFilter.destroy()` also destroys its LUT texture. LUTs decode via `createImageBitmap(…, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })` + OffscreenCanvas (CSP-safe, byte-exact).
- `loadLuts(weather)` loads one LUT set at start; dynamic weather (M6) must load both. The moon-rim filter is GLSL only — add a WGSL program if WebGPU is enabled.
- Pixi batches several atlases per draw call (interleaving 2 atlases measured +0). Each outline mark costs +4 draw calls, the moon bevel +3, a boat on screen +2.
- Release atlases on world teardown and on a failed start (`unloadAtlases`). `pixiAtlases` loads only `WORLD_ATLASES` (+ debug in dev/test); DOM-only atlases (`map`, `loot`, `ui`) need nothing here.

## World and scene
- Read only `KHORTYTSIA_WORLD`. Cull off-view sprites with `renderable` (`cull.ts`), never `visible` — plots own `visible`. Particle claims are world-wide worst cases.
- Layers with parallax < 1 and the cloud-shadow tiles are world-phased; a world change can legitimately move far-plane pixels.
- Light-pool flicker seeds count by prop index: inserting props before an existing one shifts night shots — re-check night @screens after any insert. Smoke seeds use the mouth's world x.
- Build fx: every layer reads the `shown` scene from `BuildFx.present`, never `scene`; `build.world`/`build.top` need the camera offset each frame. Build timing is real ms, so `?freeze` shots step with `clock.runFor`.
- `createCoinFx` takes each frame's own anchor (`defaultAnchor`), never 0.5. Client ↔ ground mapping only through `screenMap.ts`.
- Framing: horizon = `horizonRow(viewH, FRAMING)`; `FRAMING.windowTop` is measured — if the HUD height changes, re-measure (framing.spec) and re-check `clouds.test`.
- Smoke, pennants and boats: chimney mouth `smoke { dx, lift }` is read off the frame (`gen-life.test.ts`); boats carry their own rain film; carts are never mirrored (direction baked per variant); the bearer's cloth flies right (facing −1 → x = 1 − dx).

## Agents
- Poses = f(seed, pool ticks, context history); fixed 60 Hz ticks, mulberry32 per agent. The frame path allocates nothing per tick (`stepInPlace`); `stepAgents`/`agentPoses` are pure copies for tests. A broken graph or a bad spawn throws at creation.
- Feed scene inputs (raids, villagers, cossacks, visitors, carts) through the bridge + `AgentContext`. Raid squads follow `store.onEvents` (the batch), never per-event `onEvent`: a change with `StateReplaced`, or a return with `OfflineApplied`, snaps instead of animating.
- `assignCrews` runs in `stepInPlace` AND in the driver before its zero-tick early-out (else a new scaffold starts with no crew for a frame).
- Halt spots of the raid squad sit clear of the drill block and the cannon: moving maidan props needs a new look at `sich.raid.*`. Review raid shots with `state=chests` (`state=raids` has too small a squad).
- The work-done cue is a `glint` star, never the coin (nothing from the economy); none under `?freeze`.
