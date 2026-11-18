// Khortytsia scene layout (plan §0, ART-05, M2-01): positions only. Zones are authored in zone-local px
// (`ZoneScene`) and placed edge to edge into one continuous world (`KHORTYTSIA_WORLD`, world px). M2 grows this into
// the full village file (buildings by tier, plots, path graph). Units are logical px; y offsets are measured down from
// the horizon row.

/**
 * Ground tile kinds of the `khortytsia` atlas (`ground.<tile>/idle/00`, 64×32). `grass` has seeded variants
 * (`grass`, `grass-b`, `grass-c`) that the ground layer picks per tile.
 */
import { TIER_LEVELS } from '../economy.ts';
import { SICH_BUILDING_IDS, type SichBuildingId } from '../sich.ts';
import type { FarmBuildingId } from './khortytsia.ts';

/** A building whose level drives what stands on its plot (farm and Sich ids do not overlap). */
export type PlotBuilding = FarmBuildingId | SichBuildingId;

/**
 * Ties a prop or decal to a building's plot (plan M1-19, SPEC §6.5): shown while the building's visual tier is in
 * [from, until). Visual tier = 0 at level 0 (empty plot), then 1 + the milestones reached (I at level 1, III at 25 …).
 * The highest sprite tier that exists is shown: khata I covers tiers I–II until khata III. No plot = always there.
 */
export interface Plot {
  readonly building: PlotBuilding;
  readonly from: number;
  readonly until?: number;
  /** Other buildings that must stand too (a trail from the gate to a kurin needs both). */
  readonly requires?: readonly { readonly building: PlotBuilding; readonly from: number }[];
}

export type GroundTile = 'meadow' | 'grass' | 'path' | 'earth' | 'val' | 'maidan' | 'maidan-end';

export interface GroundRow {
  readonly tile: GroundTile;
  /** Rows below the horizon where this band starts; bands are whole tiles (multiples of 32) tall. */
  readonly top: number;
  readonly h: number;
  /** A band that belongs to a plot (the maidan, the rampart): `alt` (default: the layout's `fill`) while it is empty. */
  readonly plot?: Plot;
  readonly alt?: GroundTile;
}

export interface Prop {
  /** Atlas frame stem in `khortytsia` (`<stem>/idle/00`, companions `<entity>@shadow…`). */
  readonly sprite:
    | 'khata.t1'
    | 'khata.t3'
    | 'tyn'
    | 'mallows'
    | 'palisade.h0'
    | 'palisade.h1'
    | 'palisade.h2'
    | 'palisade.h3'
    | 'tower'
    | 'gate'
    | 'kurin'
    | 'cannon'
    | 'logpile'
    | 'church'
    | 'belfry'
    | 'windmill'
    | 'windmill-sails'
    | 'oak'
    | 'willow'
    | 'campfire'
    | 'cross'
    | 'gatepost'
    | `field.t${TierNo}`
    | `garden.t${TierNo}`
    | `apiary.t${TierNo}`
    | 'scarecrow'
    | 'sheaves'
    | 'cart'
    | 'garden-tyn'
    | 'hive.log'
    | 'hive.stump'
    | 'bees'
    | 'apiary-hut';
  /** Pivot (bottom-centre of the ground row the prop stands on), world x. */
  readonly x: number;
  /** Pivot y below the horizon; also the Y-sort key. */
  readonly ground: number;
  /** Draw the pivot this many px above `ground` (sails hung on a hub); sorts just in front of its ground row. */
  readonly lift?: number;
  /** `false`: the sprite has no `@shadow` frame (default true). */
  readonly shadow?: boolean;
  /**
   * `cycle`: loop `<sprite>/idle/NN` frames at a rate (`wind` = from the wind strength); `sway`: pick one of the
   * baked lean frames from the wind (render/sway.ts) — `amp` the share of the full lean, `phase` 0..1.
   */
  readonly animate?: Animate;
  /** Day-only life (bees): hidden at night and under «менше руху» (render: DAYTIME_PROPS). */
  readonly daytime?: boolean;
  readonly plot?: Plot;
}

/** Tier numbers of the farm generators' variants (`field.t1` … `field.t6`). */
type TierNo = 1 | 2 | 3 | 4 | 5 | 6;

export type Animate =
  | { readonly kind: 'cycle'; readonly frames: number; readonly fps: number | 'wind' }
  | { readonly kind: 'sway'; readonly amp: number; readonly phase: number };

/** One sprite of a building's look at a tier: the base or a building-specific add-on (sails, hives). */
export interface TierPart {
  /** Frame stem; `<stem>@shadow` is drawn unless `shadow: false`, `<stem>@emissive` at night when the atlas has it. */
  readonly sprite: Prop['sprite'];
  /** Offset of this part's pivot from the building's pivot (add-ons beside the base); default 0. */
  readonly dx?: number;
  readonly dground?: number;
  readonly lift?: number;
  readonly shadow?: boolean;
  readonly animate?: Animate;
  readonly daytime?: boolean;
}

/** A building's drawn look at a tier: the base and its add-ons. */
export interface TierParts {
  readonly parts: readonly TierPart[];
}

/**
 * A building's look at one tier: its parts, or `prev` — the previous tier's look until the task named there (an
 * M2-06…09 art task) draws this tier.
 */
