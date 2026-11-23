// The 7 Sich buildings (SPEC §3.2.1; plan M1-03, Q3–Q5). Bought with glory: gloryCost(l) = base × gloryScale ×
// growth^l. Effects are data the core's `collectModifiers` reads; numbers not in SPEC are «гіпотеза» for M1-15.

export const SICH_BUILDING_IDS = ['kurins', 'maidan', 'walls', 'treasury', 'church', 'cannonry', 'special'] as const;
export type SichBuildingId = (typeof SICH_BUILDING_IDS)[number];

/** When a Sich building can be bought (a discriminated union; the core evaluates it). */
export type SichUnlock =
  /** From the start. */
  | { readonly kind: 'start' }
  /** When every farm/suburb building is at `level` or above (the church, plan Q4). */
  | { readonly kind: 'farmAll'; readonly level: number }
  /** Only in land number `land` and later (the cannon foundry, land 5; hidden in land 1, plan Q5). */
  | { readonly kind: 'land'; readonly land: number };

/** What one level of the building gives. */
export interface SichEffects {
  /** «Оборона» points per level (economy DEFENCE). Every Sich building counts; the walls and the tower most. */
  readonly defencePerLevel: number;
  /** Extra cossack places per level, over the food limit (the kurins). */
  readonly cossacksPerLevel?: number;
  /** +army power per level (share, e.g. 0.02 = +2 %). */
  readonly powerPerLevel?: number;
  /** +glory income per level (share). */
  readonly gloryPerLevel?: number;
  /** +seconds of glory the store holds (offline glory cap) per level (the treasury). */
  readonly gloryCapSecPerLevel?: number;
  /** +raid loot per level (share, into lootMult; the treasury, SPEC §3.2.1; read from M3-06). */
  readonly lootPerLevel?: number;
}

export interface SichBuilding {
  readonly id: SichBuildingId;
  readonly base: number;
  readonly growth: number;
  readonly unlock: SichUnlock;
  readonly effects: SichEffects;
  /** i18n keys (`uk`, `en`). The special building's name comes from its land (villages/<id>.ts). */
  readonly nameKey: string;
  readonly descKey: string;
}

// Bases, growths and effect sizes: гіпотеза (SPEC gives only the effect types).
export const SICH_BUILDINGS: readonly SichBuilding[] = [
  {
    id: 'kurins',
    base: 50,
    growth: 1.16,
    unlock: { kind: 'start' },
    effects: { defencePerLevel: 1, cossacksPerLevel: 1 },
    nameKey: 'sich.kurins.name',
    descKey: 'sich.kurins.desc',
  },
  {
    id: 'maidan',
    base: 80,
    growth: 1.17,
    unlock: { kind: 'start' },
    effects: { defencePerLevel: 1, powerPerLevel: 0.02 },
    nameKey: 'sich.maidan.name',
    descKey: 'sich.maidan.desc',
  },
  {
    id: 'walls',
    base: 100,
    growth: 1.17,
    unlock: { kind: 'start' },
    effects: { defencePerLevel: 3 },
    nameKey: 'sich.walls.name',
    descKey: 'sich.walls.desc',
  },
  {
    id: 'treasury',
    base: 150,
    growth: 1.18,
    unlock: { kind: 'start' },
    // lootPerLevel: гіпотеза (M3-08) — ≈ +25 % loot by the Розквіт (treasury ≈ 25), more than one relic's +10 %.
    effects: { defencePerLevel: 1, gloryCapSecPerLevel: 600, lootPerLevel: 0.01 },
    nameKey: 'sich.treasury.name',
    descKey: 'sich.treasury.desc',
  },
  {
    id: 'church',
    base: 500,
    growth: 1.18,
    unlock: { kind: 'farmAll', level: 25 },
    effects: { defencePerLevel: 1, gloryPerLevel: 0.02 },
    nameKey: 'sich.church.name',
    descKey: 'sich.church.desc',
  },
  {
    id: 'cannonry',
    base: 1000,
    growth: 1.2,
    unlock: { kind: 'land', land: 5 },
    effects: { defencePerLevel: 1, powerPerLevel: 0.03 },
    nameKey: 'sich.cannonry.name',
    descKey: 'sich.cannonry.desc',
  },
  {
    id: 'special',
    base: 300,
    growth: 1.18,
    unlock: { kind: 'start' },
    // Khortytsia's watchtower: + defence with its own weight (plan Q3). Other lands override the effect in M5+.
    effects: { defencePerLevel: 2 },
    nameKey: 'sich.special.name',
    descKey: 'sich.special.desc',
  },
];
