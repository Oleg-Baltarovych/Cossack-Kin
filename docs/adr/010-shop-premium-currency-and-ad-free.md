# 010. Monetization: player-chosen rewarded ads plus an in-game shop (pysanky, ad-free, cosmetics, convenience)

- Status: Accepted (owner 2026-11-19: «так з рекомендаціями» — писанки as the one premium currency with a craft tooltip; payer bound ≤ 1.75×; on-device verification in v1; top pack $19.99; «Козацька казна» non-renewing, after MVP; daily calendar + daily quests in MVP; M8 split into M8a/M8b; all prices and rates are hypotheses for M8). CLAUDE.md and rules/platform.md updated for the `noAds` entitlement
- Date: 2026-11-19
- Supersedes in part: [006](006-rewarded-only-ads.md) — the "rewarded ads only / no IAP until after release" part. Kept from 006: rewarded-only ad format, player-initiated, UMP, caps in core, ≤ ~1.5× ad effect, no banners/interstitials.

## Context
- The owner wants revenue: a premium currency sold in a shop, ads the player chooses to watch, a paid ad-free option, and always-available quests, while players neither stay months in one land nor finish everything in a month.
- Pillars (SPEC §1): cozy, respectful of time, honest. No backend in v1 (ADR 003); pure analytic core (ADR 002).
- Google Play: Play Billing is mandatory for digital goods and virtual currency; Play Billing Library 8 is required for new apps/updates until 2027-08-31 (PBL 7 until 2026-08-31) — verified 2026-11-19 on developer.android.com.

## Decision
- **One premium currency = pysanky** (already earned in play), now also sold. Free income ≈ 20/day, anchor 100 ≈ $0.99. Every sink is open to free players.
- **Shop (SPEC §4.2):** ad-free (non-consumable; every rewarded placement grants instantly under the same caps, ad SDK not initialized), a one-time starter pack, currency packs $0.99–$19.99, a 30-day non-renewing pass (later than MVP), cosmetics, capped convenience (3rd raid slot, +offline hours within the 24 h ceiling, daily-capped time skips).
- **Never sold:** regalia, glory, levels, legacy nodes, relics, raid success, land/mechanic access, bloom skip, permanent income multipliers, anything random.
- **Bounds checked by `pnpm balance --profile free|ads|payer`:** ads ≤ 1.5×, payer ≤ 1.75× faster bloom than free; the whole of v1 for a payer still ≥ ~2 months.
- **Billing:** `StoreService` (SPEC §9.4) over a Capacitor plugin; recommended `cordova-plugin-purchase` / `capacitor-plugin-cdv-purchase` (MIT, PBL 8.3). Grant in core (`grantPurchase`, idempotent by token hash) → persist → then consume/acknowledge.
- **Verification in v1 on device** (Play signature + re-query of owned purchases at every start); entitlements are never trusted from a save (cache only; import clears it). A serverless verifier (Play Developer API + RTDN for refunds) is a follow-up after metrics.
- **Quests (SPEC §3.10)** make returning worthwhile without pressure: chain + chores in M2, daily/weekly in M6. Small, scale-free rewards.
- Milestones: M8 splits into M8a (ads) and M8b (store); the daily calendar and daily quests (M6) should join the MVP so the shop is fair to free players.

## Alternatives considered
- Separate hard currency next to pysanky — two premium-ish currencies confuse and split sinks; rejected.
- Ad-free = only removes ad buttons — in a rewarded-only game that would be a pure loss for the buyer; rejected.
- Auto-renewing subscription pass — needs server-side status/refund handling for robustness; postponed.
- RevenueCat — removes our own verification work but adds a third-party backend, data sharing and a 1 % fee above $2.5K MTR; kept as fallback.
- Capawesome Purchases — paid Insiders licence; rejected for cost.
- Own server verification at launch — contradicts ADR 003; a cracked purchase in an offline single-player game harms only revenue.

## Consequences
- Positive: revenue paths matching common idle-game practice without banners, paywalls or loot boxes; one currency; bounds are CI-checked.
- Negative / trade-offs: more surface (shop UI, cosmetics art, billing edge cases, Play Console setup, Data safety/IARC answers); consumable refunds are not detectable in v1; CLAUDE.md's "reward only after the SDK rewarded callback" rule must gain "or an active `noAds` entitlement" (owner edits CLAUDE.md / `.claude/rules`).
- Follow-ups: `src/content/monetization.ts`; save fields `shop`, `purchases`, `quests` with migrations; `pnpm balance` profiles; M8b plan; verify plugin, PBL and Play fee terms again at M8.
