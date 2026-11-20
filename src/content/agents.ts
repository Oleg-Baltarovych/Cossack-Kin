// People and carts walking the settlement (plan M2-16, SPEC §6.4, §12.4): who may walk, how many, and the shape of a
// land's path graph. Data and types only — path finding and stepping live in render/agents/ (cosmetic, never state).
import type { SichBuildingId } from './sich.ts';
import type { FarmBuildingId } from './villages/khortytsia.ts';

/** Who walks (plan Q11): villagers stay outside the Sich; Cossacks go anywhere; visitors and carts come in M2-20/21. */
export type AgentRole = 'villager' | 'cossack' | 'visitor' | 'cart';

/**
 * Agents alive at once on the whole world (plan Q11, SPEC §12.4 «селян ≤ 25»): Cossacks beyond 16 stay abstract (UI
 * count only), visitors ≤ 2, food carts ≤ 3.
 */
export const AGENT_BUDGET: Readonly<Record<AgentRole, number>> = {
  villager: 25,
  cossack: 16,
  visitor: 2,
  cart: 3,
};

/** What a node of the path graph is: a door, a work spot, a campfire, the Sich gate, or a plain waypoint. */
export type PoiKind = 'door' | 'work' | 'campfire' | 'gate' | 'way';

/** A building of the land a node can belong to (the plots' building ids). */
export type NodeBuilding = FarmBuildingId | SichBuildingId;

/** The `work-<building>` animations (M2-17): what a villager does at a work spot. */
export type WorkAnim = Extract<VillagerAnim, `work-${string}`>;

/** A node as authored in a zone (zone-local x, rows below the horizon). */
export interface PathNodeSpec<Id extends string = string> {
  readonly id: Id;
  readonly kind: PoiKind;
  readonly x: number;
  readonly ground: number;
  /** Roles allowed on the node; absent = everyone (the Sich's inside is `['cossack']`). */
  readonly only?: readonly AgentRole[];
  /**
   * The building the node belongs to (its yard, door or work spot, plan M2-18): it is open only while that building
   * stands (visual tier ≥ 1) — nobody walks to, through or works at an empty plot. Absent = always open.
   */
  readonly building?: NodeBuilding;
  /**
   * The building's visual tier from which the node is open (default 1): a guard's post by a wall tower that only rises
   * with walls II or III (M2-19).
   */
  readonly from?: number;
  /** A work spot's animation (kind `work`, with a `building`): what a villager does there. */
  readonly work?: WorkAnim;
}

/** An edge (walked both ways); the optional third item limits it to those roles (absent = everyone). */
export type PathEdge<Id extends string = string> = readonly [Id, Id] | readonly [Id, Id, readonly AgentRole[]];

/** A zone's part of the graph: nodes in zone-local px, edges between them. */
export interface ZonePaths<Id extends string = string> {
  readonly nodes: readonly PathNodeSpec<Id>[];
  readonly edges: readonly PathEdge<Id>[];
}

/** A node in the world (world x) with the zone it stands in. */
export interface PathNode<Id extends string = string> extends PathNodeSpec<Id> {
  readonly zone: string;
}

/** The land's walkable graph over the continuous world (edges are undirected). */
export interface PathGraph<Id extends string = string> {
  readonly nodes: readonly PathNode<Id>[];
  readonly edges: readonly PathEdge<Id>[];
}

/** The village bodies with the work set (M2-17): 4 outfits each (SPEC §6.4: 4–6 clothing variants). */
export const VILLAGER_SPRITES = [
  'selianka.a',
  'selianka.b',
  'selianka.c',
  'selianka.d',
  'selianyn.a',
  'selianyn.b',
  'selianyn.c',
  'selianyn.d',
] as const;
export type VillagerSprite = (typeof VILLAGER_SPRITES)[number];

/** Rank-and-file Cossacks (ART-06, ART-15): a/b шапка with шлик, c the young one with оселедець. */
export const KOZAK_SPRITES = ['kozak.a', 'kozak.b', 'kozak.c'] as const;
export type KozakSprite = (typeof KOZAK_SPRITES)[number];
/** The otaman (M2-19): one man, his own 20×30 body. */
export type OtamanSprite = 'otaman.a';
/** Guards on the Sich's towers (M2-19): two palette swaps. */
export const GUARD_SPRITES = ['vartovyi.a', 'vartovyi.b'] as const;
export type GuardSprite = (typeof GUARD_SPRITES)[number];
export type GirlSprite = 'divchyna.a' | 'divchyna.b';

