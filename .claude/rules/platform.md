---
paths:
  - "src/platform/**"
  - "capacitor.config.ts"
  - "android/**"
  - "ios/**"
---
# Platform rules (Capacitor, ads, storage, notifications) — SPEC §4, §9.4, §9.5, §15

- Core and UI depend on interfaces (`AdsService`, `StorageService`, `NotificationService`, `Analytics`, `Haptics`), never on Capacitor plugins directly. Each has a web/mock implementation.
- Ads: rewarded only. Reward only on the `rewarded` result; `dismissed`/`failed` give nothing and show "Реклама недоступна". Google UMP consent before the first ad request; daily caps per placement (SPEC §4) enforced in core.
- Analytics: only the events from SPEC §13, no personal data, respects consent. Event names are a typed union.
- Notifications: only after the player opts in; ≤ 2 per day; cancel/reschedule on resume.
- Lifecycle: `pause` → save; `resume` → `applyOffline` → return window.
- Storage: two rotating save slots + checksum (SPEC §9.5); each slot write is atomic.
- Verify plugin APIs and Capacitor-version compatibility from installed typings / official docs (context7), not memory.
- Never commit or read keystores, `key.properties`, `.env*`. Real AdMob ids come from build config; test ids in dev.
- Store/policy-facing changes (ads, analytics, notifications, permissions, data collected) → `platform-reviewer`.
