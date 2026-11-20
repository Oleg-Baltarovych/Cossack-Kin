// Khortytsia's path graph and its agents (plan M2-20, M2-18): POIs — doors, work spots, campfires, the Sich gate — and
// the ways between them, authored per zone in zone-local px (x from the zone's edge, rows below the horizon) and placed
// in the continuous world by `composeWorld` (khortytsia.layout.ts). Layout data only.
//
// The road runs at row 146 through the farm and the suburb into the Sich's open left side; `sich.gate` is the
// threshold there. Villagers may walk up to it, never past it: every node inside is Cossack-only (plan AC2, Q11).
// A node with a `building` is open only while that building stands (M2-18): the potter's yard, the fair square, the
// work spots — nobody works at an empty plot.
import type { AgentSpawn, CossackNight, GuardSprite, KozakSprite, PathEdge, ZonePaths } from '../agents.ts';

export type KhortytsiaNode =
  | 'farm.road.w'
  | 'farm.road.khata'
  | 'farm.road.mill'
  | 'farm.road.field'
  | 'farm.road.apiary'
  | 'farm.road.e'
  | 'farm.khata'
  | 'farm.fence'
  | 'farm.mill'
  | 'farm.field.a'
  | 'farm.field.b'
  | 'farm.field.c'
  | 'farm.apiary'
  | 'farm.road.lane'
  | 'farm.potter.yard'
  | 'farm.potter'
  | 'farm.potter.wheel'
  | 'farm.garden'
  | 'suburb.road.w'
  | 'suburb.road.tavern'
  | 'suburb.road.well'
  | 'suburb.road.e'
  | 'suburb.tavern'
  | 'suburb.well'
  | 'suburb.square'
  | 'suburb.fair'
  | 'suburb.fair.b'
  | 'suburb.smithy'
  | 'suburb.smithy.bellows'
  | 'suburb.tavern.porch'
  | 'suburb.smithy.yard'
  | 'suburb.fair.c'
  | 'sich.gate'
  | 'sich.maidan.w'
  | 'sich.maidan'
  | 'sich.maidan.e'
  | 'sich.kurin'
  | 'sich.fire'
  | 'sich.post'
  | 'sich.brama'
  | 'sich.church'
  | 'sich.drill.a'
  | 'sich.drill.b'
  | 'sich.drill.c'
  | 'sich.drill.d'
  | 'sich.otaman'
  | 'sich.review.e'
  | 'sich.review.w'
  | 'sich.fire.w'
  | 'sich.fire.e'
  | 'sich.fire.se'
  | 'sich.fire2.w'
  | 'sich.fire2.sw'
  | 'sich.wall'
  | 'sich.post.w'
  | 'sich.post.e'
  | 'sich.post.e2'
  | 'sich.post.e3';

/** Behind the gate: Cossacks only. */
const SICH_ONLY = ['cossack'] as const;

/**
 * The farm: the road along the middle row, the khata's door and the fence where people stop to talk; three spots
 * along the field's front edge (scythe and sickle), one by the hives; a lane from the road down to the potter's
 * trodden yard, his wheel in it; the mill and the garden as places to stop by (people keep to the road, yards and
 * work spots — never stand in open meadow, art-director M2-16).
 */
