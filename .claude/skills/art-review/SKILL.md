---
name: art-review
description: Capture reproducible screenshots of a scene (390×844; 6 time-of-day keys; optional zone/weather/season) and have the art-director judge them against the art bible.
argument-hint: "[village] [zone farm|sich] [weather] [season] — default: khortytsia, farm, clear, summer"
---
# Art review: ${ARGUMENTS:-current scene}

1. Preconditions: the `@screens` spec exists (`tests/e2e/specs/screens.spec.ts`) and covers the zone/weather asked for. If not, say what is missing and stop.
2. Capture with deterministic params (`?seed=1&freeze&time=HH:MM&zone=…&weather=…&season=…`) through `pnpm e2e --grep @screens` (builds `--mode test`, serves :4317). Keys: 05:30, 07:00, 13:00, 19:30, 21:00, 23:00 (plan §0). Animated tasks add `freeze=0…0.5` frames as `-t{n}`.
   Files land in `reports/screens/<yyyy-mm-dd>/<village>-<zone>-<hhmm>-<weather>-390x844@3.png`.
3. Collect the overlay budget for the same frames (draw calls, particles; the spec asserts the budget and logs it).
4. If sprites changed: `pnpm sprites` and pass the contact sheets `reports/sprites/<id>.png`.
5. Launch `art-director` with the screenshot paths, the contact sheets, the change description, the overlay numbers and the previous verdict if this is a re-review (old and new paths side by side). Do not pre-list the defects you suspect — let it judge unanchored.
6. Relay: verdict (✅/⚠/❌), must-fix vs deferrable notes, budget numbers. No ✅ — the task does not merge to main.
