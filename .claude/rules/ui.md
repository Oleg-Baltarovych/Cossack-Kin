---
paths:
  - "src/ui/**"
  - "src/i18n/**"
---
# UI rules (React DOM over the canvas) — SPEC §6.1, §6.7, §6.8, §10, §11

- React reads the store via `useGame(selector)` (`useSyncExternalStore`); UI dispatches actions and never computes economy itself (costs/income come from core selectors).
- Pixel-perfect DOM: sizes are multiples of the integer scale (CSS var `--px`); 9-slice frames via `border-image`; `image-rendering: pixelated`. Respect `env(safe-area-inset-*)`.
- Text: pixel font with Cyrillic (check і ї є ґ ʼ); sizes 8/16/24 logical px; numbers use tabular figures and go through `formatBig()` only.
- All strings via i18n keys (`building.dnipro.mill.name`); plurals via `Intl.PluralRules` (one/few/many/other for `uk`). Add each new key to both `uk.json` and `en.json` in the same change.
- Accessibility: tap targets ≥ 44×44 pt; status never by color alone (icon + text); "less motion" disables shake/parallax/large tweens; "larger text" ×1.25; separate music/SFX volume.
- Every conditional view has its empty and error state (ad unavailable, corrupted save → restore from backup).
- Juice per SPEC §6.7 (counter lerp 250 ms, pressed state 2 px, bounce once when affordable). Haptics only through `platform/haptics.ts`.
- No mock data in production UI; ads only through `AdsService` (`MockAds` in web/dev).
