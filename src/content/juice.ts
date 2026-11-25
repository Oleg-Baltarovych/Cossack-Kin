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
  /** A quest tap with no row to show (a counter, a locked or missing row; M3-15): how long its hint stays up. */
  hintMs: 6500,
  /** A revealed row scrolls in once the sheet stands at its height: checked every `snapMs`, at most this many times. */
  revealChecks: 10,
} as const;

/**
 * Coins flying to their HUD counter on a large income (plan M2-25/26, SPEC §6.7): a quest claim, the return window's
 * «Забрати», a story beat's reward when its window closes. An income is large when it is worth at least the first
 * tier's `minIncomeSec` seconds of that currency's income per second now (an idle game's amounts grow without bound,
 * so a fixed number would soon mean «always» or «never»; with no income at all there is no measure and any amount sends
 * the first tier); a larger one sends the coins of the highest tier it reaches. Each coin flies a quadratic Bézier
 * from the pressed button to the counter: the control point stands `arcPx` logical px above the middle of the line,
 * shifted sideways by `spreadPx` per coin from the centre one, so the coins fan out, and stays `marginPx` inside the
 * screen (the curve stays inside its three points, so no coin leaves the screen). One leaves every `staggerMs`, each
 * is `flightMs` in the air; positions are worked out at launch for every `frameMs`, on the logical pixel grid. On
 * take-off a coin shows faint for `fadeInMs`, and it wears a 1-px ink outline, so it reads as UI over the world.
 * «Менше руху»: none (the counter and the read-out still say it).
 */
export const COIN_FLIGHT = {
  tiers: [
    { minIncomeSec: 60, coins: 5 },
    { minIncomeSec: 1800, coins: 8 },
  ],
  staggerMs: 70,
  flightMs: 650,
  frameMs: 16,
  arcPx: 48,
  spreadPx: 20,
  marginPx: 8,
  fadeInMs: 48,
} as const;

/**
 * An ordinary upgrade — a level past the first (M2-29 D, SPEC §6.5 «звичайне покращення»): `coins` coins fly from the
 * HUD counter of the currency spent (ducats for the farm, glory for the Sich) to the building, on COIN_FLIGHT's curve
 * and timing (only while the building is in view above the sheet); when the first lands (`squashDelayMs`) the building
 * swells to `squashPeak` and back over `squashMs`, drawn in whole px in the low-res world like the construction pop
 * (plan Q5, ART-BIBLE §2). Only on a player's purchase — never on load, offline or the return. «Менше руху»: neither
 * (the row's level and the counter still say it).
 */
export const UPGRADE_JUICE = {
  coins: 3,
  squashPeak: 1.08,
  squashMs: 120,
  squashDelayMs: COIN_FLIGHT.flightMs,
} as const;

/**
 * The HUD counters (SPEC §6.7): a new amount rolls from the one shown to it in `lerpMs` (ease-out), restarting from
 * where it is on every change (10 Hz ticks keep it rolling). «Менше руху»: the new amount at once. The screen-reader
 * text is always the exact amount, at once.
 */
export const COUNTER = {
  lerpMs: 250,
} as const;

/**
 * Buttons (SPEC §6.7): pressed, a button moves down `pressPx` logical px; a buy button that turns affordable hops once
 * (`hopPx` up and back in whole logical px over `hopMs`; not on mount, not on a buy-mode switch, not under «менше
 * руху»).
 */
export const BUTTON = {
  pressPx: 2,
  hopPx: 3,
  hopMs: 300,
} as const;

/**
 * The camera shake (SPEC §6.7): `px` logical px, only vertically (the HUD and the sheet hide the rows it uncovers;
 * a sideways shake would bare the world's edge), alternating every `stepMs` and fading to `minPx`, over `ms`. Only on
 * the big events listed here — a building's new visual tier, and a relic found on a raid's claim (M3-12: rare, and
 * the chest's peak; a plain claim does not shake); the Розквіт (M5) joins the list. «Менше руху»: none.
 */
export const SHAKE = {
  px: 2,
  minPx: 1,
  ms: 150,
  stepMs: 30,
  events: ['TierReached', 'RelicFound'],
} as const;

/**
 * Opening a raid's chest (plan M3-12, §0.1 П4): the chest shakes `shakeMs` (± `shakePx` logical px, a step every
 * `shakeStepMs`: `shakeCycles` left–right cycles), opens, then the items come one by one every `itemStepMs`; a relic is its own beat of `relicMs` with
 * its name and fact. A tap or Enter shows the whole list at once; «Забрати» works from the first frame. «Менше руху»:
 * the list at once — no shake, no coins.
 */
export const RAID_REVEAL = {
  shakeMs: 480,
  shakeStepMs: 60,
  /** shakeMs / (2 × shakeStepMs): the CSS animation's iteration count (content test keeps them in step). */
  shakeCycles: 4,
  shakePx: 1,
  itemStepMs: 300,
  relicMs: 1200,
} as const;
