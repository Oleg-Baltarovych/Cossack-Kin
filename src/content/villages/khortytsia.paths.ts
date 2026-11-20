// Khortytsia's path graph and its agents (plan M2-16): POIs — doors, work spots, campfires, the Sich gate — and the
// ways between them, authored per zone in zone-local px (x from the zone's edge, rows below the horizon) and placed in
// the continuous world by `composeWorld` (khortytsia.layout.ts). Layout data only.
//
// The road runs at row 146 through the farm and the suburb into the Sich's open left side; `sich.gate` is the
// threshold there. Villagers may walk up to it, never past it: every node inside is Cossack-only (plan AC2, Q11).
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
  | 'farm.field'
  | 'farm.apiary'
  | 'farm.road.lane'
  | 'farm.potter.yard'
  | 'farm.potter'
  | 'farm.garden'
  | 'suburb.road.w'
  | 'suburb.road.tavern'
  | 'suburb.road.well'
  | 'suburb.road.e'
  | 'suburb.tavern'
  | 'suburb.well'
  | 'suburb.square'
  | 'suburb.fair'
  | 'suburb.smithy'
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
 * The farm: the road along the middle row, the khata's door and the fence where the farmer rests, work spots in front
 * of the mill, the field, the apiary and the garden; a lane from the road down to the potter's trodden yard (people
 * keep to the road, yards and work spots — never stand in open meadow, art-director M2-16).
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
    { id: 'farm.fence', kind: 'work', x: 160, ground: 128 },
    { id: 'farm.mill', kind: 'work', x: 296, ground: 130 },
    { id: 'farm.field', kind: 'work', x: 430, ground: 108 },
    { id: 'farm.apiary', kind: 'work', x: 630, ground: 128 },
    { id: 'farm.road.lane', kind: 'way', x: 236, ground: 146 },
    { id: 'farm.potter.yard', kind: 'way', x: 236, ground: 248 },
    { id: 'farm.potter', kind: 'door', x: 296, ground: 248 },
    { id: 'farm.garden', kind: 'work', x: 440, ground: 272 },
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
    ['farm.road.field', 'farm.field'],
    ['farm.road.apiary', 'farm.apiary'],
    ['farm.road.lane', 'farm.potter.yard'],
    ['farm.potter.yard', 'farm.potter'],
    ['farm.road.field', 'farm.garden'],
  ],
};

/** The suburb: the road on, the tavern door, the crane well, the fair square and the smithy's forge. */
export const SUBURB_PATHS: ZonePaths<KhortytsiaNode> = {
  nodes: [
    { id: 'suburb.road.w', kind: 'way', x: 16, ground: 146 },
    { id: 'suburb.road.tavern', kind: 'way', x: 96, ground: 146 },
    { id: 'suburb.road.well', kind: 'way', x: 214, ground: 146 },
    { id: 'suburb.road.e', kind: 'way', x: 340, ground: 146 },
    { id: 'suburb.tavern', kind: 'door', x: 96, ground: 120 },
    { id: 'suburb.well', kind: 'work', x: 226, ground: 114 },
    { id: 'suburb.square', kind: 'way', x: 236, ground: 236 },
    { id: 'suburb.fair', kind: 'work', x: 156, ground: 250 },
    { id: 'suburb.smithy', kind: 'work', x: 300, ground: 226 },
  ],
  edges: [
    ['suburb.road.w', 'suburb.road.tavern'],
    ['suburb.road.tavern', 'suburb.road.well'],
    ['suburb.road.well', 'suburb.road.e'],
    ['suburb.road.tavern', 'suburb.tavern'],
    ['suburb.road.well', 'suburb.well'],
    ['suburb.road.well', 'suburb.square'],
    ['suburb.square', 'suburb.fair'],
    ['suburb.square', 'suburb.smithy'],
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

/**
 * The scene's people (the ART-06/15 walkers moved onto the graph): on the farm a Cossack on the road, a woman between
 * the two yards, one between the potter's yard and the garden, the farmer resting at the fence, a girl wandering the
 * farm (seeded); in the suburb a woman to the tavern, the fair and the well and a man trading at the stalls; in the Sich
 * only Cossacks (no women on the Sich, historical).
 */
export const KHORTYTSIA_AGENTS: readonly AgentSpawn<KhortytsiaNode>[] = [
  {
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
    role: 'villager',
    sprite: 'selianka.a',
    home: 'farm.potter',
    goals: ['farm.khata', 'farm.potter'],
    order: 'cycle',
    speed: 20,
    rest: 4,
    phase: 0.4,
  },
  {
    role: 'villager',
    sprite: 'selianka.b',
    home: 'farm.potter.yard',
    goals: ['farm.garden', 'farm.potter.yard'],
    order: 'cycle',
    speed: 14,
    rest: 5,
    phase: 9,
  },
  {
    role: 'villager',
    sprite: 'selianyn.a',
    home: 'farm.fence',
    goals: [],
    order: 'cycle',
    speed: 0,
    rest: 0,
    phase: 0.2,
  },
  {
    role: 'villager',
    sprite: 'divchyna.a',
    home: 'farm.road.lane',
    goals: ['farm.khata', 'farm.potter', 'farm.fence', 'farm.garden', 'farm.mill'],
    order: 'random',
    speed: 18,
    rest: 3,
    phase: 1.2,
  },
  {
    role: 'villager',
    sprite: 'divchyna.b',
    home: 'suburb.well',
    goals: ['suburb.tavern', 'suburb.fair', 'suburb.well'],
    order: 'cycle',
    speed: 18,
    rest: 4,
    phase: 0.7,
  },
  {
    role: 'villager',
    sprite: 'selianyn.b',
    home: 'suburb.fair',
    goals: [],
    order: 'cycle',
    speed: 0,
    rest: 0,
    phase: 0.5,
  },
  {
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
