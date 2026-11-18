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
  /** The bot taps the world every this many seconds during a session (SPEC §12.3). */
  tapEverySec: 2,
  /** Hours (UTC) the two daily sessions start at; the gaps between them are offline. */
  sessionStartHours: [8, 20],
  /** Novelty (SPEC §2.3–2.4, ADR 009): sessions in a row with nothing new, week 1 (14 sessions); days, days 8–60. */
  novelty: { week1Sessions: 14, maxSessionsWithoutNovelty: 0, maxDaysWithoutNovelty: 0 },
} as const;

/** A novelty the simulator logs (M1: what exists in the core). */
export type NoveltyKind =
  | 'firstPurchase'
  | 'building'
  | 'tier'
  | 'sichBuilding'
  | 'sichTier'
  | 'firstHire'
  | 'churchOpen'
  | 'firstStorm'
  | 'bloom';

/** One entry of the discovery calendar (SPEC §2.4) the M1 simulator can measure: first seen within [min, max] sessions. */
export interface CalendarEntry {
  readonly id: string;
  readonly kind: NoveltyKind;
  /** `building` / `sichBuilding`: an id; `tier` / `sichTier`: `<id>@<level>`; otherwise empty. */
  readonly ref: string;
  readonly sessions: { readonly min: number; readonly max: number };
}

/** Land 1, week 1: the bold (M1-measurable) rows of SPEC §2.4. Windows are targets for M1-15, not a script. */
export const CALENDAR_LAND1: readonly CalendarEntry[] = [
  { id: 'first-purchase', kind: 'firstPurchase', ref: '', sessions: { min: 1, max: 1 } },
  { id: 'garden', kind: 'building', ref: 'garden', sessions: { min: 1, max: 2 } },
  { id: 'apiary', kind: 'building', ref: 'apiary', sessions: { min: 1, max: 2 } },
  { id: 'first-cossack', kind: 'firstHire', ref: '', sessions: { min: 1, max: 2 } },
  { id: 'kurins', kind: 'sichBuilding', ref: 'kurins', sessions: { min: 1, max: 2 } },
  { id: 'field-10', kind: 'tier', ref: 'field@10', sessions: { min: 1, max: 2 } },
  { id: 'windmill', kind: 'building', ref: 'windmill', sessions: { min: 1, max: 3 } },
  { id: 'potter', kind: 'building', ref: 'potter', sessions: { min: 2, max: 4 } },
  { id: 'first-storm', kind: 'firstStorm', ref: '', sessions: { min: 2, max: 6 } },
  { id: 'smithy', kind: 'building', ref: 'smithy', sessions: { min: 3, max: 5 } },
  { id: 'maidan-10', kind: 'sichTier', ref: 'maidan@10', sessions: { min: 3, max: 5 } },
  { id: 'tavern', kind: 'building', ref: 'tavern', sessions: { min: 4, max: 6 } },
  { id: 'fair', kind: 'building', ref: 'fair', sessions: { min: 5, max: 8 } },
  { id: 'church', kind: 'churchOpen', ref: '', sessions: { min: 6, max: 9 } },
  { id: 'bloom', kind: 'bloom', ref: '', sessions: { min: 8, max: 12 } },
];