export type TierLook = TierParts | { readonly prev: string };

/**
 * A building's plot by visual tier (plan M2-05, «Тіри — модульно»): `tiers[i]` is the look at tier i + 1, for every
 * tier the building has (content TIER_LEVELS: farm/suburb I–VI, Sich I–IV); tier I is always drawn (the type says
 * so), later tiers may fall back. Shared add-ons (tyn, mallows) stay separate props with a `plot`. `composeWorld`
 * turns it into plain props with `plot { from, until }` in place, so render shows a look by the game's visual tier
 * (core `visualTiers`) and never works out tiers itself.
 */
export interface TierSprite {
  readonly building: PlotBuilding;
  /** The building's pivot (bottom-centre of its ground row), x in the zone's / world's px. */
  readonly x: number;
  readonly ground: number;
  readonly tiers: readonly [TierParts, ...TierLook[]];
}

/** A zone's prop list entry: a plain prop or a building drawn by tier. */
export type SceneProp = Prop | TierSprite;

export const isTierSprite = (p: SceneProp): p is TierSprite => 'tiers' in p;

/** How many visual tiers `building` has (its top tier): farm/suburb 6, Sich 4. */
export function tierCount(building: PlotBuilding): number {
  const sich: readonly string[] = SICH_BUILDING_IDS;
  return (sich.includes(building) ? TIER_LEVELS.sich : TIER_LEVELS.farm).length;
}

/** Tiers `from` … `until` − 1 showing one look; `until` null = up to the top tier. */
export interface TierRun {
  readonly parts: readonly TierPart[];
  readonly from: number;
  readonly until: number | null;
}

/**
 * The runs of a tier table: every `parts` entry starts a run, every `prev` extends the run before it (tier I always
 * starts the first). Throws when the table's length is not the building's tier count.
 */
export function tierRuns(t: TierSprite): TierRun[] {
  const top = tierCount(t.building);
  if (t.tiers.length !== top) {
    throw new Error(`${t.building}: ${String(t.tiers.length)} tier looks, the building has ${String(top)} tiers`);
  }
  const starts = t.tiers.flatMap((look, i) => ('parts' in look ? [{ parts: look.parts, from: i + 1 }] : []));
  return starts.map((run, k) => ({ ...run, until: starts[k + 1]?.from ?? null }));
}

/** The plain props of a tier sprite: each run's parts with `plot { from, until }` (the last run open-ended). */
export function tierProps(t: TierSprite): Prop[] {
  return tierRuns(t).flatMap(({ parts, from, until }) => {
    const plot: Plot = until === null ? { building: t.building, from } : { building: t.building, from, until };
    return parts.map(({ dx, dground, ...part }) => ({
      ...part,
      x: t.x + (dx ?? 0),
      ground: t.ground + (dground ?? 0),
      plot,
    }));
  });
}

/** A zone's props with every tier sprite expanded in place (the order the layers draw and seed them in). */
export const sceneProps = (props: readonly SceneProp[]): Prop[] =>
  props.flatMap((p) => (isTierSprite(p) ? tierProps(p) : [p]));

/**
 * A near-camera plant clump on the foreground layer (ART-14, SPEC §6.2 layer 5, parallax 1.2): `plant.<variant>`
 * frames swaying in the wind. `x` is in the foreground layer's own space (it scrolls 1.2× the ground), `ground` rows
 * below the horizon like the props.
 */
export interface ForegroundPlant {
  readonly sprite: 'plant.grass' | 'plant.reeds' | 'plant.sunflowers' | 'plant.mallows';
  readonly x: number;
  readonly ground: number;
  readonly amp: number;
  readonly phase: number;
}

/** Flat ground decal (no shadow, not Y-sorted): drawn over the tiles, under every shadow and prop. */
export interface Decal {
  readonly sprite: 'yard' | 'trail.l' | 'trail.r' | 'val-end' | 'maidan-edge' | 'road-mouth' | 'road-track' | 'bank';
  /** Centre of the decal, world x / rows below the horizon. */
  readonly x: number;
  readonly ground: number;
  readonly plot?: Plot;
}

/** A person on a scripted route (ART-06 spike; villager FSM and path graph come in M2). */
export interface Walker {
  /** Atlas frame stem `<entity>.<variant>` (`<stem>/walk/NN`, `<stem>/idle/NN`, `<entity>.<variant>@shadow/…`). */
  readonly sprite:
    | 'kozak.a'
    | 'kozak.b'
    | 'kozak.c'
    | 'selianka.a'
    | 'selianka.b'
    | 'divchyna.a'
    | 'divchyna.b'
    | 'selianyn.a'
    | 'selianyn.b';
  /** Route ends (world x of the pivot); equal ends = stands in idle. */
  readonly x0: number;
  readonly x1: number;
  /** Pivot y below the horizon; also the Y-sort key. */
  readonly ground: number;
  /** Logical px per second; matched to the stride so feet do not slide (~2 steps per 0.6 s walk cycle). */
  readonly speed: number;
  /** Seconds of idle at each end. */
  readonly rest: number;
  /** Seconds added to the clock, so walkers do not move in step. */
  readonly phase: number;
}

