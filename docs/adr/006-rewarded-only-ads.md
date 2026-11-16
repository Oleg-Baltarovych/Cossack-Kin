# 006. Monetization: player-initiated rewarded ads only

- Status: Accepted
- Date: 2026-11-16

## Context
- Design pillar "honest ads": the game is fully completable without ads (SPEC §1, §4).

## Decision
- Only rewarded ads (AdMob via `@capacitor-community/admob`), always started by the player, at the placements and daily caps in SPEC §4. No banners, interstitials or paywalls.
- Reward only on the SDK `rewarded` result; caps enforced in core; "day" derives from monotonic `maxSeen`.
- Google UMP consent before the first ad request; analytics respects consent. Audience: not children.
- `AdsService` interface with `AdMobAds` and `MockAds` (web/dev).
- Balance check: ads may shorten time-to-bloom by at most ~1.5× (`pnpm balance --ads`).

## Alternatives considered
- Interstitials / banners — break the cozy experience and the pillar.
- Premium price — kills discovery for a niche game.

## Consequences
- Positive: player trust, simpler policy compliance.
- Negative / trade-offs: modest revenue; optional "support the developer" IAP stays an open question (SPEC §17).