export const FARM_PATHS: ZonePaths<KhortytsiaNode> = {
  nodes: [
    { id: 'farm.road.w', kind: 'way', x: 24, ground: 146 },
    { id: 'farm.road.khata', kind: 'way', x: 116, ground: 146 },
    { id: 'farm.road.mill', kind: 'way', x: 312, ground: 146 },
    { id: 'farm.road.field', kind: 'way', x: 450, ground: 146 },
    { id: 'farm.road.apiary', kind: 'way', x: 660, ground: 146 },
    { id: 'farm.road.e', kind: 'way', x: 760, ground: 146 },
    { id: 'farm.khata', kind: 'door', x: 116, ground: 108 },
    { id: 'farm.fence', kind: 'way', x: 160, ground: 128 },
    { id: 'farm.mill', kind: 'way', x: 296, ground: 130, building: 'windmill' },
    { id: 'farm.field.a', kind: 'work', x: 424, ground: 106, building: 'field', work: 'work-field' },
    { id: 'farm.field.b', kind: 'work', x: 450, ground: 108, building: 'field', work: 'work-field' },
    { id: 'farm.field.c', kind: 'work', x: 476, ground: 106, building: 'field', work: 'work-field' },
    { id: 'farm.apiary', kind: 'work', x: 640, ground: 128, building: 'apiary', work: 'work-apiary' },
    { id: 'farm.road.lane', kind: 'way', x: 236, ground: 146 },
    { id: 'farm.potter.yard', kind: 'way', x: 236, ground: 248, building: 'potter' },
    { id: 'farm.potter', kind: 'door', x: 296, ground: 248, building: 'potter' },
    { id: 'farm.potter.wheel', kind: 'work', x: 274, ground: 247, building: 'potter', work: 'work-potter' },
    { id: 'farm.garden', kind: 'way', x: 452, ground: 272, building: 'garden' },
  ],
  edges: [
    ['farm.road.w', 'farm.road.khata'],
    ['farm.road.khata', 'farm.road.lane'],
    ['farm.road.lane', 'farm.road.mill'],
    ['farm.road.mill', 'farm.road.field'],
    ['farm.road.field', 'farm.road.apiary'],
    ['farm.road.apiary', 'farm.road.e'],
    ['farm.road.khata', 'farm.fence'],
    ['farm.fence', 'farm.khata'],
    ['farm.road.mill', 'farm.mill'],
    ['farm.road.field', 'farm.field.b'],
    ['farm.field.b', 'farm.field.a'],
    ['farm.field.b', 'farm.field.c'],
    ['farm.road.apiary', 'farm.apiary'],
    ['farm.road.lane', 'farm.potter.yard'],
    ['farm.potter.yard', 'farm.potter'],
    ['farm.potter.yard', 'farm.potter.wheel'],
    ['farm.road.field', 'farm.garden'],
  ],
};

/**
 * The suburb: the road on, the tavern door, the crane well, the fair square with two stalls to trade at and the
 * smithy — the anvil and the bellows by the forge (reached from the road's bend, so it does not need the fair).
 */
export const SUBURB_PATHS: ZonePaths<KhortytsiaNode> = {
  nodes: [
    { id: 'suburb.road.w', kind: 'way', x: 16, ground: 146 },
    { id: 'suburb.road.tavern', kind: 'way', x: 96, ground: 146 },
    { id: 'suburb.road.well', kind: 'way', x: 214, ground: 146 },
    { id: 'suburb.road.e', kind: 'way', x: 340, ground: 146 },
    { id: 'suburb.tavern', kind: 'door', x: 96, ground: 120, building: 'tavern' },
    { id: 'suburb.well', kind: 'way', x: 226, ground: 114 },
    { id: 'suburb.square', kind: 'way', x: 236, ground: 236, building: 'fair' },
    { id: 'suburb.fair', kind: 'work', x: 150, ground: 250, building: 'fair', work: 'work-fair' },
    { id: 'suburb.fair.b', kind: 'work', x: 186, ground: 248, building: 'fair', work: 'work-fair' },
    { id: 'suburb.smithy', kind: 'work', x: 330, ground: 226, building: 'smithy', work: 'work-smithy' },
    { id: 'suburb.smithy.bellows', kind: 'work', x: 292, ground: 222, building: 'smithy', work: 'work-smithy' },
    // Where the free Cossacks idle (M2-19): before the tavern by its sign, beside the smith's anvil, at the stalls.
    { id: 'suburb.tavern.porch', kind: 'way', x: 120, ground: 124, building: 'tavern' },
    { id: 'suburb.smithy.yard', kind: 'way', x: 354, ground: 232, building: 'smithy' },
    { id: 'suburb.fair.c', kind: 'way', x: 214, ground: 254, building: 'fair' },
  ],
  edges: [
    ['suburb.road.w', 'suburb.road.tavern'],
    ['suburb.road.tavern', 'suburb.road.well'],
    ['suburb.road.well', 'suburb.road.e'],
    ['suburb.road.tavern', 'suburb.tavern'],
    ['suburb.road.well', 'suburb.well'],
    ['suburb.road.well', 'suburb.square'],
    ['suburb.square', 'suburb.fair.b'],
    ['suburb.fair.b', 'suburb.fair'],
    ['suburb.road.e', 'suburb.smithy'],
    ['suburb.smithy', 'suburb.smithy.bellows'],
    ['suburb.road.tavern', 'suburb.tavern.porch'],
    ['suburb.road.e', 'suburb.smithy.yard'],
    ['suburb.square', 'suburb.fair.c'],
  ],
};

