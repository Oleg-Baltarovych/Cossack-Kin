---
paths:
  - "src/platform/**"
  - "capacitor.config.ts"
  - "android/**"
  - "ios/**"
---
# Platform rules (Capacitor, ads, storage, notifications) — SPEC §4, §9.4, §9.5, §15

- Core and UI depend on interfaces (`AdsService`, `StorageService`, `NotificationService`, `Analytics`, `Haptics`), never on Capacitor plugins directly. Each has a web/mock implementation.
- Ads: rewarded only. Reward only on the `rewarded` result (or instantly with an active `noAds` entitlement, ADR 010); `dismissed`/`failed` give nothing and show "Реклама недоступна". Google UMP consent before the first ad request; daily caps per placement (SPEC §4) enforced in core.
- Analytics: only the events from SPEC §13, no personal data, respects consent. Event names are a typed union.
- Notifications: only after the player opts in; ≤ 2 per day; cancel/reschedule on resume.
- Lifecycle: `pause` → save; `resume` → `applyOffline` → return window.
- Storage: two rotating save slots + checksum (SPEC §9.5); each slot write is atomic.
- Verify plugin APIs and Capacitor-version compatibility from installed typings / official docs (context7), not memory.
- Never commit or read keystores, `key.properties`, `.env*`. Real AdMob ids come from build config; test ids in dev.
- Store/policy-facing changes (ads, analytics, notifications, permissions, data collected) → `platform-reviewer`.

## As built
- A hidden tab is an absence: `driveGame` stops the loop while hidden/pagehide (throttled background timers would otherwise count as online time — no caps, no return window).
- `createLoop.start` goes through `resume`, so a loaded save resumes like a return; it writes the device zone via `setSettings({ tzOffsetMin })` when it differs.
- The saver always writes the slot that was NOT just loaded/written; a «newer» save disables saving. Debug `?state=` presets and `?freeze` play in memory and never touch `ck.save_a/b`. One tab runs the game (Web Lock `cossack-kin-game`).
- Autosave listens to `store.onEvents` (one write per commit) and writes at once after `RaidStarted`/`RaidClaimed`.
- Notification plan: schedule `raid.0…k-1` first (same id replaces), then cancel leftover ids up to `RAIDS.maxSlots` (never a gap), serialised in one promise chain, only `at > now()`. Replan on start, claim, `StateReplaced`, a language change, every resume and once at boot. The whole replan is in try/catch — never throw into store delivery.
- M6 adapter: int ids via a stable table, inexact scheduling only (no `SCHEDULE_EXACT_ALARM`), adapter-owned channel (plan M3 «Відкладено після M3»).
- Stale deploy: `chunkReload.ts` reloads once per tab session on `vite:preloadError`.
