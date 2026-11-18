// Land 1 — Хортиця (SPEC §3.2, §3.7; plan M1-03). The 8 farm/suburb buildings (table §3.2 as is: a starting
// hypothesis, tuned in M1-15), the land's passive bonus, its wind mechanic and its Bloom goal. Data only.

export const FARM_BUILDING_IDS = [
  'field',
  'garden',
  'apiary',
  'windmill',
  'potter',
  'smithy',
  'tavern',
  'fair',
] as const;
export type FarmBuildingId = (typeof FARM_BUILDING_IDS)[number];

export type FarmZone = 'farm' | 'suburb';

/** What a building gives beyond its income. */
export type FarmEffect =
  /** +army power per level (share): the smithy, +3 %/level (SPEC §3.2). */
  | { readonly kind: 'armyPower'; readonly perLevel: number }
  /** +glory income per level (share): the tavern, +1 %/level. */
  | { readonly kind: 'glory'; readonly perLevel: number }
  /** Unlocks the «Ярмарковий день» boost (the fair; the boost itself comes in M6). */
  | { readonly kind: 'fairDay' };

export interface FarmBuilding {
  readonly id: FarmBuildingId;
  readonly zone: FarmZone;
  /** Ducat cost of level 0 → 1, before scale and modifiers. */
  readonly base: number;
  readonly growth: number;
  /** Ducats per second per level, before scale, milestones and modifiers. */
  readonly baseProd: number;
  /** «Харч» per level (food buildings, SPEC §3.0); absent = not a food building. */
  readonly kharchPerLevel?: number;
  readonly effect?: FarmEffect;
  readonly nameKey: string;
  readonly descKey: string;
}

/** Wind strength (SPEC §3.7): calm / breeze / storm. */
export type WindLevel = 'calm' | 'breeze' | 'storm';

export interface WindLook {
  readonly id: WindLevel;
  /** Relative chance of a slot getting this wind. */
  readonly weight: number;
  /** Windmill income multiplier under this wind. */
  readonly windmillMult: number;
  readonly nameKey: string;
}

export interface Village {
  readonly id: 'khortytsia';
  /** Order on the road of the Host (SPEC §3.7). */
  readonly number: number;
  readonly nameKey: string;
  /** Cost and income scale of the land (×~1000 per land). */
  readonly scale: number;
  /** Glory cost scale of the land's Sich. */
  readonly gloryScale: number;
  readonly buildings: readonly FarmBuilding[];
  /** «Вітряки ×2». */
  readonly passive: { readonly kind: 'windmillMult'; readonly mult: number };
  /**
   * Wind (SPEC §3.7, plan Q2): time is cut into `slotSec` slots, each slot's wind is a pure function of (seed, slot);
   * equal neighbours merge, so a wind lasts 10, 20, 30 … minutes.
   */
  readonly wind: { readonly slotSec: number; readonly levels: readonly WindLook[] };
  /** Bloom goal (SPEC §3.7): survive `storms` storms with the windmill at ≥ windmillLevel (offline storms count). */
  readonly bloomGoal: { readonly kind: 'storms'; readonly storms: number; readonly windmillLevel: number };
  /** The land's own Sich building (SPEC §3.2.1 row 7): the watchtower. */
  readonly sichSpecial: { readonly nameKey: string; readonly descKey: string };
}

export const KHORTYTSIA: Village = {
  id: 'khortytsia',
  number: 1,
  nameKey: 'village.khortytsia.name',
  scale: 1,
  gloryScale: 1,
  buildings: [
    {
      id: 'field',
      zone: 'farm',
      base: 10,
      growth: 1.15,
      baseProd: 0.5,
      kharchPerLevel: 1,
      nameKey: 'building.field.name',
      descKey: 'building.field.desc',
    },
    {
      id: 'garden',
      zone: 'farm',
      base: 110,
      growth: 1.2,
      baseProd: 4,
      kharchPerLevel: 2,
      nameKey: 'building.garden.name',
      descKey: 'building.garden.desc',
    },
    {
      id: 'apiary',
      zone: 'farm',
      base: 1.2e3,
      growth: 1.2,
      baseProd: 30,
      kharchPerLevel: 3,
      nameKey: 'building.apiary.name',
      descKey: 'building.apiary.desc',
    },
    {
      id: 'windmill',
      zone: 'farm',
      base: 13e3,
      growth: 1.2,
      baseProd: 200,
      kharchPerLevel: 5,
      nameKey: 'building.windmill.name',
      descKey: 'building.windmill.desc',
    },
    {
      id: 'potter',
      zone: 'farm',
      base: 400e3,
      growth: 1.2,
      baseProd: 1.4e3,
      nameKey: 'building.potter.name',
      descKey: 'building.potter.desc',
    },
    {
      id: 'smithy',
      zone: 'suburb',
      base: 40e6,
      growth: 1.12,
      baseProd: 9e3,
      effect: { kind: 'armyPower', perLevel: 0.03 },
      nameKey: 'building.smithy.name',
      descKey: 'building.smithy.desc',
    },
    {
      id: 'tavern',
      zone: 'suburb',
      base: 360e6,
      growth: 1.12,
      baseProd: 60e3,
      effect: { kind: 'glory', perLevel: 0.01 },
      nameKey: 'building.tavern.name',
      descKey: 'building.tavern.desc',
    },
    {
      id: 'fair',
      zone: 'suburb',
      base: 5e9,
      growth: 1.1,
      baseProd: 400e3,
      effect: { kind: 'fairDay' },
      nameKey: 'building.fair.name',
      descKey: 'building.fair.desc',
    },
  ],
  passive: { kind: 'windmillMult', mult: 2 },
  wind: {
    slotSec: 600,
    // Weights: гіпотеза (a storm roughly every hour and a half on average).
    levels: [
      { id: 'calm', weight: 0.3, windmillMult: 0.5, nameKey: 'wind.calm' },
      { id: 'breeze', weight: 0.55, windmillMult: 1, nameKey: 'wind.breeze' },
      { id: 'storm', weight: 0.15, windmillMult: 3, nameKey: 'wind.storm' },
    ],
  },
  bloomGoal: { kind: 'storms', storms: 3, windmillLevel: 25 },
  sichSpecial: { nameKey: 'sich.special.khortytsia.name', descKey: 'sich.special.khortytsia.desc' },
};