/**
 * The Sich: the gate where the road meets the maidan (anyone), then — Cossacks only — the maidan, the kurin's door, the
 * campfire, the guard post before the church, the brama in the back wall and the church door. M2-19: the drill block on
 * the maidan (four depth rows a–d, each a front and a rear file 20 px apart, rows 9 px, slanting back like a rank seen from the
 * side), the otaman's stand before it (facing it) and his review line along its front, places round the fire (and the
 * second fire of maidan IV), and the guards' posts on the rampart walk beside the towers (the watchtower; the wall
 * towers from walls II and III), reached over the moat bridge behind the brama.
 */
export const SICH_PATHS: ZonePaths<KhortytsiaNode> = {
  nodes: [
    { id: 'sich.gate', kind: 'gate', x: 12, ground: 146 },
    { id: 'sich.maidan.w', kind: 'way', x: 40, ground: 150, only: SICH_ONLY },
    { id: 'sich.maidan', kind: 'way', x: 200, ground: 150, only: SICH_ONLY },
    { id: 'sich.maidan.e', kind: 'way', x: 330, ground: 150, only: SICH_ONLY },
    { id: 'sich.kurin', kind: 'door', x: 100, ground: 218, only: SICH_ONLY },
    { id: 'sich.fire', kind: 'campfire', x: 176, ground: 186, only: SICH_ONLY },
    { id: 'sich.post', kind: 'work', x: 222, ground: 96, only: SICH_ONLY },
    { id: 'sich.brama', kind: 'work', x: 198, ground: 66, only: SICH_ONLY },
    { id: 'sich.church', kind: 'door', x: 280, ground: 70, only: SICH_ONLY },
    // Rows 9 px apart, files 20 px (art-director M2-19: the 7 × 16 block read as a crowd).
    { id: 'sich.drill.a', kind: 'way', x: 200, ground: 116, only: SICH_ONLY, building: 'maidan' },
    { id: 'sich.drill.b', kind: 'way', x: 198, ground: 125, only: SICH_ONLY, building: 'maidan' },
    { id: 'sich.drill.c', kind: 'way', x: 196, ground: 134, only: SICH_ONLY, building: 'maidan' },
    { id: 'sich.drill.d', kind: 'way', x: 194, ground: 143, only: SICH_ONLY, building: 'maidan' },
    { id: 'sich.otaman', kind: 'way', x: 238, ground: 130, only: SICH_ONLY, building: 'maidan' },
    { id: 'sich.review.e', kind: 'way', x: 238, ground: 154, only: SICH_ONLY, building: 'maidan' },
    { id: 'sich.review.w', kind: 'way', x: 160, ground: 154, only: SICH_ONLY, building: 'maidan' },
    { id: 'sich.fire.w', kind: 'campfire', x: 180, ground: 177, only: SICH_ONLY },
    { id: 'sich.fire.e', kind: 'campfire', x: 210, ground: 177, only: SICH_ONLY },
    { id: 'sich.fire.se', kind: 'campfire', x: 208, ground: 190, only: SICH_ONLY },
    // The second fire with the kazan by the far kurins (maidan IV, layout MAIDAN): fire at 586/200, kazan at 604.
    { id: 'sich.fire2.w', kind: 'campfire', x: 570, ground: 197, only: SICH_ONLY, building: 'maidan', from: 4 },
    { id: 'sich.fire2.sw', kind: 'campfire', x: 574, ground: 208, only: SICH_ONLY, building: 'maidan', from: 4 },
    // The rampart walk where the moat bridge lands behind the brama, and the posts beside the towers.
    { id: 'sich.wall', kind: 'way', x: 198, ground: 46, only: SICH_ONLY, building: 'walls' },
    { id: 'sich.post.w', kind: 'way', x: 84, ground: 46, only: SICH_ONLY, building: 'special' },
    { id: 'sich.post.e', kind: 'way', x: 348, ground: 46, only: SICH_ONLY, building: 'walls', from: 2 },
    { id: 'sich.post.e2', kind: 'way', x: 556, ground: 46, only: SICH_ONLY, building: 'walls', from: 3 },
    { id: 'sich.post.e3', kind: 'way', x: 736, ground: 46, only: SICH_ONLY, building: 'walls', from: 3 },
  ],
  edges: [
    ['sich.gate', 'sich.maidan.w'],
    ['sich.maidan.w', 'sich.maidan'],
    ['sich.maidan', 'sich.maidan.e'],
    ['sich.maidan.w', 'sich.kurin'],
    ['sich.kurin', 'sich.fire'],
    ['sich.maidan', 'sich.fire'],
    ['sich.maidan', 'sich.post'],
    ['sich.post', 'sich.brama'],
    ['sich.post', 'sich.church'],
    ['sich.maidan', 'sich.drill.a'],
    ['sich.maidan', 'sich.drill.b'],
    ['sich.maidan', 'sich.drill.c'],
    ['sich.maidan', 'sich.drill.d'],
    ['sich.maidan', 'sich.otaman'],
    ['sich.otaman', 'sich.review.e'],
    ['sich.review.e', 'sich.review.w'],
    ['sich.review.w', 'sich.maidan.w'],
    ['sich.maidan', 'sich.fire.w'],
    ['sich.maidan', 'sich.fire.e'],
    ['sich.fire', 'sich.fire.se'],
    ['sich.maidan.e', 'sich.fire2.w'],
    ['sich.fire2.w', 'sich.fire2.sw'],
    ['sich.brama', 'sich.wall'],
    ['sich.wall', 'sich.post.w'],
    ['sich.wall', 'sich.post.e'],
    ['sich.post.e', 'sich.post.e2'],
    ['sich.post.e2', 'sich.post.e3'],
  ],
};

