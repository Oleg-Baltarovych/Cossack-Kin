---
paths:
  - "src/ui/**"
  - "src/i18n/**"
---
# UI rules (React DOM over the canvas) — SPEC §6.1, §6.7, §6.8, §10, §11

- React reads the store via `useGame(selector)` (`useSyncExternalStore`); UI dispatches actions and never computes economy itself (costs/income come from core selectors).
- Pixel-perfect DOM: sizes are multiples of the integer scale (CSS var `--px`); 9-slice frames via `border-image`; `image-rendering: pixelated`. Respect `env(safe-area-inset-*)`.
- Text: Press Start 2P (pixel font with full Ukrainian Cyrillic: check і ї є ґ ʼ in new strings); sizes only `var(--font-s)` / `var(--font-m)` from `ui/theme.ts` (one font px = whole device px, ≈ 1.25 and 2 logical px per font px — not 8/16/24); numbers use tabular figures and go through `formatBig()` only.
- All strings via i18n keys (`building.dnipro.mill.name`); plurals via `Intl.PluralRules` (one/few/many/other for `uk`). Add each new key to both `uk.json` and `en.json` in the same change.
- Accessibility: tap targets ≥ 44×44 pt; status never by color alone (icon + text); "less motion" disables shake/parallax/large tweens; "larger text" ×1.25; separate music/SFX volume.
- Every conditional view has its empty and error state (ad unavailable, corrupted save → restore from backup).
- Juice per SPEC §6.7 (counter lerp 250 ms, pressed state 2 px, bounce once when affordable). Haptics only through `platform/haptics.ts`.
- No mock data in production UI; ads only through `AdsService` (`MockAds` in web/dev).

## Boundaries
- Load `render/index.ts` only by dynamic `import()`; never import render runtime values statically (types and pure helpers like `render/viewport.ts`, `render/debug/params.ts` are fine; never `render/atmosphere/config.ts` — it pulls the layout into the start chunk). `check:dist` fails above 500 000 bytes of start scripts (≈ 494 KB after M4-13): a new tab or window that is not on screen at start goes in its own chunk (`React.lazy`, like «Культура»; its unit tests `await findBy…`).
- Global CSS lives in `src/ui/global.css` (no inline `<style>`: CSP). React `style` (CSSOM) is allowed.
- Time in components = the store's `time.lastSeen` (10 Hz, frozen under `?freeze`), never `Date.now`. Local clock text: `ms + settings.tzOffsetMin` formatted in `UTC`, the day by core `dayAt` — never the device zone.
- Percents, chances and prices come from core views (`core/percent.ts`: `wholePercent` for chances, `effectPercent` — half-percent steps — for bonus lines; both floored); never computed in UI.
- Event-driven windows read `store.onEvents` (one call per change): all `RaidClaimed` of one action = one window; never group by microtask. Window order: save notice → return window → raid chest → story beats; the HUD + sheet are `inert` while one is open.
- Granted loot is already in state; a window only shows it. Coins fly on close (`useCoinLaunch`), never on the event; none under «менше руху».
- Debug presets (`ui/debug/gameDebug.ts`) are memory-only and must be reachable by play (debug-presets test).

## Pixel and font
- Press Start 2P: 1000 units/em = 8 font px; crisp only at whole device px (`uiScale`). Its space is a full cell → `word-spacing: -0.5em` on #root, buttons need `word-spacing: inherit`. No ⚙ or − (U+2212) glyphs.
- NBSP: Prettier/the format hook turns a `' '` escape into a literal NBSP — build it with `String.fromCharCode(0xa0)` (i18n `NBSP`).
- Icons are DOM CSS sprites at natural size + `transform: scale(var(--px-n))` (a `background-size` in `--px` rounds to 1/64 css px → seams at 3.5 dpr). Frames 18×18 (16×16 + 1-px margin), no `overflow: hidden`; `Icon` snaps its box to whole device px (`pixelSnap.ts`); `useDeviceSnap` re-measures on any ancestor's resize (a sheet height tween moves the box without resizing its parent) — never snap only on mount/parent, never mask a snapped box in a baseline. `ICON_IDS` must equal the generator's `ICONS`.
- Do not grow the `ui` atlas (at 113×56 the HUD icons went soft at 412@3.5): new DOM icons go to another sheet (`useIconAtlas(id)`). Every `RelicId` needs `<id>` and `<id>-unknown` in `loot`; every culture node/branch its `CULTURE_ICON` frame in `culture` (frame ids: `.` → `-`, a name segment allows no dot).
- Raid map: draw at `--mpx` = `--k` × `--px`; text is never inside a scaled box. Without art, a missing flag frame or at ×1 show the offers as a button list.
- Full-screen window: header at the top, content top-anchored (spare height under it, `margin-bottom: auto` on its last row), the action footer a direct child of the scroller, `position: sticky; bottom: 0`, opaque, carrying `env(safe-area-inset-bottom)` (the scroller has no bottom padding). Never centre content whose height changes with a choice: the map moved under the finger, off the device-px grid at 412@3.5. Under an opaque full-screen window hide the covered `.layer` (`data-covered`): 412@3.5's last device row is half outside the viewport and shows what lies beneath.
- Prices: `formatPrice` (≤ `PRICE_MAX_CHARS`), the full form in `aria-label`; no atlas → `Icon fallback` text.
- Day-sky blue in DOM = `water-5` (the `sky` ramp is dusk-warm).