/**
 * A far landscape plane standing on the horizon (ART-08, SPEC §6.2 layers 2–3), painted on the CPU in the sky's
 * colours: aerial perspective comes from `depth` (chain steps darker than the horizon sky; small = far and hazy).
 * Units are logical px in the plane's own layer space (its parallax), heights above the horizon row.
 */
export type FarPlane =
  | {
      /** Opposite bank: low undulating steppe with kurgans. */
      readonly kind: 'steppe';
      readonly layer: 'far';
      readonly depth: number;
      readonly seed: number;
      /** Kurgans: centre x, half width, height. */
      readonly kurgans: readonly (readonly [number, number, number])[];
    }
  | {
      /** Granite bluffs (кручі): plateaus with steep scarps, trees on the crest. */
      readonly kind: 'cliffs';
      readonly layer: 'far';
      readonly depth: number;
      readonly seed: number;
      /** Plateaus: start x, end x, height. */
      readonly plateaus: readonly (readonly [number, number, number])[];
      /** Rapids (пороги): low granite ridges in the river — start x, end x, height; foam at their foot. */
      readonly rapids?: readonly (readonly [number, number, number])[];
    }
  | {
      /** A line of tree crowns (oak and willow groves). */
      readonly kind: 'grove';
      readonly layer: 'mid';
      readonly depth: number;
      readonly seed: number;
      /** Grove spans: start x, end x, crown height. */
      readonly groves: readonly (readonly [number, number, number])[];
    };

/** Settlement zones along the world, left to right (SPEC §3.0). */
export type ZoneId = 'farm' | 'suburb' | 'sich';

/** Parallax of the foreground layer (SPEC §6.2 layer 5): foreground x is in its own space, 1.2× the ground's. */
export const FOREGROUND_PARALLAX = 1.2;
/** Ground tile size (`ground.<tile>` frames): zone edges sit on whole tile columns. */
export const GROUND_TILE = { w: 64, h: 32 } as const;

export interface Puddle {
  /** Centre x, rows below the horizon, width. */
  readonly x: number;
  readonly ground: number;
  readonly w: number;
}

