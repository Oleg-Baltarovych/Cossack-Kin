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
  /** Actions per session (median), from S2 on: S1 is onboarding (owner 2026-11-22). */
  sessionActions: { min: 5, max: 15 },
  /** Report only: actions in S1 (the M2-27 tune runs ~35 there). */
  s1MaxActions: 40,
  /** The bot's day. */
  sessionsPerDay: 2,
  sessionSec: 7 * 60,
  /** The bot taps the world every this many seconds during a session (SPEC §12.3). */
  tapEverySec: 2,
  /** Hours (UTC) the two daily sessions start at; the gaps between them are offline. */
  sessionStartHours: [8, 20],
  /** Novelty (SPEC §2.3–2.4, ADR 009): sessions in a row with nothing new, week 1 (14 sessions); days, days 8–60. */
  // Week 1 counts only up to the bloom session (after bloom the move is the novelty, M5). M1 allowed 1 empty session;
  // back to 0 with the story beats and «Наказ кошового» of M2 (owner, 2026-11-19; M2-27).
  novelty: { week1Sessions: 14, maxSessionsWithoutNovelty: 0, maxDaysWithoutNovelty: 0 },
} as const;

/** A novelty the simulator logs (what exists in the core). A step of «Наказ кошового» is new, a chore is not (plan Q6). */
export type NoveltyKind =
  | 'firstPurchase'
  | 'building'
  | 'tier'
  | 'sichBuilding'
  | 'sichTier'
  | 'firstHire'
  | 'churchOpen'
  | 'firstStorm'
  | 'bloom'
  /** A story beat fired (ref: the beat id, SPEC §2.5). */
  | 'storyBeat'
  /** A step of «Наказ кошового» claimed (ref: the step id; generated: `generated:<id>@<level>`, SPEC §3.10). */
  | 'chainStep';

/** One entry of the discovery calendar (SPEC §2.4) the M1 simulator can measure: first seen within [min, max] sessions. */
export interface CalendarEntry {
  readonly id: string;
  readonly kind: NoveltyKind;
  /** `building` / `sichBuilding` / `storyBeat` / `chainStep`: an id; `tier` / `sichTier`: `<id>@<level>`; otherwise empty. */
  readonly ref: string;
  readonly sessions: { readonly min: number; readonly max: number };
}

/** Land 1, week 1: the bold (M1-measurable) rows of SPEC §2.4 and the story beats of M2 (Q7; a beat's window is the
 * one of its trigger's row). Windows are targets, not a script. */
export const CALENDAR_LAND1: readonly CalendarEntry[] = [
  { id: 'first-purchase', kind: 'firstPurchase', ref: '', sessions: { min: 1, max: 1 } },
  { id: 'garden', kind: 'building', ref: 'garden', sessions: { min: 1, max: 2 } },
  { id: 'apiary', kind: 'building', ref: 'apiary', sessions: { min: 1, max: 2 } },
  { id: 'first-cossack', kind: 'firstHire', ref: '', sessions: { min: 1, max: 2 } },
  { id: 'beat-shore', kind: 'storyBeat', ref: 'khortytsia.shore', sessions: { min: 1, max: 1 } },
  { id: 'beat-messenger', kind: 'storyBeat', ref: 'khortytsia.messenger', sessions: { min: 1, max: 3 } },
  { id: 'kurins', kind: 'sichBuilding', ref: 'kurins', sessions: { min: 1, max: 2 } },
  { id: 'field-10', kind: 'tier', ref: 'field@10', sessions: { min: 1, max: 2 } },
  { id: 'windmill', kind: 'building', ref: 'windmill', sessions: { min: 1, max: 3 } },
  { id: 'potter', kind: 'building', ref: 'potter', sessions: { min: 2, max: 4 } },
  { id: 'first-storm', kind: 'firstStorm', ref: '', sessions: { min: 2, max: 6 } },
  { id: 'smithy', kind: 'building', ref: 'smithy', sessions: { min: 3, max: 5 } },
  { id: 'maidan-10', kind: 'sichTier', ref: 'maidan@10', sessions: { min: 3, max: 5 } },
  { id: 'beat-council', kind: 'storyBeat', ref: 'khortytsia.council', sessions: { min: 3, max: 5 } },
  { id: 'tavern', kind: 'building', ref: 'tavern', sessions: { min: 4, max: 6 } },
  { id: 'fair', kind: 'building', ref: 'fair', sessions: { min: 5, max: 8 } },
  { id: 'church', kind: 'churchOpen', ref: '', sessions: { min: 6, max: 9 } },
  { id: 'beat-pokrova', kind: 'storyBeat', ref: 'khortytsia.pokrova', sessions: { min: 6, max: 9 } },
  { id: 'bloom', kind: 'bloom', ref: '', sessions: { min: 8, max: 12 } },
];
