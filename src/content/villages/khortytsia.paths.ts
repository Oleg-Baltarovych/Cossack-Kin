// Khortytsia's path graph and its agents (plan M2-16, M2-18): POIs — doors, work spots, campfires, the Sich gate — and
// the ways between them, authored per zone in zone-local px (x from the zone's edge, rows below the horizon) and placed
// in the continuous world by `composeWorld` (khortytsia.layout.ts). Layout data only.
//
// The road runs at row 146 through the farm and the suburb into the Sich's open left side; `sich.gate` is the
// threshold there. Villagers may walk up to it, never past it: every node inside is Cossack-only (plan AC2, Q11).
// A node with a `building` is open only while that building stands (M2-18): the potter's yard, the fair square, the
// work spots — nobody works at an empty plot.
import type { AgentSpawn, PathEdge, ZonePaths } from '../agents.ts';

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
  | 'sich.gate'
  | 'sich.maidan.w'
  | 'sich.maidan'
  | 'sich.maidan.e'
  | 'sich.kurin'
  | 'sich.fire'
  | 'sich.post'
  | 'sich.brama'
  | 'sich.church';

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
  ],
};

/**
 * The Sich: the gate where the road meets the maidan (anyone), then — Cossacks only — the maidan, the kurin's door, the
 * campfire, the guard post before the church, the brama in the back wall and the church door.
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
  ],
};

/** Where the zones meet: the road crosses from the farm into the suburb and from the suburb to the Sich gate. */
export const KHORTYTSIA_LINKS: readonly PathEdge<KhortytsiaNode>[] = [
  ['farm.road.e', 'suburb.road.w'],
  ['suburb.road.e', 'sich.gate'],
];

/** Every villager's door: the khata stands from the start, so whoever has no night spot standing goes in there. */
const HOME = 'farm.khata';

/**
 * The scene's people. On the farm (plan M2-18): a man and two women at the field (scythe, sickles), the beekeeper at
 * the hives, the potter at his wheel — they stop at the fence, the mill or the garden to talk; at night two on the
 * khata's prysba and one across the door, the potter on his, the beekeeper keeping watch by the hives (art-director:
 * at most two on a side of a door, the rest indoors). A girl wanders the farm (seeded). In the suburb two traders at
 * the fair stalls (the tavern's prysba at night), the smith at the anvil and a woman at the bellows (by the forge at
 * night), a girl between the tavern, the square and the well; the girls go in at dusk. A Cossack walks the farm road;
 * in the Sich only Cossacks (no women on the Sich, historical) — their own routine is M2-19.
 */
export const KHORTYTSIA_AGENTS: readonly AgentSpawn<KhortytsiaNode>[] = [
  {
    routine: 'wander',
    role: 'cossack',
    sprite: 'kozak.a',
    home: 'farm.road.w',
    goals: ['farm.road.mill', 'farm.road.w'],
    order: 'cycle',
    speed: 22,
    rest: 3,
    phase: 0,
  },
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
  {
    routine: 'wander',
    role: 'cossack',
    sprite: 'kozak.a',
    home: 'sich.kurin',
    goals: ['sich.fire', 'sich.kurin'],
    order: 'cycle',
    speed: 22,
    rest: 3,
    phase: 0,
  },
  {
    routine: 'wander',
    role: 'cossack',
    sprite: 'kozak.b',
    home: 'sich.post',
    goals: [],
    order: 'cycle',
    speed: 0,
    rest: 0,
    phase: 0.3,
  },
  {
    routine: 'wander',
    role: 'cossack',
    sprite: 'kozak.c',
    home: 'sich.maidan.e',
    goals: ['sich.maidan.w', 'sich.church', 'sich.maidan.e', 'sich.brama', 'sich.fire'],
    order: 'random',
    speed: 20,
    rest: 5,
    phase: 1.1,
  },
];
