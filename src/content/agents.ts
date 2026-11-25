// People and carts walking the settlement (plan M2-16, SPEC §6.4, §12.4): who may walk, how many, and the shape of a
// land's path graph. Data and types only — path finding and stepping live in render/agents/ (cosmetic, never state).
import type { SichBuildingId } from './sich.ts';
import type { FarmBuildingId } from './villages/khortytsia.ts';
import type { VisitorId } from './visitors.ts';

/** Who walks (plan Q11): villagers stay outside the Sich; Cossacks go anywhere; visitors and carts come in M2-20/21. */
export type AgentRole = 'villager' | 'cossack' | 'visitor' | 'cart';

/**
 * Agents alive at once on the whole world (plan Q11, SPEC §12.4 «селян ≤ 25»): Cossacks beyond 16 stay abstract (UI
 * count only), food carts ≤ 3. Visitors: ≤ 2 poses on the scene — the timetable brings one visitor at a time (M2-21),
 * and the чумак comes with his віз; every visitor kind has its agent, out of sight between visits.
 */
export const AGENT_BUDGET: Readonly<Record<AgentRole, number>> = {
  villager: 25,
  cossack: 16,
  visitor: 2,
  cart: 3,
};

/**
 * How many villagers live in the scene (M2-29 D, SPEC §6.6 «від 3 до ~25 за Σ рівнів», plan §0): `base` in a new game,
 * plus floor(`perSqrtLevel` × √Σ levels) of every building (farm and unlocked Sich), up to `AGENT_BUDGET.villager`.
 * The square root makes the first purchases bring people quickly (one at level 1, 8 with every building at tier I)
 * and the budget is reached about when every farm building is at 25 (Σ ≈ 250). Cosmetic: who walks, not the economy.
 */
export const VILLAGER_GROWTH = { base: 3, perSqrtLevel: 1.4 } as const;

/**
 * Builders at a scaffold (M2-29 D, SPEC §6.5 «2–3 селяни підходять і стукають молотками»; owner 2026-11-23: builders
 * always come): the men of the household nearest the site by their route, however far — one per slot of `slots.s` (a
 * low plot's scaffold) or `slots.l` (a house's); a slot is a px offset from the site's pivot, a sprite's width apart (no
 * two fuse, art-director) and centred — hammer (`work-build`) on the dirt before the posts, facing in. The scaffold's
 * first stage waits until the first of them is there, at most `waitMaxS` s, and only then do the stages (and their
 * knocks) go up — `stretch` × slower while someone hammers, so the work is seen. Measured first arrivals (seeds 1–3,
 * 3–25 villagers): the farm by day 2–25 s (a new game's field 12–25 s); the suburb with a small household 16–44 s and
 * at night up to 66 s (the men come out of the khata) — past the cap the stages start and the men still come,
 * hammering while it stands. The economy never waits: the level is already bought. While a crew is there, chat spots within `clearPx` of its slots are closed (passers-by do not stand among the builders, art-director). A site
 * with no graph node a villager may use within `reachPx` (the Sich: villagers never enter it), or no man in the
 * household, has no builders and starts at once.
 */
export const BUILDERS = {
  slots: { s: [-7, 7], l: [-14, 0, 14] },
  reachPx: 48,
  waitMaxS: 25,
  stretch: 2,
  clearPx: 16,
} as const;

/**
 * How often a food cart leaves the farm for the Sich (plan M2-20, SPEC §3.0 «харч», §6.4): every `kharchS / kharch` s,
 * clamped to [minS, maxS] — more food, more carts; none while the farm grows no food. Cosmetic: the period only paces
 * the carts on the road (at most `AGENT_BUDGET.cart` at once), it moves nothing in the economy. `minS` keeps three
 * departures longer than a round trip (`CART_TRIP`: ≈ 140 s), so carts do not bunch at the farm. Гіпотеза.
 */
export const CART_PERIOD = { kharchS: 7500, minS: 50, maxS: 240 } as const;

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

/** The visitors (M2-21), one body each: walk 6@10 and idle 4@6; the кобзар also `play`s his kobza. */
export const VISITOR_SPRITES = {
  kobzar: 'kobzar.a',
  lirnyk: 'lirnyk.a',
  chumak: 'chumak.a',
  korobeinyk: 'korobeinyk.a',
  hanchar: 'hanchar.a',
} as const satisfies Readonly<Record<VisitorId, string>>;
export type VisitorSprite = (typeof VISITOR_SPRITES)[VisitorId];
export type KobzarSprite = typeof VISITOR_SPRITES.kobzar;
/** Visitors with walk/idle only. */
export type WalkerVisitorSprite = Exclude<VisitorSprite, KobzarSprite>;

