// Raids of land 1 (SPEC §3.4, §2.6; plan M3-02; ADR 012). Data only: the formulas are core/systems/raids.ts (M3-03).
// Every number not fixed by SPEC is a «гіпотеза» for the M3-08 balance (`pnpm balance`); the reasoning is in the
// comments. Times are in seconds. Ids are saved (a running raid stores its tier and region): renaming one needs a
// save migration.

import type { Village } from './villages/khortytsia.ts';

export const RAID_TIER_IDS = ['m5', 'm30', 'h1', 'h4', 'h8'] as const;
export type RaidTierId = (typeof RAID_TIER_IDS)[number];

/** Whether `id` names a tier (an action's payload is typed, but a stale or forged id must be refused, not thrown on). */
export function isRaidTierId(id: string): id is RaidTierId {
  return (RAID_TIER_IDS as readonly string[]).includes(id);
}

/** A tier's place in RAID_TIER_IDS (shorter first): «tier ≥ RELICS.pityMinTier» and the like. */
export function tierRank(id: RaidTierId): number {
  return RAID_TIER_IDS.indexOf(id);
}

/**
 * A duration tier (SPEC §3.4). Loot is «N seconds of income» measured at the start by the steady rate
 * (`steadyModifiers`, Q4): ducats = farm income × `lootSec` × lootMult, glory = glory rate × `gloryLootSec` ×
 * lootMult (with the `REWARD.minPerMinute` floor), so the same tier means the same in every land and stage.
 */
export interface RaidTier {
  readonly id: RaidTierId;
  readonly durationSec: number;
  /** Recommended power P in land 1 (other lands scale it with their army, M5+). Start needs ≥ minPowerShare × P. */
  readonly power: number;
  readonly lootSec: number;
  readonly gloryLootSec: number;
  /** Chance of RAIDS.pysanky on a success (Q6: only tiers ≥ 1 h). */
  readonly pysankyChance: number;
  /** Chance of a relic on a success, before relicChanceMult (relics only from RELICS.pityMinTier up). */
  readonly relicChance: number;
  readonly nameKey: string;
  readonly textKey: string;
}

function tier(t: Omit<RaidTier, 'nameKey' | 'textKey'>): RaidTier {
  return { ...t, nameKey: `raid.tier.${t.id}.name`, textKey: `raid.tier.${t.id}.text` };
}

/*
 * Гіпотеза (M3-08 tunes). Army power of the M2 bot (seed 1/7, steady mods): ≈ 50–60 after day 1, ≈ 150–200 after
 * day 2–3, ≈ 300–390 on day 4, ≈ 530 on day 7.
 * - P: m5 = 1 — one Cossack is a sure success (Q19, content test); m30 20 / h1 80 open in S1–S2 (start at ½ P = 10 /
 *   40 Cossacks), so the 30-min pity raids begin early and the first relic lands S2–S5; h4 450 opens at 225 ≈ S6–S8
 *   (calendar «похід 4 год» S6–S10); h8 900 opens at 450 ≈ day 6 and reaches 100 % only after the Розквіт.
 * - Loot falls as a share of the duration (20 % → ≈ 8 %): short raids reward the session, long ones are «на ніч».
 *   Two slots running 2×8 h + 2×4 h a day at chance 1 give ≈ 7 700 s ≈ 2 h of income against ≈ 16 h from the
 *   offline returns — ≈ 13 %, the top of the plan's 5–15 % share (§4); misses and lower chances bring it down.
 *   Glory uses the same seconds (its offline store is capped at 4 h+, so a raid's glory weighs a little more).
 * - Pysanky: 1 h 5 %, 4 h 15 %, 8 h 25 % of 1–2 — about one a day from raids, far below the ≈ 20/day of ADR 010.
 * - Relics: 30 min 8 % … 8 h 35 %; the pity (RELICS) makes the first certain by the 4th qualifying success.
 */
export const RAID_TIERS: readonly RaidTier[] = [
  tier({ id: 'm5', durationSec: 300, power: 1, lootSec: 60, gloryLootSec: 60, pysankyChance: 0, relicChance: 0 }),
  tier({
    id: 'm30',
    durationSec: 1800,
    power: 20,
    lootSec: 270,
    gloryLootSec: 270,
    pysankyChance: 0,
    relicChance: 0.08,
  }),
  tier({
    id: 'h1',
    durationSec: 3600,
    power: 80,
    lootSec: 450,
    gloryLootSec: 450,
    pysankyChance: 0.05,
    relicChance: 0.12,
  }),
  tier({
    id: 'h4',
    durationSec: 4 * 3600,
    power: 450,
    lootSec: 1440,
    gloryLootSec: 1440,
    pysankyChance: 0.15,
    relicChance: 0.25,
  }),
  tier({
    id: 'h8',
    durationSec: 8 * 3600,
    power: 900,
    lootSec: 2400,
    gloryLootSec: 2400,
    pysankyChance: 0.25,
    relicChance: 0.35,
  }),
];