## Skin (ADR 014)
- Colours in component CSS are roles `var(--ui-<role>)` from `UI_ROLES` (`ui/theme.ts`), not ramps; a new role goes in the table (the theme test resolves each into `master.json` and rejects hex/`rgb(`/`--c-stone-*` and unknown `--ui-*` in `src/ui/**/*.css`). Exception: the raid-map parchment keeps its ramps.
- Surfaces: `frame` wood 0 (HUD, sheet, plaques), `panel` wood 1 (boards, window body), `card` wood 0 + `--ui-sunken`, `control` wood 2 + `--ui-raised`, `disabled` flat wood 1 with an `edge-off` rim. Selection = 2-px `select` (crimson) frame with a 1-px `bevel-hi` line inside; keyboard focus = 2-px `focus` (plaster 6) outline on every `:focus-visible`, never crimson; gold only on what can be bought or claimed now.
- Shortages: crimson `short` + icon only where the player must act (kharch, the hire, glory on Sich rows and heroes); a ducat shortage (and glory on a culture node) is quiet `meta`, shown only on the nearest unaffordable row (the list picks it from core row views), visually hidden elsewhere (still the button's `aria-describedby`).
- A window that opens on its own (return, story beat) focuses itself (`tabIndex={-1}`, `trapTab` sends Tab to its controls), not its call to action; one opened by a press (chest, map) focuses its action.
- Check text tiers on their surface: `short` and `meta` fail AA on wood 1 (3.95 / 4.35:1) — on a `panel` use `desc` for meta and keep shortages on wood 0.
- The UI's phase of day is `html[data-phase]` (`ui/phase.ts` from the sky keys in `render/atmosphere/skyKeys.ts`, the pure module UI may import — never `config.ts`).


## Components
- HUD counters: `useCounter` writes the element's text itself — never give that span JSX children; the visible number is `aria-hidden`, a visually hidden twin carries the full value. `shownValue` shares rounding with `formatBig` — change it in one place.
- Bottom sheet: the bar drag follows the pointer on `window` (capturing on the bar retargets a tab click); the click that ends a drag is swallowed; tabs use manual activation. Esc is a window listener while open.
- Half-sheet height budget is a few px on 390: any new height above the «Походи» block (strip, mode picker, header) breaks the hire-row peek (raids-block.spec) first.
- `useDialogFocus` returns focus to the opener, or to the nearest `[tabindex]` ancestor when the window's own press removed the opener; a window that opens on its own never steals focus back. Windows never exceed the screen (`.dialog` max-height 100 %, body scrolls).
- A running raid card re-renders only when `leftSec` changes; «Ще раз» is one action `claimRaid { again: true }` (refusal = `RaidAgainRefused`). Red dots are per tab; an idle slot never makes one.
- Quest tap → target: a missing `[data-target]` or a locked Sich target shows a «Ще закрито…» hint, never «підсвічено»; the row scrolls in only after the sheet stands at its height.
- A tab with no world zone («Культура», «Ще»): `zoneOf` null — choosing it moves no camera and the camera's zone never switches the sheet off it.
- DOM «менше руху» = `html[data-motion=reduced]` as well as `prefers-reduced-motion`.
- Culture tree lines: place nodes and line stubs on one box's 25/50/75 % (four quarter columns), never a gap-based grid — a 1-device-px seam where a stub meets the bar. A node's words drop under its icon (flex-wrap, `min-width: min-content`) rather than clip at larger text.
- Durations shared with render (tier banner) live in `content/juice.ts`, passed to CSS as vars.