/** Person sprites (`<stem>/walk/NN`, `<stem>/idle/NN`, `<entity>.<variant>@shadow/<anim>/NN`). */
export type PersonSprite =
  KozakSprite | OtamanSprite | GuardSprite | GirlSprite | VillagerSprite | VisitorSprite | RaidSprite;

/**
 * Villager animations beyond walk/idle (M2-17, SPEC §6.4), frames `<VillagerSprite>/<anim>/<nn>` in the `people` atlas,
 * for the FSM (M2-18) to pick: `work-<building>` at the five workplaces (field: the man mows with a scythe, the woman
 * reaps with a sickle; apiary: honeycombs into a pail; smithy: the man at the anvil, the woman at the bellows; potter:
 * seated at the kick wheel; fair: offering a jug over a basket), `work-build` (M2-29 D: hammering a scaffold post at
 * chest height — the builders), `talk`, `sit` (on a stool, by the fire at night),
 * `cheer`. The generators declare the same frame counts (tests/unit/tools/gen-people.test.ts).
 */
export const VILLAGER_ANIMS = {
  'work-field': { frames: 6, fps: 8 },
  'work-apiary': { frames: 4, fps: 8 },
  'work-smithy': { frames: 4, fps: 8 },
  'work-potter': { frames: 4, fps: 8 },
  'work-fair': { frames: 4, fps: 8 },
  'work-build': { frames: 4, fps: 8 },
  talk: { frames: 2, fps: 4 },
  sit: { frames: 2, fps: 2 },
  cheer: { frames: 4, fps: 10 },
} as const;
export type VillagerAnim = keyof typeof VILLAGER_ANIMS;

/**
 * Cossack animations beyond walk/idle (M2-19, SPEC §6.4): `drill` — the musket drill in the ranks (shoulder, port,
 * level, recover), `sit-smoke` — seated by the fire with a люлька (pipe), `cheer` — hat raised (the «Слава!» after the
 * otaman's word), `march` (M3-13) — the raid step, the самопал upright on the shoulder.
 */