/** Person sprites (`<stem>/walk/NN`, `<stem>/idle/NN`, `<entity>.<variant>@shadow/<anim>/NN`). */
export type PersonSprite = KozakSprite | OtamanSprite | GuardSprite | GirlSprite | VillagerSprite;

/**
 * Villager animations beyond walk/idle (M2-17, SPEC §6.4), frames `<VillagerSprite>/<anim>/<nn>` in the `people` atlas,
 * for the FSM (M2-18) to pick: `work-<building>` at the five workplaces (field: the man mows with a scythe, the woman
 * reaps with a sickle; apiary: honeycombs into a pail; smithy: the man at the anvil, the woman at the bellows; potter:
 * seated at the kick wheel; fair: offering a jug over a basket), `talk`, `sit` (on a stool, by the fire at night),
 * `cheer`. The generators declare the same frame counts (tests/unit/tools/gen-people.test.ts).
 */
export const VILLAGER_ANIMS = {
  'work-field': { frames: 6, fps: 8 },
  'work-apiary': { frames: 4, fps: 8 },
  'work-smithy': { frames: 4, fps: 8 },
  'work-potter': { frames: 4, fps: 8 },
  'work-fair': { frames: 4, fps: 8 },
  talk: { frames: 2, fps: 4 },
  sit: { frames: 2, fps: 2 },
  cheer: { frames: 4, fps: 10 },
} as const;
export type VillagerAnim = keyof typeof VILLAGER_ANIMS;

/**
 * Cossack animations beyond walk/idle (M2-19, SPEC §6.4): `drill` — the musket drill in the ranks (shoulder, port,
 * level, recover), `sit-smoke` — seated by the fire with a люлька (pipe), `cheer` — hat raised (the «Слава!» after the
 * otaman's word).
 */
export const COSSACK_ANIMS = {
  drill: { frames: 4, fps: 8 },
  'sit-smoke': { frames: 2, fps: 2 },
  cheer: { frames: 4, fps: 10 },
} as const;
export type CossackAnim = keyof typeof COSSACK_ANIMS;

/** The otaman's (M2-19): `speak` — addressing the ranks with the булава, `march` — the review step along the ranks. */
export const OTAMAN_ANIMS = {
  speak: { frames: 4, fps: 6 },
  march: { frames: 6, fps: 10 },
} as const;
export type OtamanAnim = keyof typeof OTAMAN_ANIMS;

/** The guards' (M2-19): `watch` — still on the spear by day, `torch` — a burning torch held up at night (@emissive). */
export const GUARD_ANIMS = {
  watch: { frames: 2, fps: 2 },
  torch: { frames: 4, fps: 8 },
} as const;
export type GuardAnim = keyof typeof GUARD_ANIMS;

/** What every person sprite has frames for. */
export type BasicAnim = 'walk' | 'idle';
/** Every animation a person pose can show (each sprite family has its own set beyond walk/idle). */
export type PersonAnim = BasicAnim | VillagerAnim | CossackAnim | OtamanAnim | GuardAnim;

export const isVillagerSprite = (sprite: AgentSprite): sprite is VillagerSprite =>
  (VILLAGER_SPRITES as readonly string[]).includes(sprite);
export const isKozakSprite = (sprite: AgentSprite): sprite is KozakSprite =>
  (KOZAK_SPRITES as readonly string[]).includes(sprite);
export const isGuardSprite = (sprite: AgentSprite): sprite is GuardSprite =>
  (GUARD_SPRITES as readonly string[]).includes(sprite);
export const isOtamanSprite = (sprite: AgentSprite): sprite is OtamanSprite => sprite === 'otaman.a';

export const isVillagerAnim = (anim: PersonAnim): anim is VillagerAnim => anim in VILLAGER_ANIMS;
export const isCossackAnim = (anim: PersonAnim): anim is CossackAnim => anim in COSSACK_ANIMS;
export const isOtamanAnim = (anim: PersonAnim): anim is OtamanAnim => anim in OTAMAN_ANIMS;
export const isGuardAnim = (anim: PersonAnim): anim is GuardAnim => anim in GUARD_ANIMS;

