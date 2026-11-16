---
name: art-review
description: Capture reproducible screenshots of a scene (390×844; day, dusk, night; optional weather/season) and have the art-director judge them against the art bible.
argument-hint: "[village id] [weather] [season] — default: current village, clear, summer"
---
# Art review: ${ARGUMENTS:-current scene}

1. Preconditions: `pnpm dev` is running (or start it in the background) and the `@screens` spec exists. If not, say what is missing and stop.
2. Capture with deterministic params (`?seed=1&freeze&time=…&weather=…&season=…`): times 07:00 (dawn light shafts), 13:00, 19:30 (golden hour), 23:00 (night with emissives). Save to `reports/screens/<yyyy-mm-dd>/<village>-<time>-<weather>.png`.
3. Also capture the debug overlay values (fps, draw calls, particles) for the same frames.
4. Launch `art-director` with the screenshot paths, the change description and the overlay numbers.
5. Relay: verdict, notes, budget numbers. For a comparison with the previous state, put old and new paths side by side in the report.
