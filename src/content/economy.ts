// Economy constants shared by every land (SPEC §3.0–3.8; plan M1-03). Data only: the core's formulas read these.
// Numbers marked «гіпотеза» are not given by SPEC: they are starting values for `pnpm balance`, tuned in M1-15
// (SPEC-REVIEW B-01). Times are in seconds.

/** A farm/suburb milestone: reaching `level` multiplies the building's income by `mult` (and is a new visual tier). */
export interface Milestone {
  readonly level: number;
  readonly mult: number;
}

/** Farm and suburb buildings (SPEC §3.2): levels 0…levelMax, income ×2 at each milestone, ×3 at 100. */
export const FARM = {
  levelMax: 100,
  milestones: [
    { level: 10, mult: 2 },
    { level: 25, mult: 2 },
    { level: 50, mult: 2 },
    { level: 75, mult: 2 },
    { level: 100, mult: 3 },
  ] satisfies readonly Milestone[],
} as const;

/** Sich buildings (SPEC §3.2.1): bought with glory, levels 0…levelMax, a visual tier at each milestone. */
export const SICH = {
  levelMax: 50,
  milestones: [10, 25, 50],
} as const;

/**
 * Levels at which a building's visual tiers start (SPEC §3.2/§3.2.1, plan M2-05): tier I at level 1 (the building
 * stands), then one tier per milestone — farm/suburb I–VI at 1/10/25/50/75/100, Sich I–IV at 1/10/25/50. Level 0 is
 * tier 0 (empty plot). The number of entries is the building's top tier.
 */
export const TIER_LEVELS = {
  farm: [1, ...FARM.milestones.map((m) => m.level)],
  sich: [1, ...SICH.milestones],
} as const satisfies Readonly<Record<'farm' | 'sich', readonly number[]>>;

/** Bulk-buy modes of the building list (SPEC §3.2). `max` buys as many as the ducats allow. */
export const BUY_MODES = [1, 10, 25, 'max'] as const;

/** Tap on empty ground (SPEC §3.3): max(scale × minScaleMult, incomePerSec × incomeShare); at most maxPerSec (Q8). */
export const TAP = {
  incomeShare: 0.3,
  minScaleMult: 1,
  maxPerSec: 10,
} as const;

/**
 * Offline and the return window (SPEC §3.8; plan §0, Q7). A gap longer than `onlineGapSec` between ticks is handled
 * as offline (cap, report); the return window shows when the player was away ≥ `returnMinSec`.
 */
export const OFFLINE = {
  capSec: 8 * 3600,
  ceilingSec: 24 * 3600,
  mult: 1,
  forwardJumpCapSec: 7 * 24 * 3600,
  returnMinSec: 60,
  onlineGapSec: 5,
} as const;

/** «Харч» (SPEC §3.0): maxCossacks = floor(Σ foodLevel × kharchPerLevel / kharchPerCossack). Гіпотеза. */
export const FOOD = {
  kharchPerCossack: 10,
} as const;

/**
 * «Оборона» (SPEC §3.0): every Sich level adds `defencePerLevel` (per building, in sich.ts) points; the farm's income
 * gets +incomePerPoint per point. Гіпотеза.
 */
export const DEFENCE = {
  incomePerPoint: 0.005,
} as const;

/**
 * Army in M1 (SPEC §3.4, plan Q1): infantry only, no raids. Hire cost unitBase × scale × hireGrowth^count; passive
 * glory/s = ArmyPower × gloryPerPower. Glory accrues only up to the store's cap (base + treasury, sich.ts).
 */
export const ARMY = {
  infantry: { unitBase: 50, power: 1 },
  hireGrowth: 1.13,
  gloryPerPower: 0.02,
  gloryCapSec: 4 * 3600, // гіпотеза
} as const;

/** A new game (plan M1-04): enough ducats for the first field at once — the first purchase well inside 15 s. Гіпотеза. */
export const START = {
  ducats: 10,
  lang: 'uk',
  numberFormat: 'words',
} as const;

/** Bloom of a land (SPEC §3.6; plan Q6: M1 checks conditions 1–2 plus the land's goal, no resettling yet). */
export const BLOOM = {
  farmLevel: 50,
  sichLevel: 25,
} as const;