/** Where the zones meet: the road crosses from the farm into the suburb and from the suburb to the Sich gate. */
export const KHORTYTSIA_LINKS: readonly PathEdge<KhortytsiaNode>[] = [
  ['farm.road.e', 'suburb.road.w'],
  ['suburb.road.e', 'sich.gate'],
];

/** Every Cossack's door: the first kurin (a hire walks out of it; whoever has nowhere to be goes in). */
const KURIN = 'sich.kurin';

/** A Cossack of the ranks at `row` (front file dx 0, rear −20), by the fire at night. */
const ranker = (
  sprite: KozakSprite,
  row: 'a' | 'b' | 'c' | 'd',
  file: 0 | -20,
  night: CossackNight<KhortytsiaNode>,
  phase = 0,
): AgentSpawn<KhortytsiaNode> => ({
  routine: 'cossack',
  role: 'cossack',
  duty: 'rank',
  sprite,
  home: KURIN,
  rank: { at: `sich.drill.${row}`, dx: file, facing: 1 },
  haunts: ['sich.fire.w', 'suburb.tavern.porch', 'sich.maidan.e'],
  night,
  speed: 22,
  phase,
});
const free = (sprite: KozakSprite, night: CossackNight<KhortytsiaNode>): AgentSpawn<KhortytsiaNode> => ({
  routine: 'cossack',
  role: 'cossack',
  duty: 'free',
  sprite,
  home: KURIN,
  haunts: ['suburb.tavern.porch', 'suburb.smithy.yard', 'suburb.fair.c', 'sich.fire.e'],
  night,
  speed: 22,
  phase: 0,
});
const guard = (sprite: GuardSprite, post: KhortytsiaNode, facing: 1 | -1): AgentSpawn<KhortytsiaNode> => ({
  routine: 'cossack',
  role: 'cossack',
  duty: 'guard',
  sprite,
  home: KURIN,
  post: { at: post, dx: 0, facing },
  speed: 20,
  phase: 0,
});
/** By a fire: seated with a pipe (`dx` toward the fire's side) or standing beside him, facing the flames. */
const pipe = (at: KhortytsiaNode, dx: number, facing: 1 | -1): CossackNight<KhortytsiaNode> => ({
  at,
  dx,
  facing,
  anim: 'sit-smoke',
});
const stand = (at: KhortytsiaNode, dx: number, facing: 1 | -1): CossackNight<KhortytsiaNode> => ({
  at,
  dx,
  facing,
  anim: 'idle',
});
const IN: CossackNight<KhortytsiaNode> = { anim: 'indoors' };

