// People and carts walking the settlement (plan M2-16, SPEC §6.4, §12.4): who may walk, how many, and the shape of a
// land's path graph. Data and types only — path finding and stepping live in render/agents/ (cosmetic, never state).

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

/** A node as authored in a zone (zone-local x, rows below the horizon). */
export interface PathNodeSpec<Id extends string = string> {
  readonly id: Id;
  readonly kind: PoiKind;
  readonly x: number;
  readonly ground: number;
  /** Roles allowed on the node; absent = everyone (the Sich's inside is `['cossack']`). */
  readonly only?: readonly AgentRole[];
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

/** Person sprites (`<stem>/walk/NN`, `<stem>/idle/NN`, `<entity>.<variant>@shadow/<anim>/NN`). */
export type PersonSprite = 'kozak.a' | 'kozak.b' | 'kozak.c' | 'divchyna.a' | 'divchyna.b' | VillagerSprite;

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
/** What every person sprite has frames for. */
export type BasicAnim = 'walk' | 'idle';
/** Every animation a person pose can show (only villager sprites have the `VillagerAnim` frames). */
export type PersonAnim = BasicAnim | VillagerAnim;

export const isVillagerSprite = (sprite: AgentSprite): sprite is VillagerSprite =>
  (VILLAGER_SPRITES as readonly string[]).includes(sprite);

/** Every agent sprite stem; carts and visitors (M2-20/21) widen it. */
export type AgentSprite = PersonSprite;

/**
 * One agent of the scene (the skeleton before the villager FSM, M2-18): starts at `home`, walks to its `goals` in turn
 * (`cycle`) or picks the next one with the seeded RNG (`random`), resting `rest` s at each; no goals = stands at home.
 */
export interface AgentSpawn<Id extends string = string> {
  readonly role: AgentRole;
  readonly sprite: AgentSprite;
  readonly home: Id;
  readonly goals: readonly Id[];
  readonly order: 'cycle' | 'random';
  /** Logical px per second; matched to the stride so feet do not slide (~2 steps per 0.6 s walk cycle). */
  readonly speed: number;
  /** Seconds of idle at each goal. */
  readonly rest: number;
  /** Seconds the agent is run ahead at start, so agents do not move in step. */
  readonly phase: number;
}