/** Every agent sprite stem; carts and visitors (M2-20/21) widen it. */
export type AgentSprite = PersonSprite;

interface SpawnBase<Id extends string> {
  /**
   * Where it starts; a villager's door: it goes in there (out of sight) at night when its night spot does not stand
   * (a door with no building of its own, always open).
   */
  readonly home: Id;
  /** Logical px per second; matched to the stride so feet do not slide (~2 steps per 0.6 s walk cycle). */
  readonly speed: number;
  /** Seconds the agent is run ahead at start, so agents do not move in step. */
  readonly phase: number;
}

/**
 * The M2-16 walk (Cossacks, the girls — anyone without a day's work): from `home` to its `goals` in turn (`cycle`) or
 * picked with the seeded RNG (`random`), resting `rest` s at each; goals whose building does not stand are skipped; no
 * goals = stands at home. With `indoors`, it goes in at that door after the working hours (few walkers at night).
 */
export interface WanderSpawn<Id extends string = string> extends SpawnBase<Id> {
  readonly routine: 'wander';
  readonly role: AgentRole;
  readonly sprite: AgentSprite;
  readonly goals: readonly Id[];
  readonly order: 'cycle' | 'random';
  /** Seconds of idle at each goal. */
  readonly rest: number;
  readonly indoors?: Id;
}

/**
 * Where a villager spends the night (art-director M2-18): outside by a door or the forge — `dx` px beside the node,
 * facing `facing`, sitting on the prysba or standing (at most `NIGHT_SPOT_CAP` per spot, content test) — or `indoors`
 * at that door (out of sight).
 */
export type NightSpot<Id extends string = string> =
  | { readonly at: Id; readonly anim: 'sit' | 'talk' | 'idle'; readonly dx: number; readonly facing: 1 | -1 }
  | { readonly at: Id; readonly anim: 'indoors' };

/**
 * People outside at one night spot (art-director M2-18): two on one side of the door (one sitting, one standing,
 * `pairGap` px apart), a third only on the other side; everyone else goes indoors.
 */
export const NIGHT_SPOT_CAP = { total: 3, perSide: 2, pairGap: [3, 4] } as const;

/**
 * A villager's day (plan M2-18, SPEC §6.4; timings `VILLAGER_DAY`): idle → walk to one of its `work` spots that stands
 * → work there → walk to a `chat` spot → talk → idle → …; outside the working hours it goes to its `night` spot.
 * Only the village bodies have the work frames.
 */
export interface VillagerSpawn<Id extends string = string> extends SpawnBase<Id> {
  readonly routine: 'villager';
  readonly role: 'villager';
  readonly sprite: VillagerSprite;
  /** Work spots (nodes with `work`), one picked at random each time among those standing. */
  readonly work: readonly Id[];
  /** Where it goes to talk between work (picked at random among those open). */
  readonly chat: readonly Id[];
  readonly night: NightSpot<Id>;
}

/** A place beside a node: `dx` px off it, facing `facing`. */
export interface Spot<Id extends string = string> {
  readonly at: Id;
  readonly dx: number;
  readonly facing: 1 | -1;
}

/**
 * Where a Cossack spends the night (M2-19): by a Sich fire — smoking a pipe seated, or standing — at most
 * `NIGHT_SPOT_CAP` to a spot (content test), or `indoors` (in the kurin, out of sight); a fire spot that does not stand
 * (the second fire before maidan IV) sends him indoors at `home`.
 */
export type CossackNight<Id extends string = string> =
  (Spot<Id> & { readonly anim: 'sit-smoke' | 'idle' }) | { readonly anim: 'indoors' };

interface CossackBase<Id extends string> extends SpawnBase<Id> {
  readonly routine: 'cossack';
  readonly role: 'cossack';
}

/**
 * A Cossack of the ranks (M2-19): by day at his place in the formation on the maidan (`rank`, facing the otaman),
 * drilling in step with the others (`COSSACK_DAY.drill`); while the maidan does not stand he idles about his `haunts`
 * like a free Cossack. At night by a fire.
 */
export interface RankSpawn<Id extends string = string> extends CossackBase<Id> {
  readonly duty: 'rank';
  readonly sprite: KozakSprite;
  readonly rank: Spot<Id>;
  readonly haunts: readonly Id[];
  readonly night: CossackNight<Id>;
}