export const COSSACK_ANIMS = {
  drill: { frames: 4, fps: 8 },
  'sit-smoke': { frames: 2, fps: 2 },
  cheer: { frames: 4, fps: 10 },
  march: { frames: 6, fps: 10 },
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

/**
 * The raid's own figures (M3-13, SPEC §6.6), `people` atlas: the корогвоносець (`khorunzhyi.a`) and the two Cossacks
 * carrying the chest home (`nosii.a`, one sprite, pivot under the chest). Each has `idle` (4 @6, the person set) and
 * `march` — no `walk`: they only ever march.
 */
export const RAID_SPRITES = ['khorunzhyi.a', 'nosii.a'] as const;
export type RaidSprite = (typeof RAID_SPRITES)[number];
export type BearerSprite = 'khorunzhyi.a';
export const RAID_ANIMS = {
  march: { frames: 6, fps: 10 },
} as const;
export type RaidAnim = keyof typeof RAID_ANIMS;

/**
 * The корогва on the bearer's pole (M3-13): its own sprite (the Sich banner's cloth, 4 frames at the wind's rate)
 * hung with its pivot (the hoist's top-left px) at `hoist` from the bearer's pivot — `dx` facing right (the column
 * right of the pole), `dy` per frame of the bearer's animation (the pole is grounded at rest and lifted, riding the
 * step, on the march). The cloth is never mirrored: like every banner of the world it flies downwind (right); facing
 * left, the mirrored pole stands at −dx, so the cloth hangs from `1 − dx`. Generator: `bearerHoist` (tested equal).
 */
export const BEARER_BANNER = {
  sprite: 'korohva',
  animate: { kind: 'cycle', frames: 4, fps: 'wind' },
  hoist: {
    dx: 7,
    dy: {
      idle: [-40, -40, -40, -40],
      march: [-47, -47, -48, -47, -47, -48],
    },
  },
} as const;

/**
 * The chest prop (M3-13; `skrynia`, idle 1 frame + `@shadow`, pivot at its foot): stands on the maidan until claimed
 * (M3-14). The carried one is drawn inside `nosii`.
 */
export const CHEST_SPRITE = 'skrynia';
export type ChestSprite = typeof CHEST_SPRITE;

/**
 * A raid squad on the scene (M3-14, SPEC §6.6; route by the art-director, M3-13): Cossacks already on the scene, never
 * more — at most `men` (the bearer first, then the file), and at most half of the rank and free Cossacks the scene has
 * left (plan R3: a small army's drill does not empty), plus the otaman with the first squad. They muster in file on the
 * maidan at the foot of the trail to the gate (`gapPx` apart, facing it; a man with no way there is put in his place),
 * stand `musterS`, then march (`speed` px/s) up the trail into the gate's passage, each fading out in two alpha steps
 * (`fadeAlpha`) over its last `fadePx` px (nobody walks past the wall) — out of sight while the raid is away. The halt
 * line runs `haltRunPx` on past a halt spot (longer than any file). A live return comes back the same way, the banner first and the two chest
 * carriers last (one `nosii` figure, `carry.leadPx` behind the man before them): the column halts with the carriers on
 * the slot's halt spot, the chest is set down `carry.chestDy` rows in front of it (the carriers stand `carry.dx` either
 * side) and after `haltS` they go back to their duties. The otaman walks beside the bearer, never a place ahead
 * (art-director M3-14): `otaman.ahead` px along the way and `sidePx` px (`sideRows` rows on a level stretch) to its side
 * — the side toward the viewer on the level muster and halt lines, beside him on the trail; the way's direction is taken
 * over ±`smoothPx`, so he turns smoothly at corners. A squad of fewer than three
 * men has no carriers: the chest is set down before the last man. Villagers (village bodies, the nearest by their route, `cheer.spots` of them)
 * not indoors or settled for the night, come to the Sich's threshold and cheer for `cheer.s` s (they stand under «менше
 * руху»). Cosmetic: render only.
 */
export const RAID_SQUAD = {
  men: 5,
  gapPx: 12,
  speed: 16,
  musterS: 2,
  haltS: 4,
  fadePx: [8, 4],
  fadeAlpha: [2 / 3, 1 / 3],
  haltRunPx: 400,
  otaman: { ahead: 3, sidePx: 7, sideRows: 4, smoothPx: 6 },
  carry: { leadPx: 24, dx: 10, chestDy: 8 },
  cheer: {
    s: 12,
    spots: [
      { dx: -4, facing: 1 },
      { dx: -12, facing: 1 },
      { dx: 4, facing: 1 },
    ],
  },
} as const satisfies {
  readonly men: number;
  readonly gapPx: number;
  readonly speed: number;
  readonly musterS: number;
  readonly haltS: number;
  readonly fadePx: readonly [number, number];
  readonly fadeAlpha: readonly [number, number];
  readonly haltRunPx: number;
  readonly otaman: {
    readonly ahead: number;
    readonly sidePx: number;
    readonly sideRows: number;
    readonly smoothPx: number;
  };
  readonly carry: { readonly leadPx: number; readonly dx: number; readonly chestDy: number };
  readonly cheer: { readonly s: number; readonly spots: readonly { readonly dx: number; readonly facing: 1 | -1 }[] };
};

/**
 * A land's raid route (M3-14): the head of the muster line (the file stands to its left), the foot of the trail, the
 * point in the gate's passage where the men fade (behind the gate posts), each raid slot's chest spot (the column halts
 * with the carriers there and the men ahead stand on toward `facing`) and where villagers cheer (the Sich's threshold —
 * they never enter). Every node but `cheer` is Cossack-only (content test).
 */
export interface RaidRoute<Id extends string = string> {
  readonly muster: Id;
  readonly foot: Id;
  readonly gate: Id;
  readonly chests: readonly Spot<Id>[];
  readonly cheer: Id;
}

/** The кобзар's (M2-21, SPEC §6.4): `play` — seated, the kobza on his knee, strumming. */
export const KOBZAR_ANIMS = {
  play: { frames: 4, fps: 6 },
} as const;
export type KobzarAnim = keyof typeof KOBZAR_ANIMS;

/** What every person sprite has frames for. */
export type BasicAnim = 'walk' | 'idle';
/** Every animation a person pose can show (each sprite family has its own set beyond walk/idle). */
export type PersonAnim = BasicAnim | VillagerAnim | CossackAnim | OtamanAnim | GuardAnim | KobzarAnim | RaidAnim;

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
export const isRaidAnim = (anim: PersonAnim): anim is RaidAnim => anim in RAID_ANIMS;
export const isRaidSprite = (sprite: AgentSprite): sprite is RaidSprite =>
  (RAID_SPRITES as readonly string[]).includes(sprite);
export const isBearerSprite = (sprite: AgentSprite): sprite is BearerSprite => sprite === 'khorunzhyi.a';
export const isKobzarAnim = (anim: PersonAnim): anim is KobzarAnim => anim in KOBZAR_ANIMS;
export const isVisitorSprite = (sprite: AgentSprite): sprite is VisitorSprite =>
  (Object.values(VISITOR_SPRITES) as readonly string[]).includes(sprite);
export const isKobzarSprite = (sprite: AgentSprite): sprite is KobzarSprite => sprite === VISITOR_SPRITES.kobzar;

/**
 * Food carts (M2-20, `people` atlas `viz.<load>`): a pair of oxen and a віз, loaded on the way to the Sich gate, empty
 * on the way back. Each load is drawn facing its own way (full east, empty west; light top-left, never mirrored) and
 * has the person set walk 6@10 / idle 4@6.
 */
export const CART_SPRITES = ['viz.full', 'viz.empty'] as const;
export type CartSprite = (typeof CART_SPRITES)[number];
export const isCartSprite = (sprite: AgentSprite): sprite is CartSprite =>
  (CART_SPRITES as readonly string[]).includes(sprite);

/** Every agent sprite stem (the chest a squad sets down on the maidan is drawn among them, M3-14). */
export type AgentSprite = PersonSprite | CartSprite | ChestSprite;

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

/**
 * A food cart (M2-20): waits at its `depot` beyond the world's west edge (out of sight; `home` is the road node the
 * depot hangs off) for its turn — one cart every `populationView(state).cartPeriodS` s, the turns going round the carts
 * of the pool (≤ `AGENT_BUDGET.cart`), so never more out at once — then drives the road east, full, to stop
 * `CART_TRIP.reach` px short of the `gate` (never past it), unloads, turns and drives back empty to the depot. Its
 * `driver` (a village body) walks at the oxen's left shoulder.
 */
export interface CartSpawn<Id extends string = string> extends SpawnBase<Id> {
  readonly routine: 'cart';
  readonly role: 'cart';
  readonly sprite: CartSprite;
  /** Where it waits: `dx` px beside `home` (beyond the world's edge). */
  readonly depot: Spot<Id>;
  readonly gate: Id;
  readonly driver: VillagerSprite;
}

/**
 * A visitor (M2-21, SPEC §2.6): out of the village until the core timetable (`visitorAt`) brings its visit; then it
 * walks in from `entry` (beyond the world's west edge, `home` = the road node it hangs off) to the first of its `spots`
 * that stands, stays there — the кобзар plays (`stay: 'play'`), the others idle — and walks back out before the visit
 * ends. Only by day (`VILLAGER_DAY` hours). The чумак (`cart`) drives his віз (the food cart's sprites: loaded coming,
 * empty — salt sold — going) and walks at the oxen's shoulder. All of it is a function of the visit's elapsed time.
 */
export interface VisitorSpawn<Id extends string = string> extends SpawnBase<Id> {
  readonly routine: 'visitor';
  readonly role: 'visitor';
  readonly visitor: VisitorId;
  readonly sprite: VisitorSprite;
  readonly entry: Spot<Id>;
  /** Where it stays, in order of preference; the last one has no building (always open; content test). */
  readonly spots: readonly Spot<Id>[];
  readonly stay: 'idle' | KobzarAnim;
  readonly cart?: true;
}

export type AgentSpawn<Id extends string = string> =
  WanderSpawn<Id> | VillagerSpawn<Id> | CossackSpawn<Id> | CartSpawn<Id> | VisitorSpawn<Id>;

/**
 * A cart's trip (plan M2-20), cosmetic: `reach` = px from the cart's pivot to the leading ox's nose (the generator's
 * `VIZ_REACH`; the cart stops that far before the gate), seconds unloading at the gate [min, max] (seeded per cart),
 * seconds standing turned before the way back, `warmS` = the carts' history run at creation so the first frame finds
 * them on the road (≥ a round trip), and the driver's place: `ahead` px forward of the pivot at the oxen's shoulder,
 * `aside` rows to their left (behind them going east, in front coming back); `lane` = rows nearer the viewer the empty
 * cart keeps, so teams passing each other do not overlap on one row.
 */
export const CART_TRIP = {
  reach: 32,
  unloadS: [6, 10],
  turnS: 2,
  warmS: 300,
  driver: { ahead: 14, aside: 3 },
  lane: 2,
} as const satisfies {
  readonly reach: number;
  readonly unloadS: readonly [number, number];
  readonly turnS: number;
  readonly warmS: number;
  readonly driver: { readonly ahead: number; readonly aside: number };
  readonly lane: number;
};

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
  if (s.routine === 'cart') return [s.home, s.depot.at, s.gate];
  if (s.routine === 'visitor') return [s.home, s.entry.at, ...s.spots.map((p) => p.at)];
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
