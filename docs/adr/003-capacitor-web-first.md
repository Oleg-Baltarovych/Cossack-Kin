# 003. Capacitor, web-first development, no backend in v1

- Status: Accepted
- Date: 2026-11-16

## Context
- Targets: Android first, then iOS; a web build for development, screenshots and an itch.io demo (SPEC §1, §15). Solo developer.

## Decision
- One Vite web codebase wrapped by **Capacitor** for Android/iOS. M0–M8 are developed and tested as the web build; `android/` is added for M8 (ads) / M9 (release).
- Platform features behind interfaces in `src/platform/` (storage, ads, analytics, notifications, haptics, lifecycle) with web/mock implementations.
- No backend in v1: local saves (two rotating slots + checksum) and export/import string.

## Alternatives considered
- Native Android (Kotlin) — two codebases, no web demo.
- Unity / Godot — would replace the whole TS/React stack and the AI-assisted workflow.
- Cloud saves in v1 — server cost and complexity without proven need.

## Consequences
- Positive: fast iteration in the browser, deterministic Playwright screenshots, one codebase for three targets.
- Negative / trade-offs: WebView performance limits (mitigated by ADR 001); plugin compatibility must be verified per Capacitor version.
- Follow-ups: check `@capacitor-community/admob` support for the current Capacitor major before M8.