/**
 * The Sich's 16 (plan M2-19, Q11): on the scene in this order as the army grows (`populationView`) — first a free
 * Cossack, the first ranks and the otaman, the watchtower's guard, then more ranks, free Cossacks and the wall towers'
 * guards. Ranks a–d × front / rear file; by night two to a place at the fire (one with a pipe, one standing beside him,
 * 4 px apart, facing the flames), the second fire's places from maidan IV, the rest in the kurin.
 */
const SICH_COSSACKS: readonly AgentSpawn<KhortytsiaNode>[] = [
  free('kozak.a', pipe('sich.fire.w', -4, 1)),
  ranker('kozak.b', 'a', 0, pipe('sich.fire.e', 4, -1)),
  ranker('kozak.c', 'a', -20, stand('sich.fire.w', 0, 1)),
  {
    routine: 'cossack',
    role: 'cossack',
    duty: 'otaman',
    sprite: 'otaman.a',
    home: KURIN,
    stand: { at: 'sich.otaman', dx: 0, facing: -1 },
    review: ['sich.review.e', 'sich.review.w', 'sich.review.e'],
    speed: 14,
    phase: 0,
  },
  guard('vartovyi.a', 'sich.post.w', 1),
  ranker('kozak.a', 'b', 0, stand('sich.fire.e', 0, -1)),
  free('kozak.c', pipe('sich.fire', -4, 1)),
  ranker('kozak.b', 'b', -20, stand('sich.fire', 0, 1)),
  guard('vartovyi.b', 'sich.post.e', -1),
  ranker('kozak.c', 'c', 0, pipe('sich.fire.se', 4, -1)),
  ranker('kozak.a', 'c', -20, stand('sich.fire.se', 0, -1)),
  free('kozak.b', pipe('sich.fire2.w', -4, 1)),
  ranker('kozak.b', 'd', 0, stand('sich.fire2.w', 0, 1)),
  guard('vartovyi.a', 'sich.post.e2', -1),
  ranker('kozak.c', 'd', -20, IN),
  guard('vartovyi.b', 'sich.post.e3', -1),
];

/** Every villager's door: the khata stands from the start, so whoever has no night spot standing goes in there. */
const HOME = 'farm.khata';

/**
 * The scene's people. On the farm (plan M2-18): a man and two women at the field (scythe, sickles), the beekeeper at
 * the hives, the potter at his wheel — they stop at the fence, the mill or the garden to talk; at night two on the
 * khata's prysba and one across the door, the potter on his, the beekeeper keeping watch by the hives (art-director:
 * at most two on a side of a door, the rest indoors). A girl wanders the farm (seeded). In the suburb two traders at
 * the fair stalls (the tavern's prysba at night), the smith at the anvil and a woman at the bellows (by the forge at
 * night), a girl between the tavern, the square and the well; the girls go in at dusk. In the Sich only Cossacks (no
 * women on the Sich, historical): `SICH_COSSACKS` (M2-19), as many as the army has.
 */