/**
 * A free Cossack (M2-19): by day from one of his `haunts` to another — the tavern, the smithy, the fair in the suburb
 * (Cossacks may leave the Sich; villagers may not enter it) — idling a while at each; at night by a fire.
 */
export interface FreeSpawn<Id extends string = string> extends CossackBase<Id> {
  readonly duty: 'free';
  readonly sprite: KozakSprite;
  readonly haunts: readonly Id[];
  readonly night: CossackNight<Id>;
}

/**
 * The otaman (M2-19): by day at his `stand` before the ranks (facing them) — speaks, then marches the `review` nodes
 * along the front and back to the stand while the ranks drill; at night, and while the maidan does not stand, in the
 * kurin (`home`).
 */
export interface OtamanSpawn<Id extends string = string> extends CossackBase<Id> {
  readonly duty: 'otaman';
  readonly sprite: OtamanSprite;
  readonly stand: Spot<Id>;
  readonly review: readonly Id[];
}

/**
 * A guard (M2-19): day and night at his `post` by a tower — leaning on the spear by day, a torch held up at night;
 * while that tower does not stand he is in the kurin (`home`).
 */
export interface GuardSpawn<Id extends string = string> extends CossackBase<Id> {
  readonly duty: 'guard';
  readonly sprite: GuardSprite;
  readonly post: Spot<Id>;
}

/**
 * Cossacks with a duty (M2-19). They walk only while the army has them: the scene shows the first
 * `populationView(state).cossacks` of them in authored order (the rest are not there, no pose); one more hired walks
 * out of the kurin at `home`.
 */
export type CossackSpawn<Id extends string = string> = RankSpawn<Id> | FreeSpawn<Id> | OtamanSpawn<Id> | GuardSpawn<Id>;

export type AgentSpawn<Id extends string = string> = WanderSpawn<Id> | VillagerSpawn<Id> | CossackSpawn<Id>;

/**
 * The Sich's day (plan M2-19, SPEC §6.4), cosmetic: the same hours as the villagers' (guards light their torches when
 * the village goes home), the free Cossacks' idle at a haunt [min, max] s, and the drill — one cycle for the whole
 * maidan, in step: the otaman speaks (`speak` s; the ranks stand), the ranks cheer (`cheer`), they drill while the
 * otaman marches the front (`drill`), then stand at ease (`ease`).
 */
export const COSSACK_DAY = {
  from: 6 * 60,
  until: 21 * 60,
  hauntS: [5, 12],
  drill: { speak: 6, cheer: 2, drill: 16, ease: 6 },
} as const satisfies {
  readonly from: number;
  readonly until: number;
  readonly hauntS: readonly [number, number];
  readonly drill: Readonly<Record<'speak' | 'cheer' | 'drill' | 'ease', number>>;
};

/**
 * The villagers' timetable (plan M2-18), cosmetic: working hours in minutes after midnight (the dusk key at 21:00
 * sends them home; the morning key at 07:00 finds them at work), and the seconds of each step, drawn per agent from
 * its seeded RNG in [min, max]. `spacing` = px between people sharing a spot (they stand apart and face each other).
 */
export const VILLAGER_DAY = {
  from: 6 * 60,
  until: 21 * 60,
  workS: [10, 30],
  chatS: [3, 6],
  idleS: [1, 3],
  spacing: 7,
} as const satisfies {
  readonly from: number;
  readonly until: number;
  readonly workS: readonly [number, number];
  readonly chatS: readonly [number, number];
  readonly idleS: readonly [number, number];
  readonly spacing: number;
};

/** Every node a spawn names (its home, goals or work, chat and night spots). */
export function spawnNodes<Id extends string>(s: AgentSpawn<Id>): readonly Id[] {
  if (s.routine === 'wander') return [s.home, ...s.goals, ...(s.indoors === undefined ? [] : [s.indoors])];
  if (s.routine === 'villager') return [s.home, ...s.work, ...s.chat, s.night.at];
  switch (s.duty) {
    case 'rank':
      return [s.home, s.rank.at, ...s.haunts, ...(s.night.anim === 'indoors' ? [] : [s.night.at])];
    case 'free':
      return [s.home, ...s.haunts, ...(s.night.anim === 'indoors' ? [] : [s.night.at])];
    case 'otaman':
      return [s.home, s.stand.at, ...s.review];
    case 'guard':
      return [s.home, s.post.at];
  }
}
