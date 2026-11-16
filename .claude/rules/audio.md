---
paths:
  - "src/audio/**"
---
# Audio rules — SPEC §7

- `AudioManager` is the only owner of `AudioContext`; created after the first user gesture; suspended on `App.pause` / `visibilitychange`, resumed on resume.
- Audio reacts to store events and scene state only; it never changes game state.
- Polyphony limit: max 3 identical SFX at once; SFX names are a typed union matching SPEC §7.3.
- Crossfade 1.5 s for village / day-night / holiday changes. Ambience volume follows what the camera sees.
- Music: public-domain folk melodies or original compositions only — no modern recordings or other people's arrangements. Record sources in `docs/content-sources.md`; sample libraries need a license entry in `docs/art/LICENSES.md`.
- No clicks (gain ramps, never jump gain to 0) and no clipping (master limiter).
