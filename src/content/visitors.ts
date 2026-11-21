// Visitors (plan M2-21, SPEC §2.6 «Мандрівники»): a кобзар, a лірник, a чумак with his віз, a коробейник and a гончар
// pass through the village on a timetable of slots, like the wind — a pure function of (seed, time) in the core
// (core/systems/visitors.ts), never state, never offline. M2 shows them only (render reads the schedule); M6 adds a
// small buff on tap. Numbers here are the timetable's; where each one goes and how fast it walks is the land's (paths).

export const VISITOR_IDS = ['kobzar', 'lirnyk', 'chumak', 'korobeinyk', 'hanchar'] as const;
export type VisitorId = (typeof VISITOR_IDS)[number];

/**
 * The timetable: time is cut into `slotSec` slots; a slot holds a visit with chance `chance`, the visitor drawn by
 * `weight`, its visit lasting `durationS` (arrive, stay, leave) at a seeded offset inside the slot — so a visit never
 * leaves its slot and two visits never overlap (one visitor in the village at a time). `salt` keys the hash streams:
 * frozen (changing it, a slot length or a weight reshuffles every player's visitors; a golden test pins them).
 * Гіпотеза: about one visit an hour, ~ a quarter of the time someone is in the village.
 */
export const VISITOR_SCHEDULE = {
  slotSec: 900,
  chance: 0.6,
  salt: 0x7151,
  /** The least a visitor stays at its spot between walking in and out (content test against the land's routes). */
  minStayS: 90,
  visitors: {
    kobzar: { weight: 3, durationS: 420 },
    lirnyk: { weight: 2, durationS: 330 },
    chumak: { weight: 2, durationS: 360 },
    korobeinyk: { weight: 2, durationS: 330 },
    hanchar: { weight: 2, durationS: 330 },
  },
} as const satisfies {
  readonly slotSec: number;
  readonly chance: number;
  readonly salt: number;
  readonly minStayS: number;
  readonly visitors: Readonly<Record<VisitorId, { readonly weight: number; readonly durationS: number }>>;
};

/**
 * Render's visit clock (M2-21): it runs on the animation clock from the game's time and re-anchors on the game's
 * clock when they drift apart by more than `rebaseMs` (a resumed tab, a loaded save) — the game ticks at 10 Hz, so a
 * smaller gap is only tick lag and walking stays smooth.
 */
export const VISITOR_CLOCK = { rebaseMs: 2000 } as const;