export const KHORTYTSIA_AGENTS: readonly AgentSpawn<KhortytsiaNode>[] = [
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianyn.a',
    home: HOME,
    work: ['farm.field.b'],
    chat: ['farm.fence', 'farm.mill', 'farm.road.field'],
    night: { at: 'farm.khata', anim: 'sit', dx: -6, facing: 1 },
    speed: 18,
    phase: 0.2,
  },
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianka.a',
    home: HOME,
    work: ['farm.field.a'],
    chat: ['farm.fence', 'farm.garden', 'farm.khata'],
    night: { at: 'farm.khata', anim: 'talk', dx: -2, facing: -1 },
    speed: 16,
    phase: 4,
  },
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianka.c',
    home: HOME,
    work: ['farm.field.c'],
    chat: ['farm.garden', 'farm.mill', 'farm.road.lane'],
    night: { at: 'farm.khata', anim: 'talk', dx: 9, facing: -1 },
    speed: 16,
    phase: 9,
  },
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianyn.b',
    home: HOME,
    work: ['farm.apiary'],
    chat: ['farm.garden', 'farm.mill', 'farm.road.apiary'],
    night: { at: 'farm.apiary', anim: 'sit', dx: -12, facing: 1 },
    speed: 16,
    phase: 2.5,
  },
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianyn.c',
    home: HOME,
    work: ['farm.potter.wheel'],
    chat: ['farm.potter.yard', 'farm.mill', 'farm.road.mill'],
    night: { at: 'farm.potter', anim: 'sit', dx: -4, facing: 1 },
    speed: 18,
    phase: 6,
  },
  {
    routine: 'wander',
    role: 'villager',
    sprite: 'divchyna.a',
    home: 'farm.road.lane',
    goals: ['farm.khata', 'farm.potter', 'farm.fence', 'farm.garden', 'farm.mill'],
    order: 'random',
    speed: 18,
    rest: 3,
    indoors: 'farm.khata',
    phase: 1.2,
  },
  {
    routine: 'wander',
    role: 'villager',
    sprite: 'divchyna.b',
    home: 'suburb.well',
    goals: ['suburb.tavern', 'suburb.square', 'suburb.well'],
    order: 'cycle',
    speed: 18,
    rest: 4,
    indoors: 'farm.khata',
    phase: 0.7,
  },
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianyn.b',
    home: HOME,
    work: ['suburb.fair'],
    chat: ['suburb.well', 'suburb.square'],
    night: { at: 'suburb.tavern', anim: 'sit', dx: -6, facing: 1 },
    speed: 18,
    phase: 0.5,
  },
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianka.d',
    home: HOME,
    work: ['suburb.fair.b'],
    chat: ['suburb.well', 'suburb.tavern'],
    night: { at: 'suburb.tavern', anim: 'talk', dx: -2, facing: -1 },
    speed: 16,
    phase: 5,
  },
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianyn.d',
    home: HOME,
    work: ['suburb.smithy'],
    chat: ['suburb.well', 'suburb.square'],
    night: { at: 'suburb.smithy', anim: 'sit', dx: 0, facing: -1 },
    speed: 18,
    phase: 3,
  },
  {
    routine: 'villager',
    role: 'villager',
    sprite: 'selianka.a',
    home: HOME,
    work: ['suburb.smithy.bellows'],
    chat: ['suburb.well', 'suburb.tavern'],
    night: { at: 'suburb.smithy.bellows', anim: 'sit', dx: 0, facing: 1 },
    speed: 16,
    phase: 7,
  },
  ...SICH_COSSACKS,
];