/** Summer fireflies at night (ART-16): an x range and the rows below the horizon they wander in. */
export interface FireflyArea {
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * One zone as authored (M-ART scenes, plan M2-01): x is zone-local (0 = the zone's left edge; foreground x in the
 * foreground layer's space, also from the zone's edge). `composeWorld` places it in the world.
 */
export interface ZoneScene {
  /** Zone width in logical px: whole ground tiles (a multiple of GROUND_TILE.w). */
  readonly width: number;
  /** Depth bands from the horizon down; below the last one the `fill` tile runs to the bottom of the view. */
  readonly rows: readonly GroundRow[];
  readonly fill: GroundTile;
  readonly decals: readonly Decal[];
  /** Plain props and buildings drawn by tier (`TierSprite`), expanded in place by `composeWorld`. */
  readonly props: readonly SceneProp[];
  readonly walkers: readonly Walker[];
  /** Plant clumps on the foreground layer, back to front. */
  readonly foreground: readonly ForegroundPlant[];
  /** Puddles shown in the rain (ART-17). */
  readonly puddles: readonly Puddle[];
  /** Absent = none. */
  readonly fireflies?: FireflyArea;
  /**
   * Haze band over the ground under the horizon (ART-08). Off where the near scene stands right at the horizon (the
   * Sich's rampart is near, not far meadow).
   */
  readonly groundHaze: boolean;
}

/** A zone's x range in the world; `anchorX` is the camera's left edge when the view goes to the zone. */
export interface WorldZone {
  readonly id: ZoneId;
  readonly x0: number;
  readonly x1: number;
  readonly anchorX: number;
}

/** A zone's ground in the world: its bands and fill tiles from `x0` (tile columns counted from `x0`) to `x1`. */
export interface GroundSegment {
  readonly x0: number;
  readonly x1: number;
  readonly rows: readonly GroundRow[];
  readonly fill: GroundTile;
  readonly groundHaze: boolean;
}

/**
 * The river under the horizon (ART-09): `rows` of water from the horizon down over [x0, x1). Toward `x1` the bank
 * comes forward: over the last `taper` px each row ends a little earlier than the one above it (the nearest row
 * first), so the water runs out to the far bank instead of ending on a vertical cut.
 */
export interface River {
  readonly x0: number;
  readonly x1: number;
  readonly rows: number;
  readonly taper: number;
  /** Rows where a boulder stands on the waterline at the river's end (the `bank` decal draws it, water foams at it). */
  readonly rocks?: readonly number[];
}

/** The whole settlement as one continuous world (plan M2-01, §0 «Неперервний світ»): world x everywhere. */
export interface WorldLayout {
  /** Horizon as a share of the view height (ART-BIBLE §2: 40–45 %; the bottom sheet covers the lowest ~25 %). */
  readonly horizonRatio: number;
  /** World width in logical px (the camera's range). */
  readonly width: number;
  /** Left to right, edge to edge. */
  readonly zones: readonly WorldZone[];
  /** Left to right, one per zone. */
  readonly segments: readonly GroundSegment[];
  readonly river: River | null;
  readonly decals: readonly Decal[];
  /** Every prop, tier sprites expanded (`sceneProps`): what the layers draw. */
  readonly props: readonly Prop[];
  /** The buildings drawn by tier, world x (the tier table; their props are in `props`). */
  readonly tierSprites: readonly TierSprite[];
  readonly walkers: readonly Walker[];
  readonly foreground: readonly ForegroundPlant[];
  readonly puddles: readonly Puddle[];
  readonly fireflies: readonly FireflyArea[];
  /** Back to front; x in each plane's layer space (parallax 0.2 / 0.5), covering the whole world's pan. */
  readonly farPlanes: readonly FarPlane[];
}

/** Bees over the hives: 4 frames @ 8 fps (SPEC §6.5 idle animation), in front of the hives, by day only. */
const bees = (dx: number): TierPart => ({
  sprite: 'bees',
  dx,
  dground: 1,
  shadow: false,
  animate: { kind: 'cycle', frames: 4, fps: 8 },
  daytime: true,
});
/** Log hives along the apiary's front, every other one a row further back (depth). */
const hives = (...dxs: readonly number[]): TierPart[] =>
  dxs.map((dx, i) => ({ sprite: 'hive.log', dx, dground: i % 2 === 0 ? 0 : -2 }));
/**
 * The scarecrow stands inside the wheat: sorted just in front of the field and lifted onto a row further back; its
 * ground shadow would fall in the crop, so none.
 */
const scarecrow = (dx: number): TierPart => ({ sprite: 'scarecrow', dx, dground: 1, lift: 9, shadow: false });
/** The garden wattle runs behind the back bed. */
const gardenTyn = (...dxs: readonly number[]): TierPart[] =>
  dxs.map((dx) => ({ sprite: 'garden-tyn', dx, dground: -20 }));

/**
 * Field, garden and apiary by tier (plan M2-06, ART-BIBLE §6): each tier its own base sprite plus add-ons — the
 * field gets a scarecrow (III), stooks on the stubble (IV, a second row at V) and a loaded cart (V); the garden its
 * low wattle (II); the apiary a stump hive (I), then 2 → 6 log hives with bees and the beekeeper's hut (V).
 */
const FARM_PLOTS: readonly TierSprite[] = [
  {
    building: 'field',
    x: 450,
    ground: 98,
    tiers: [
      { parts: [{ sprite: 'field.t1' }] },
      { parts: [{ sprite: 'field.t2' }] },
      { parts: [{ sprite: 'field.t3' }, scarecrow(-12)] },
      { parts: [{ sprite: 'field.t4' }, scarecrow(-16), { sprite: 'sheaves', dx: 33, dground: -1 }] },
      {
        parts: [
          { sprite: 'sheaves', dx: 31, dground: -8 },
          { sprite: 'field.t5' },
          scarecrow(-22),
          { sprite: 'sheaves', dx: 27, dground: 0 },
          { sprite: 'cart', dx: 72, dground: 3 },
        ],
      },
      {
        parts: [
          { sprite: 'sheaves', dx: 40, dground: -8 },
          { sprite: 'field.t6' },
          scarecrow(-24),
          { sprite: 'sheaves', dx: 38, dground: 0 },
          { sprite: 'cart', dx: 80, dground: 3 },
        ],
      },
    ],
  },
  {
    building: 'apiary',
    x: 660,
    ground: 120,
    tiers: [
      { parts: [{ sprite: 'apiary.t1' }, { sprite: 'hive.stump' }, bees(0)] },
      { parts: [{ sprite: 'apiary.t2' }, ...hives(-7, 4), bees(-2)] },
      { parts: [{ sprite: 'apiary.t3' }, ...hives(-12, -2, 8), bees(-2)] },
      { parts: [{ sprite: 'apiary.t4' }, ...hives(-8, 2, 12, 22), bees(-3), bees(17)] },
      {
        parts: [
          { sprite: 'apiary-hut', dx: -36, dground: -7 },
          { sprite: 'apiary.t5' },
          ...hives(-18, -8, 2, 12, 22),
          bees(-13),
          bees(17),
        ],
      },
      {
        parts: [
          { sprite: 'apiary-hut', dx: -38, dground: -7 },
          { sprite: 'apiary.t6' },
          ...hives(-22, -12, -2, 8, 18, 28),
          bees(-17),
          bees(3),
          bees(23),
        ],
      },
    ],
  },
  {
    building: 'garden',
    // The front row's foreground subject (art-director): low in the row, above the bottom sheet.
    x: 500,
    ground: 262,
    tiers: [
      { parts: [{ sprite: 'garden.t1' }] },
      { parts: [...gardenTyn(-20, 20), { sprite: 'garden.t2' }] },
      { parts: [...gardenTyn(-24, 24), { sprite: 'garden.t3' }] },
      { parts: [...gardenTyn(-28, 28), { sprite: 'garden.t4' }] },
      { parts: [...gardenTyn(-40, 0, 40), { sprite: 'garden.t5' }] },
      { parts: [...gardenTyn(-48, 0, 48), { sprite: 'garden.t6' }] },
    ],
  },
];

export const KHORTYTSIA_FARM: ZoneScene = {
  width: 768,
  rows: [
    { tile: 'meadow', top: 0, h: 32 }, // far meadow, aerial perspective
    { tile: 'grass', top: 32, h: 96 }, // back row: khata tier I and its yard fence
    { tile: 'path', top: 128, h: 32 }, // the path with ruts
    { tile: 'grass', top: 160, h: 128 }, // front row: khata tier III; ends at ~75 % of the screen
  ],
  // Under the future bottom sheet: quiet grass (a large earth fill shows its tile repeat).
  fill: 'grass',
  // Trodden yards, centred a little in front of each house base (art-director ART-05 review).
  decals: [
    { sprite: 'yard', x: 116, ground: 104 },
    { sprite: 'yard', x: 296, ground: 244, plot: { building: 'potter', from: 1 } },
  ],
  // Depth spread over the rows (art-director ART-05 review): the back row sits higher, the front row lower, so the
  // path is the middle ground and less plain lawn is left above and below the houses.
  props: [
    // Back row, khata I with its yard fence running out both sides and mallows at the lit corner.
    { sprite: 'tyn', x: 44, ground: 102 },
    { sprite: 'khata.t1', x: 112, ground: 100 },
    { sprite: 'mallows', x: 88, ground: 102 },
    { sprite: 'tyn', x: 176, ground: 103 },
    { sprite: 'tyn', x: 216, ground: 103 },
    // A willow over the end of the yard fence (верба біля хати, ART-14); low enough that its crown clears the river band.
    { sprite: 'willow', x: 240, ground: 106, animate: { kind: 'sway', amp: 0.8, phase: 0.15 } },
    // The post mill by the road past the yard fence, its sails turning with the wind (hub 53 px above the trestle foot).
    // Low enough that the top sail (93 px above the foot) stays clear of the 26-row river band.
    {
      building: 'windmill',
      x: 312,
      ground: 124,
      tiers: [
        {
          parts: [
            { sprite: 'windmill' },
            { sprite: 'windmill-sails', lift: 53, shadow: false, animate: { kind: 'cycle', frames: 8, fps: 'wind' } },
          ],
        },
        { prev: 'M2-07' },
        { prev: 'M2-07' },
        { prev: 'M2-07' },
        { prev: 'M2-07' },
        { prev: 'M2-07' },
      ],
    },
    // Front row, below the path: the potter's khata (Хата гончаря), nearer and to the right, its own fence and mallows.
    // Khata I at tiers I–II, khata III from III on, until M2-07 draws II and IV–VI.
    {
      building: 'potter',
      x: 292,
      ground: 240,
      tiers: [
        { parts: [{ sprite: 'khata.t1' }] },
        { prev: 'M2-07' },
        { parts: [{ sprite: 'khata.t3' }] },
        { prev: 'M2-07' },
        { prev: 'M2-07' },
        { prev: 'M2-07' },
      ],
    },
    { sprite: 'mallows', x: 266, ground: 243, plot: { building: 'potter', from: 1 } },
    { sprite: 'tyn', x: 356, ground: 242, plot: { building: 'potter', from: 1 } },
    // An old oak in the near left corner framing the scene (a stiff tree: half the lean of the grass).
    { sprite: 'oak', x: 44, ground: 282, animate: { kind: 'sway', amp: 0.5, phase: 0.6 } },
    // Where the khutir runs out toward the suburb (M2-01 seam review): a willow by the water and the last stretch of
    // wattle fence (beyond the M-ART farm frames).
    { sprite: 'willow', x: 600, ground: 108, animate: { kind: 'sway', amp: 0.8, phase: 0.4 } },
    { sprite: 'tyn', x: 690, ground: 103 },
    { sprite: 'tyn', x: 730, ground: 103 },
    { sprite: 'gatepost', x: 752, ground: 104 },
    // The farm's second screen (M2-06), appended after the M-ART props so their light-pool seeds stay put: the wheat
    // field in the back row past the windmill, the apiary at the willow's foot, the garden in the front row.
    ...FARM_PLOTS,
  ],
  // Nearest the viewer (parallax 1.2, ~786 px wide on a 390 px phone): clumps along the bottom, sunflowers and
  // mallows at the corners of the first screen, the rest spread for the pan.
  foreground: [
    { sprite: 'plant.sunflowers', x: 30, ground: 376, amp: 1, phase: 0 },
    { sprite: 'plant.grass', x: 70, ground: 380, amp: 1, phase: 0.35 },
    { sprite: 'plant.grass', x: 190, ground: 382, amp: 1, phase: 0.7 },
    { sprite: 'plant.mallows', x: 330, ground: 377, amp: 1, phase: 0.2 },
    { sprite: 'plant.grass', x: 372, ground: 381, amp: 1, phase: 0.5 },
    { sprite: 'plant.grass', x: 470, ground: 380, amp: 1, phase: 0.9 },
    { sprite: 'plant.sunflowers', x: 560, ground: 377, amp: 1, phase: 0.45 },
    { sprite: 'plant.reeds', x: 660, ground: 381, amp: 1, phase: 0.1 },
    { sprite: 'plant.grass', x: 750, ground: 379, amp: 1, phase: 0.8 },
  ],
  walkers: [
    // A Cossack walking the road; a woman between the two yards; the farmer (селянин, бриль and свита) resting on
    // the grass in front of khata I's fence (not over the wattle: brown on brown); a girl with a вінок crossing the
    // front field (ART-15).
    { sprite: 'kozak.a', x0: 40, x1: 340, ground: 146, speed: 22, rest: 3, phase: 0 },
    { sprite: 'selianka.a', x0: 230, x1: 150, ground: 198, speed: 20, rest: 4, phase: 0.4 },
    // A woman tending the sunflowers at the near edge: she passes behind the foreground clumps (they thin out over her).
    { sprite: 'selianka.b', x0: 24, x1: 110, ground: 300, speed: 14, rest: 5, phase: 0 },
    { sprite: 'selianyn.a', x0: 160, x1: 160, ground: 128, speed: 0, rest: 0, phase: 0.2 },
    { sprite: 'divchyna.a', x0: 110, x1: 236, ground: 232, speed: 18, rest: 3, phase: 1.2 },
  ],
  // Puddles in the ruts of the path and the trodden yards (rain only).
  puddles: [
    // Along the path ruts (the wettest ground), then the two trodden yards.
    { x: 28, ground: 140, w: 8 },
    { x: 70, ground: 146, w: 14 },
    { x: 118, ground: 136, w: 7 },
    { x: 160, ground: 152, w: 10 },
    { x: 198, ground: 142, w: 12 },
    { x: 246, ground: 148, w: 8 },
    { x: 296, ground: 138, w: 11 },
    { x: 344, ground: 150, w: 9 },
    { x: 410, ground: 144, w: 12 },
    { x: 476, ground: 138, w: 8 },
    { x: 540, ground: 150, w: 10 },
    { x: 612, ground: 142, w: 13 },
    { x: 680, ground: 148, w: 8 },
    { x: 122, ground: 110, w: 8 },
    { x: 300, ground: 250, w: 10 },
  ],
  // Fireflies over the meadow and the front field at night, above the foreground clumps (x range of the M-ART farm,
  // so its night frames stay as signed off).
  fireflies: { x0: 0, x1: 720, top: 40, bottom: 300 },
  groundHaze: true,
};

/**
 * The suburb (передмістя, SPEC §3.0) — a stub until M2-08 builds the smithy, the tavern and the fair on it: the farm's
 * meadow, grass and road run on to the Sich.
 */
export const KHORTYTSIA_SUBURB: ZoneScene = {
  width: 384,
  rows: KHORTYTSIA_FARM.rows,
  fill: 'grass',
  // Where the Dnipro ends: its bank (sand lip on the 2:1 waterline, boulders, reeds) — row ends from the world's river.
  decals: [{ sprite: 'bank', x: 324, ground: 0 }],
  // The suburb's focal object until M2-08 builds on it: a roadside cross with a рушник by the road.
  props: [{ sprite: 'cross', x: 150, ground: 124 }],
  walkers: [],
  foreground: [
    { sprite: 'plant.grass', x: 40, ground: 380, amp: 1, phase: 0.3 },
    { sprite: 'plant.grass', x: 190, ground: 381, amp: 1, phase: 0.75 },
    { sprite: 'plant.reeds', x: 320, ground: 379, amp: 1, phase: 0.55 },
  ],
  // Puddles in the road's ruts.
  puddles: [
    { x: 40, ground: 144, w: 10 },
    { x: 120, ground: 138, w: 8 },
    { x: 205, ground: 150, w: 12 },
    { x: 290, ground: 142, w: 9 },
    { x: 350, ground: 148, w: 8 },
  ],
  fireflies: { x0: 0, x1: 384, top: 40, bottom: 300 },
  groundHaze: true,
};

/** Palisade sections along the rampart: 16-px tiles, heights mixed by a fixed pattern (never a comb). */
const PALISADE_PATTERN = ['h1', 'h0', 'h2', 'h1', 'h3', 'h0', 'h2', 'h1', 'h0', 'h3', 'h2', 'h1'] as const;
const palisadeLine = (
  x0: number,
  x1: number,
  ground: number,
  skip: readonly (readonly [number, number])[],
  plot: Plot,
): Prop[] => {
  const out: Prop[] = [];
  // The pattern index follows x (not the count), so a line that starts further in keeps every section's height.
  for (let x = x0, i = Math.floor(x0 / 16); x < x1; x += 16, i++) {
    if (skip.some(([a, b]) => x + 16 > a && x < b)) continue;
    const h = PALISADE_PATTERN[i % PALISADE_PATTERN.length] ?? 'h1';
    out.push({ sprite: `palisade.${h}`, x, ground, plot });
  }
  return out;
};

/**
 * Khortytsia, the Sich zone (plan ART-11, ART-BIBLE §6): seen from inside, back to front — the river, the rampart
 * with the palisade along its crest, two watchtowers and the gate with the корогва, the maidan, two курені. No women
 * on the Sich (historical): only Cossacks walk here.
 */
export const KHORTYTSIA_SICH: ZoneScene = {
  width: 768,
  rows: [
    { tile: 'meadow', top: 0, h: 32 },
    // Until the walls stand the rampart is steppe; until the first kurin the maidan is grass with a trodden patch by
    // the fire (art-director M1-19: an empty dirt maidan read as an abandoned building site).
    { tile: 'val', top: 32, h: 32, plot: { building: 'walls', from: 1 } }, // the rampart's inner slope
    { tile: 'maidan', top: 64, h: 224, plot: { building: 'kurins', from: 1 } }, // the maidan, down to ~75 %
    { tile: 'maidan-end', top: 288, h: 32, plot: { building: 'kurins', from: 1 } }, // a ragged edge into the grass
  ],
  fill: 'grass',
  // Worn paths from the gate to the two курінь doors (they lead the eye to the gate).
  decals: [
    // The zone's left edge (M2-01 seam review): the maidan's ragged grass edge, the road's mouth bending up toward the
    // gate and its ruts across the maidan, the rampart's sloped end.
    { sprite: 'maidan-edge', x: 0, ground: 64, plot: { building: 'kurins', from: 1 } },
    { sprite: 'road-mouth', x: 16, ground: 112 },
    {
      sprite: 'road-track',
      x: 10,
      ground: 40,
      plot: { building: 'kurins', from: 1, requires: [{ building: 'walls', from: 1 }] },
    },
    { sprite: 'val-end', x: 0, ground: 32, plot: { building: 'walls', from: 1 } },
    // The trails run from the gate to the kurin doors: they need both.
    {
      sprite: 'trail.l',
      x: 90,
      ground: 42,
      plot: { building: 'kurins', from: 1, requires: [{ building: 'walls', from: 1 }] },
    },
    {
      sprite: 'trail.r',
      x: 196,
      ground: 42,
      plot: { building: 'kurins', from: 2, requires: [{ building: 'walls', from: 1 }] },
    },
    // Before the first kurin: a trodden patch round the fire on the grass.
    { sprite: 'yard', x: 200, ground: 180, plot: { building: 'kurins', from: 0, until: 1 } },
  ],
  props: [
    // The palisade runs on behind the towers and the gate (no gaps where the footprints end).
    // No stakes behind the gate's passage: the view through it is open (the pylons hide the cut ends).
    // Plots (M1-19): the walls (Вали, частокіл і брама) raise the palisade and the gate; the watchtower (the land's own
    // Sich building) one tower at tier I and the second at II.
    // It starts behind the left watchtower (M2-01 seam review): that tower is the wall's corner, the rampart's sloped
    // end (`val-end`) runs out from under it, and the river and plateau stay open between the bank and the wall.
    ...palisadeLine(48, 768, 35, [[185, 211]], { building: 'walls', from: 1 }),
    { sprite: 'tower', x: 62, ground: 37, plot: { building: 'special', from: 1 } },
    { sprite: 'gate', x: 198, ground: 39, plot: { building: 'walls', from: 1 } },
    { sprite: 'tower', x: 340, ground: 37, plot: { building: 'special', from: 2 } },
    // The Pokrova church at the back of the maidan right at the rampart's foot (inside the walls), tall enough that its
    // centre cross clears the gate's roof against open sky; its belfry beside it with some air.
    { sprite: 'church', x: 280, ground: 63, plot: { building: 'church', from: 1 } },
    { sprite: 'belfry', x: 358, ground: 72, plot: { building: 'church', from: 2 } },
    // Курені: one at tier I, the second at II. The maidan (drill: the army's power) brings out the cannons.
    { sprite: 'kurin', x: 92, ground: 210, plot: { building: 'kurins', from: 1 } },
    { sprite: 'kurin', x: 300, ground: 268, plot: { building: 'kurins', from: 2 } },
    { sprite: 'cannon', x: 128, ground: 100, plot: { building: 'maidan', from: 1 } },
    { sprite: 'cannon', x: 276, ground: 112, plot: { building: 'maidan', from: 2 } },
    { sprite: 'logpile', x: 178, ground: 252 },
    // The campfire in the middle of the maidan (ART-16): the night's warm, local light; flames 6 frames @10 fps.
    { sprite: 'campfire', x: 196, ground: 176, animate: { kind: 'cycle', frames: 6, fps: 10 } },
    // Gathered for building, by the fire: the first Sich is a camp (art-director M1-19).
    { sprite: 'logpile', x: 226, ground: 186 },
  ],
  walkers: [
    { sprite: 'kozak.a', x0: 150, x1: 250, ground: 226, speed: 22, rest: 3, phase: 0 },
    { sprite: 'kozak.b', x0: 222, x1: 222, ground: 96, speed: 0, rest: 0, phase: 0.3 },
    // The young Cossack (bare head, оселедець) crossing the maidan (ART-15).
    { sprite: 'kozak.c', x0: 330, x1: 30, ground: 150, speed: 20, rest: 5, phase: 1.1 },
  ],
  // Puddles on the trodden maidan (rain only).
  puddles: [
    { x: 150, ground: 122, w: 14 },
    { x: 262, ground: 196, w: 12 },
    { x: 96, ground: 236, w: 10 },
    { x: 224, ground: 60, w: 8 },
  ],
  // Only grass at the Sich's trodden edge: no gardens inside the walls.
  foreground: [
    { sprite: 'plant.grass', x: 24, ground: 400, amp: 1, phase: 0.2 },
    { sprite: 'plant.grass', x: 250, ground: 402, amp: 1, phase: 0.6 },
    { sprite: 'plant.grass', x: 520, ground: 400, amp: 1, phase: 0.4 },
    { sprite: 'plant.grass', x: 700, ground: 401, amp: 1, phase: 0.9 },
  ],
  // From inside the Sich the river is hidden behind the rampart (and a water band would cover the tower bases): the
  // world's river ends at the Sich's edge.
  groundHaze: false,
};

/** Places zones edge to edge from x = 0: zone-local x → world x (foreground x by the foreground's parallax). */
export function composeWorld(
  base: Pick<WorldLayout, 'horizonRatio' | 'river' | 'farPlanes'>,
  zones: readonly { readonly id: ZoneId; readonly scene: ZoneScene }[],
): WorldLayout {
  let x0 = 0;
  const placed = zones.map(({ id, scene }) => {
    const at = { id, scene, x0, fg: Math.round(x0 * FOREGROUND_PARALLAX) };
    x0 += scene.width;
    return at;
  });
  const shift = <T extends { readonly x: number }>(items: readonly T[], dx: number): T[] =>
    items.map((item) => ({ ...item, x: item.x + dx }));
  return {
    ...base,
    width: x0,
    zones: placed.map(({ id, scene, x0: z }) => ({ id, x0: z, x1: z + scene.width, anchorX: z })),
    segments: placed.map(({ scene, x0: z }) => ({
      x0: z,
      x1: z + scene.width,
      rows: scene.rows,
      fill: scene.fill,
      groundHaze: scene.groundHaze,
    })),
    decals: placed.flatMap(({ scene, x0: z }) => shift(scene.decals, z)),
    props: placed.flatMap(({ scene, x0: z }) => shift(sceneProps(scene.props), z)),
    tierSprites: placed.flatMap(({ scene, x0: z }) => shift(scene.props.filter(isTierSprite), z)),
    walkers: placed.flatMap(({ scene, x0: z }) => scene.walkers.map((w) => ({ ...w, x0: w.x0 + z, x1: w.x1 + z }))),
    foreground: placed.flatMap(({ scene, fg }) => shift(scene.foreground, fg)),
    puddles: placed.flatMap(({ scene, x0: z }) => shift(scene.puddles, z)),
    fireflies: placed.flatMap(({ scene, x0: z }) =>
      scene.fireflies ? [{ ...scene.fireflies, x0: scene.fireflies.x0 + z, x1: scene.fireflies.x1 + z }] : [],
    ),
  };
}

/**
 * Buildings of the land not yet drawn by tier (plan M2-05) → the art task that brings their `TierSprite`. Until then
 * their plot keeps its M1 props (the Sich) or stays empty. The tier test wants every building of the land in exactly
 * one place — a tier sprite or this list — so each art task deletes its lines here.
 */
export const TIER_ART_PENDING: Readonly<Partial<Record<PlotBuilding, string>>> = {
  smithy: 'M2-08',
  tavern: 'M2-08',
  fair: 'M2-08',
  kurins: 'M2-09',
  maidan: 'M2-09',
  walls: 'M2-09',
  treasury: 'M2-09',
  church: 'M2-09',
  special: 'M2-09',
};

/**
 * Khortytsia as one continuous world (plan M2-01, Q2 ≈ 5 screens, 1920 px): the farm (the M-ART scene, x 0–768) → the suburb
 * stub (768–1152) → the Sich (1152–1920). The Dnipro runs behind the farm and the suburb and ends at the Sich's edge.
 */
export const KHORTYTSIA_WORLD: WorldLayout = composeWorld(
  {
    horizonRatio: 0.42,
    // The Dnipro between the far bank and the settlement: it covers the far meadow row but the near bank below it.
    river: { x0: 0, x1: KHORTYTSIA_FARM.width + KHORTYTSIA_SUBURB.width, rows: 26, taper: 50, rocks: [6, 14, 21] },
    // The far plane layer (parallax 0.2) is ~695 px wide on a 400 px view, the mid layer (0.5) ~1140 px. The M-ART
    // features come first (the farm's frames); the rest fill the pan to the Sich — no «Січ за Дніпром» silhouette now
    // that the Sich stands in the same world (plan Q3): bluffs and the rapids' low granite ridges instead.
    farPlanes: [
      // Left bank of the Dnipro: flat steppe with a chain of kurgans (Vasylkivsky's steppe).
      {
        kind: 'steppe',
        layer: 'far',
        depth: 0.8,
        seed: 11,
        // A continuous 8–11 px band; kurgans 4–6 px on top of it, 20–40 px wide.
        kurgans: [
          [64, 26, 5],
          [300, 30, 6],
          [430, 20, 4],
          [560, 28, 5],
          [665, 22, 4],
        ],
      },
      // Khortytsia's granite bluffs: a long plateau and a lower spur, trees on the crest; downstream the rapids'
      // ridges (пороги) as low granite humps and one more bluff.
      {
        kind: 'cliffs',
        layer: 'far',
        depth: 1.4,
        seed: 23,
        plateaus: [
          [150, 290, 36],
          [330, 400, 24],
          [590, 690, 30],
        ],
        rapids: [
          [452, 476, 7],
          [496, 512, 5],
        ],
      },
      // Groves on our side, between the far bank and the settlement.
      {
        kind: 'grove',
        layer: 'mid',
        depth: 2.3,
        seed: 37,
        groves: [
          [0, 70, 18],
          [210, 330, 22],
          [470, 560, 16],
          [650, 730, 20],
          [830, 940, 18],
          [1020, 1110, 21],
        ],
      },
    ],
  },
  [
    { id: 'farm', scene: KHORTYTSIA_FARM },
    { id: 'suburb', scene: KHORTYTSIA_SUBURB },
    { id: 'sich', scene: KHORTYTSIA_SICH },
  ],
);
