# Third-party asset licenses

Every third-party file (art, fonts, audio samples) used in the game: source, author, license, URL, what was changed.
Policy: SPEC §5.4 and `.claude/rules/art.md`. All art and music are currently made in-house by code.

| Asset | Source / URL | Author | License | Changes |
|---|---|---|---|---|
| Press Start 2P (UI font, M1-17) — `src/ui/fonts/PressStart2P-Regular.ttf`, sha256 `034c77f1f05ec89421e4a63f0e3a4ca1ecf852cc6d2bf611f126f275728e017d` | Google Fonts (github.com/google/fonts, ofl/pressstart2p) | The Press Start 2P Project Authors (Cody "CodeMan38" Boisclair) | SIL OFL 1.1 — text in `src/ui/fonts/OFL.txt`; Reserved Font Name «Press Start 2P» | none (unmodified, not subset) |

Pixelify Sans (the SPEC §5.3 candidate) was rejected in M1-17: it has no І (U+0406), О (U+041E), П (U+041F) or ʼ (U+02BC). Silkscreen, Jersey 10 and Micro 5 have no Cyrillic.

Reference images in `docs/art/references/` (public-domain paintings) are documentation only: not traced, not bundled, not listed above.
