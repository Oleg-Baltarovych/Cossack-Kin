// The target pace (SPEC §2.3, §12.3; plan M1-03): the corridor `pnpm balance --check` holds land 1 to (M1-14).
// The bot plays `sessionsPerDay` sessions of `sessionSec` (plan Q10: one MAX press on the best target = one action).

export const PACING = {
  /** First purchase within this many seconds of a new game. */
  firstPurchaseMaxSec: 15,
  /** Bloom of land 1 within [min, max] days at the session rhythm below. */
  bloomDays: { min: 4, max: 6 },
  /** Each next land takes 30–50 % longer (checked from land 2, M5). */
  nextLandSlowdown: { min: 1.3, max: 1.5 },
  /** «Відчутні» purchases (new tier, new building, new Sich tier, new unit type) bought from 8 h of offline income. */
  offline8hNoticeable: { min: 2, max: 4 },
  /** Actions per session. */
  sessionActions: { min: 5, max: 15 },
  /** The bot's day. */
  sessionsPerDay: 2,
  sessionSec: 7 * 60,
} as const;
