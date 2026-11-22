// Cosmetic timings shared by render and the DOM UI (plan M2-12): one source, so the world's tier celebration and the
// «Тір II» banner end together. Not balance: nothing here changes the economy.

/** How long a new tier is celebrated: the rising standard in the world and the DOM banner (ms). */
export const TIER_CELEBRATION_MS = 3000;

/**
 * The bottom sheet (plan M2-13, SPEC §6.1): three heights — collapsed (the tab bar), half, full (up to the HUD). Half
 * is `halfRatio` of the screen (ART-BIBLE §9: it leaves the work zone in view; the lowest plots stand at ~70–75 % of
 * the height), never less than the bar plus `minHalfBodyPx` (the one-line quest strip, the buy picker and the first
 * building row whole — M2-25 review). A drag on the bar
 * starts past `dragSlopPx` css px; on release a flick faster than `flickPxPerMs` (over the last `velocityWindowMs`)
 * goes one state on in its direction, a slower one snaps to the nearest height. Snapping takes `snapMs` («менше
 * руху»: none). A tapped building's row keeps its gold rim `highlightMs` (aria-current until the next action).
 */
export const SHEET = {
  halfRatio: 0.3,
  minHalfBodyPx: 190,
  dragSlopPx: 8,
  flickPxPerMs: 0.5,
  velocityWindowMs: 100,
  snapMs: 180,
  highlightMs: 2000,
} as const;

/**
 * Coins flying from a claimed quest to its counter in the HUD (plan M2-25, SPEC §6.7): `coins` ducat or glory icons,
 * one every `staggerMs`, each `flightMs` in the air. «Менше руху»: none (the counter and the strip still say it).
 */
export const COIN_FLIGHT = {
  coins: 5,
  staggerMs: 70,
  flightMs: 650,
} as const;