/**
 * Slots and the SPEC thresholds (§3.4). `slots` are open in M3; the state stores `maxSlots` (a 3rd slot later —
 * Чайки M4, Родове дерево M5, писанки M8b — without a save bump). `squadSize` Cossacks (+ the otaman and the standard
 * bearer) leave the scene with a raid — from the ones already shown, at most half the budget (plan R3). Returns
 * within `alertMergeSec` of each other make one notification (Q18). `pysanky`: how many a pysanky roll gives (Q6).
 */
export const RAIDS = {
  slots: 2,
  // Part of the save v4 shape (`V4_RAID_SLOTS`, test): changing it needs a save migration.
  maxSlots: 3,
  minPowerShare: 0.5,
  chanceMin: 0.35,
  failShare: 0.3,
  squadSize: 5, // гіпотеза (art: M3-14)
  alertMergeSec: 1800,
  pysanky: { min: 1, max: 2 },
} as const;

/** The map of the Lower Dnipro (Q11), in logical px; markers keep `marginPx` from its edge (art: M3-10). */
export const RAID_MAP = { w: 180, h: 150, marginPx: 8 } as const;

export const REGION_IDS = ['samara', 'vovchiVody', 'porohy', 'kinskiVody', 'tavan', 'dykePole'] as const;
export type RegionId = (typeof REGION_IDS)[number];

/** A region of the board (Q12: geography only — the opponent is never named or shown, SPEC §16). */
export interface Region {
  readonly id: RegionId;
  /** Marker on RAID_MAP, north up (Khortytsia ≈ (80, 78)). */
  readonly x: number;
  readonly y: number;
  readonly nameKey: string;
  readonly textKey: string;
}

function region(id: RegionId, x: number, y: number): Region {
  return { id, x, y, nameKey: `region.khortytsia.${id}.name`, textKey: `region.khortytsia.${id}.text` };
}

/** Regions per land; the board picks one per tier a day (`raidBoard`, M3-03). Rough real layout of the Lower Dnipro. */
export const REGIONS = {
  khortytsia: [
    region('samara', 96, 18), // the Samara joins the Dnipro from the east, above the rapids
    region('vovchiVody', 150, 30), // the Vovcha, a tributary of the Samara, far east in the steppe
    region('porohy', 86, 48), // the rapids, between the Samara mouth and Khortytsia
    region('kinskiVody', 122, 96), // the Konka runs from the east to the Velykyi Luh below Khortytsia
    region('tavan', 44, 128), // the Tavan crossing, down the Dnipro to the south-west
    region('dykePole', 142, 130), // the open steppe, south-east
  ],
} as const satisfies Readonly<Record<Village['id'], readonly Region[]>>;

export const RUMOR_IDS = ['chumaky', 'ford', 'kurgan'] as const;
export type RumorId = (typeof RUMOR_IDS)[number];

/**
 * What a rumour adds to its offer: + share to the `Modifiers` field its kind names, 1:1 — `loot` → `lootMult`,
 * `relic` → `relicChanceMult` (1 = ×2 chance) (M3-06). Content test: the strongest relic rumour keeps every tier's
 * chance ≤ 1; the core clamps anyway (M3-03).
 */
export type RumorEffect =
  { readonly kind: 'loot'; readonly share: number } | { readonly kind: 'relic'; readonly share: number };

export interface Rumor {
  readonly id: RumorId;
  readonly effect: RumorEffect;
  readonly nameKey: string;
  readonly textKey: string;
}

function rumor(id: RumorId, effect: RumorEffect): Rumor {
  return { id, effect, nameKey: `raid.rumor.${id}.name`, textKey: `raid.rumor.${id}.text` };
}

/**
 * The daily board (SPEC §2.6, ADR 012): a pure function of (seed, day) — one offer per tier, one of them the rumour,
 * whose bonus holds for the first start on it that day (Q3). `salt` keys the board's `hash32` stream: **frozen** —
 * changing it (or reordering REGION_IDS, RUMOR_IDS, `rumorTiers`) reshuffles every player's board (golden test M3-03).
 * Rumours go only on tiers with relics: a relic rumour on the 5-minute scouting would promise nothing, and the
 * onboarding raid stays plain. Bonuses: гіпотеза.
 */
export const BOARD = {
  salt: 0x7a1d,
  rumors: [
    rumor('chumaky', { kind: 'loot', share: 0.5 }),
    rumor('ford', { kind: 'loot', share: 0.25 }),
    rumor('kurgan', { kind: 'relic', share: 1 }),
  ],
  rumorTiers: ['m30', 'h1', 'h4', 'h8'],
} as const satisfies {
  readonly salt: number;
  readonly rumors: readonly Rumor[];
  readonly rumorTiers: readonly RaidTierId[];
};
