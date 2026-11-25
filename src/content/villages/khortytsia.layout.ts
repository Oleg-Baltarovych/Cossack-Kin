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
import type { VariantPlot } from '../variants.ts';
import type { FarmBuildingId } from './khortytsia.ts';
import type { AgentSpawn, PathGraph, RaidRoute, ZonePaths } from '../agents.ts';
import {
  FARM_PATHS,
  KHORTYTSIA_AGENTS,
  KHORTYTSIA_LINKS,
  KHORTYTSIA_RAID,
  SICH_PATHS,
  SUBURB_PATHS,
} from './khortytsia.paths.ts';

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
  /**
   * A cosmetic add-on (plan M2-10): shown only while the game's `plotVariant(seed, building)` is this option
   * (content PLOT_VARIANTS); without a game (the M-ART frames, `state=showcase`) never.
   */
  readonly variant?: number;
}

/** A ground band's plot: bands are never cosmetic variants (those are props). */
export type BandPlot = Omit<Plot, 'variant'>;

export type GroundTile =
  | 'meadow'
  | 'grass'
  | 'path'
  | 'earth'
  | 'val'
  | 'maidan'
  | 'maidan-end'
  | 'road'
  | 'trodden'
  | 'moat'
  | 'rampart'
  | 'ditch'
  | 'steppe'
  | 'steppe-edge';

export interface GroundRow {
  readonly tile: GroundTile;
  /** Rows below the horizon where this band starts; bands are whole tiles (multiples of 32) tall. */
  readonly top: number;
  readonly h: number;
  /** A band that belongs to a plot (the maidan, the rampart): `alt` (default: the layout's `fill`) while it is empty. */
  readonly plot?: BandPlot;
  readonly alt?: GroundTile;
  /** A plot band's later looks: `tile` from the plot building's visual tier `from` on (the rampart from walls III). */
  readonly upgrades?: readonly { readonly from: number; readonly tile: GroundTile }[];
}

export interface Prop {
  /** Atlas frame stem in `khortytsia` (`<stem>/idle/00`, companions `<entity>@shadow…`). */
  readonly sprite:
    | 'khata.t1'
    | 'khata.t3'
    | 'tyn'
    | 'tyn-end'
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
    | 'apiary-hut'
    | `mill.t${2 | 3 | 4 | 5 | 6}`
    | 'mill-sails.m'
    | 'mill-sails.l'
    | `potter.t${2 | 4 | 5 | 6}`
    | 'kiln'
    | 'jugs'
    | 'gilt.vane'
    | 'gilt.jug'
    | 'well'
    | `smithy.t${TierNo}`
    | 'forge'
    | `tavern.t${TierNo}`
    | 'broom-sign'
    | 'hitching-rail'
    | 'barrels'
    | `fair.t${TierNo}`
    | 'stall.a'
    | 'stall.b'
    | 'stall.c'
    | 'shop'
    | 'brama.t2'
    | 'brama.t4'
    | 'banner'
    | `wall-tower.t${2 | 3 | 4}`
    | `watchtower.t${2 | 3 | 4}`
    | `pokrova.t${2 | 3 | 4}`
    | `treasury.t${1 | 2 | 3 | 4}`
    | 'kurin-b'
    | 'kurin-c'
    | 'koshovyi'
    | 'flagpole'
    | 'kazan'
    | 'flowers.a'
    | 'flowers.b'
    | 'kennel'
    | 'bench'
    | 'laundry'
    | 'woodpile'
    | 'stork-nest'
    | 'pumpkins'
    | 'plough'
    | 'pennant.a'
    | 'pennant.b'
    | 'kovyla.a'
    | 'kovyla.b'
    | 'sorrel.a'
    | 'sorrel.b'
    | 'kurgan';
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
  /** Half-width of the window light pool at night, > 0 (default: a share of the frame width, render WINDOW_POOL). */
  readonly poolRx?: number;
  /** No window pool although the sprite has an `@emissive` frame (a tier whose shared night layer is dark). */
  readonly noPool?: true;
  /** A chimney: smoke rises from its mouth (plan M2-11, render fx/smoke.ts). */
  readonly smoke?: SmokeVent;
  readonly plot?: Plot;
}

/**
 * A chimney's mouth (plan M2-11): its px column is `dx` from the prop's pivot, its top row `lift` rows above the pivot
 * (`horizon + ground − lift`); puffs rise from the row above. Read off the generator's frame — a unit test holds every
 * vent on an opaque chimney top with open air above it (tests/unit/tools/gen-life.test.ts).
 */
export interface SmokeVent {
  readonly dx: number;
  readonly lift: number;
}

/** Tier numbers of the farm generators' variants (`field.t1` … `field.t6`). */
type TierNo = 1 | 2 | 3 | 4 | 5 | 6;

export type Animate =
  | {
      readonly kind: 'cycle';
      readonly frames: number;
      readonly fps: number | 'wind';
      /** The sprite has a second bank of `frames` for a storm (render `cycleFrame`): a pennant streams longer. */
      readonly gale?: true;
    }
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
  readonly poolRx?: number;
  readonly noPool?: true;
  readonly smoke?: SmokeVent;
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
  readonly sprite:
    | 'yard'
    | 'trail.l'
    | 'trail.r'
    | 'val-end.val'
    | 'val-end.moat'
    | 'val-end.rampart'
    | 'ditch-end'
    | 'maidan-edge'
    | 'road-mouth'
    | 'road-track'
    | 'bank'
    | 'square'
    | 'moat-bridge';
  /** Centre of the decal, world x / rows below the horizon. */
  readonly x: number;
  readonly ground: number;
  readonly plot?: Plot;
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

/**
 * A boat on the Dnipro (plan M2-11): drawn over the water with its ripples (render boats.ts). `ground` = the pivot
 * (the bottom edge of the waterline row) below the horizon, inside the river's rows; `drift` = how far it swings each
 * way on the stream (px; 0 = moored).
 */
export interface Boat {
  readonly sprite: 'boat.a' | 'boat.b';
  readonly x: number;
  readonly ground: number;
  readonly drift: number;
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
  /** The zone's part of the path graph (plan M2-16; khortytsia.paths.ts), zone-local px. */
  readonly paths: ZonePaths;
  /** Plant clumps on the foreground layer, back to front. */
  readonly foreground: readonly ForegroundPlant[];
  /** Puddles shown in the rain (ART-17). */
  readonly puddles: readonly Puddle[];
  /** Absent = none. */
  readonly fireflies?: FireflyArea;
  /** Boats on the zone's stretch of the river; absent = none. */
  readonly boats?: readonly Boat[];
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
 * first), so the water runs out to the far bank instead of ending on a vertical cut. `bank` (M2-29 A2) makes that
 * waterline ragged and stepped instead of a clean diagonal.
 */
export interface River {
  readonly x0: number;
  readonly x1: number;
  readonly rows: number;
  readonly taper: number;
  /**
   * Per row (row 0 first): how many px before `x1` the row ends — non-decreasing, from 0 to `taper`. Held values are
   * the bank's vertical earth cuts, jumps its runs (the `bank` decal draws both). Absent = the clean 2:1 taper.
   */
  readonly bank?: readonly number[];
  /** Rows where a boulder stands on the waterline at the river's end (the `bank` decal draws it, water foams at it). */
  readonly rocks?: readonly number[];
}

/** The whole settlement as one continuous world (plan M2-01, §0 «Неперервний світ»): world x everywhere. */
export interface WorldLayout {
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
  /** The walkable graph (plan M2-16): every zone's nodes in world x plus the links between zones. */
  readonly paths: PathGraph;
  /** The scene's people on the graph (render/agents/, cosmetic). */
  readonly agents: readonly AgentSpawn[];
  /** The raid squads' way out of the Sich and back (M3-14); `null` = a land without one. */
  readonly raid: RaidRoute | null;
  readonly foreground: readonly ForegroundPlant[];
  readonly puddles: readonly Puddle[];
  readonly fireflies: readonly FireflyArea[];
  readonly boats: readonly Boat[];
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
      { parts: [{ sprite: 'apiary.t4' }, ...hives(-18, -8, 2, 12), bees(-13), bees(7)] },
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

/** Sails hung on the mill's hub `lift` px above the trestle foot, turning with the wind. */
const sails = (sprite: 'windmill-sails' | 'mill-sails.m' | 'mill-sails.l', lift: number): TierPart => ({
  sprite,
  lift,
  shadow: false,
  animate: { kind: 'cycle', frames: 8, fps: 'wind' },
});
/** Tier VI gold: a baked glint (frames 5–7 of 8) at 6 fps. */
const GILT_SHIMMER: Animate = { kind: 'cycle', frames: 8, fps: 6 };
/** The mill's yard (ART-BIBLE §6 «тин і квіти»): mallows at the trestle foot from II, a wattle past the sacks from IV. */
const MILL_MALLOWS: TierPart = { sprite: 'mallows', dx: -24, dground: 2 };
const MILL_TYN: TierPart = { sprite: 'tyn', dx: 46, dground: 2 };
/**
 * The potter's wares on a bench in the yard, left of the house (II, then from IV: tier III stays the M-ART khata as
 * judged, `state=showcase`); the kiln further left (from V).
 */
const POTTER_JUGS: TierPart = { sprite: 'jugs', dx: -46, dground: 5 };
const POTTER_KILN: TierPart = { sprite: 'kiln', dx: -68, dground: -2 };
/** The potter's stovepipe (II) and the khata's whitewashed chimney (III–V; VI's is taller). */
const POTTER_FLUE: SmokeVent = { dx: 1, lift: 53 };

/**
 * A cosmetic add-on of a plot (plan M2-10, SPEC §2.6): stands while `building` is built and the game seed picked
 * `variant` for it (core `plotVariant`, content PLOT_VARIANTS). Placed clear of every tier of every building
 * (tests/unit/tools/gen-variants.test.ts); appended after a zone's other props so their seeds stay put.
 */
const addOn = (building: VariantPlot, variant: number, sprite: Prop['sprite'], x: number, ground: number): Prop => ({
  sprite,
  x,
  ground,
  plot: { building, from: 1, variant },
});

/**
 * The dry steppe at the bottom of the world (M2-29 A5, Q13 item 5): every zone's near grass runs down to `top`, gives
 * way to the steppe over the ragged `steppe-edge` row, and the steppe fills the rest of the view. It lies under the
 * half bottom sheet at the normal zoom (the sheet's top is ≈ row 300) and shows when the sheet is collapsed, in the
 * closer level panned down, and in shots without UI.
 */
export const STEPPE_BAND = {
  top: 384,
  /** The deepest ground row a steppe prop stands on: inside the view on the shortest reference phone (360×800). */
  propsMax: 480,
} as const;

/** How far the steppe plants lean in the wind (share of the full sway): the feather grass all the way, sorrel stiffer. */
export const STEPPE_SWAY = { kovyla: 1, sorrel: 0.6 } as const;

/** A steppe plant: feather grass or sorrel, zone-local x, ground row. */
type SteppePlant = readonly ['kovyla.a' | 'kovyla.b' | 'sorrel.a' | 'sorrel.b', number, number];

/** Steppe plants as swaying props; the phase follows x so neighbours never move in step. */
function steppePlants(plants: readonly SteppePlant[]): Prop[] {
  return plants.map(([sprite, x, ground]) => ({
    sprite,
    x,
    ground,
    animate: {
      kind: 'sway',
      amp: STEPPE_SWAY[sprite.startsWith('kovyla') ? 'kovyla' : 'sorrel'],
      phase: (x % 97) / 97,
    },
  }));
}

/**
 * A feather-grass drift (art-director A5: ковила reads as a silvery sheet, not lone tufts): `n` overlapping tufts
 * from x across about 6 px each, the ground wandering ±5 rows, `a`/`b` alternating.
 */
export const STEPPE_DRIFT = { stepPx: 6, wander: 5 } as const;
function steppeDrift(x: number, ground: number, n: number): SteppePlant[] {
  return Array.from({ length: n }, (_, i): SteppePlant => {
    const wobble = ((i * 7 + x) % (2 * STEPPE_DRIFT.wander + 1)) - STEPPE_DRIFT.wander;
    return [i % 2 === 0 ? 'kovyla.b' : 'kovyla.a', x + i * STEPPE_DRIFT.stepPx + ((i * 5) % 3), ground + wobble];
  });
}

/** A zone's rows from `from` (where its own bands end) to the steppe: near grass, then the seam row. */
function toSteppe(from: number): GroundRow[] {
  const grass: GroundRow[] = from < STEPPE_BAND.top ? [{ tile: 'grass', top: from, h: STEPPE_BAND.top - from }] : [];
  return [...grass, { tile: 'steppe-edge', top: STEPPE_BAND.top, h: GROUND_TILE.h }];
}

/**
 * The farm's plot variants (art-director M2-10): the stork's pole by the mill's yard fence (one nest on the farm, B4),
 * the kennel in the potter's yard, pumpkins and flowers at a fence or a bed end; one laundry line on the farm (the
 * potter's), so a screen never shows two.
 */
const FARM_VARIANTS: readonly Prop[] = [
  addOn('windmill', 0, 'woodpile', 258, 122),
  addOn('windmill', 1, 'stork-nest', 371, 96), // clear of the V–VI sails' 42-px reach (M2-29 B2), not touching (B4)
  addOn('windmill', 2, 'pumpkins', 258, 122),
  addOn('potter', 0, 'laundry', 406, 238),
  addOn('potter', 1, 'kennel', 318, 254),
  addOn('potter', 2, 'pumpkins', 196, 238), // not a 2nd stork nest: the mill's shares a screen (M2-29 B4)
  addOn('field', 0, 'pumpkins', 470, 116),
  addOn('field', 1, 'flowers.a', 440, 114),
  addOn('field', 1, 'flowers.b', 500, 116),
  addOn('field', 2, 'bench', 520, 118),
  addOn('apiary', 0, 'flowers.b', 728, 112),
  addOn('apiary', 1, 'bench', 728, 124),
  addOn('apiary', 2, 'kennel', 728, 124),
  addOn('garden', 0, 'pumpkins', 584, 262),
  addOn('garden', 1, 'flowers.a', 586, 244),
  addOn('garden', 2, 'woodpile', 600, 258),
];

export const KHORTYTSIA_FARM: ZoneScene = {
  width: 768,
  // A plank boat moored at the near bank below the willow on the farm's second screen (beyond the M-ART frames).
  boats: [{ sprite: 'boat.a', x: 560, ground: 25, drift: 0 }],
  rows: [
    { tile: 'meadow', top: 0, h: 32 }, // far meadow, aerial perspective
    { tile: 'grass', top: 32, h: 96 }, // back row: khata tier I and its yard fence
    { tile: 'path', top: 128, h: 32 }, // the path with ruts
    // Front row: khata tier III, down to the near corner's fence end (M2-29; the same grass tiles as the fill below).
    { tile: 'grass', top: 160, h: 192 },
    ...toSteppe(352),
  ],
  fill: 'steppe',
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
        { parts: [{ sprite: 'windmill' }, sails('windmill-sails', 53)] },
        { parts: [{ sprite: 'mill.t2' }, sails('windmill-sails', 53), MILL_MALLOWS] },
        { parts: [{ sprite: 'mill.t3' }, sails('mill-sails.m', 54), MILL_MALLOWS] },
        { parts: [{ sprite: 'mill.t4' }, sails('mill-sails.m', 54), MILL_MALLOWS, MILL_TYN] },
        { parts: [{ sprite: 'mill.t5' }, sails('mill-sails.l', 55), MILL_MALLOWS, MILL_TYN] },
        {
          parts: [
            { sprite: 'mill.t6' },
            // On the back-slope pole (generator `millPoleTop('t6')`), under the sails like the pole and the banner: the
            // sails turn in front of the roof, so a blade passing the vane hides it rather than slides under it.
            { sprite: 'gilt.vane', dx: -9, lift: 82, shadow: false, animate: GILT_SHIMMER },
            sails('mill-sails.l', 55),
            MILL_MALLOWS,
            MILL_TYN,
          ],
        },
      ],
    },
    // Front row, below the path: the potter's khata (Хата гончаря), nearer and to the right, its own fence and mallows.
    // Khata I and III are the M-ART frames; II, IV–VI grow the house by the trade (M2-07): wares on a bench (II, IV+),
    // a workshop shed (IV), a drying rack and the kiln (V), gilt jug (VI).
    {
      building: 'potter',
      x: 292,
      ground: 240,
      tiers: [
        { parts: [{ sprite: 'khata.t1' }] },
        { parts: [{ sprite: 'potter.t2', smoke: POTTER_FLUE }, POTTER_JUGS] },
        { parts: [{ sprite: 'khata.t3', smoke: POTTER_FLUE }] },
        { parts: [{ sprite: 'potter.t4', smoke: POTTER_FLUE }, POTTER_JUGS] },
        { parts: [POTTER_KILN, { sprite: 'potter.t5', smoke: POTTER_FLUE }, POTTER_JUGS] },
        {
          parts: [
            POTTER_KILN,
            { sprite: 'potter.t6', smoke: { dx: 1, lift: 56 } },
            POTTER_JUGS,
            { sprite: 'gilt.jug', dx: 42, dground: 4, shadow: false, animate: GILT_SHIMMER },
          ],
        },
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
    ...FARM_VARIANTS,
    // The near left corner at the closer zoom level (M2-29 framing tail: plain grass there): the end of a wattle fence
    // with marigolds at its foot, low enough to stay fully under the half sheet at the normal level on 360/390/412.
    { sprite: 'tyn-end', x: 64, ground: 346 },
    { sprite: 'flowers.a', x: 92, ground: 348 },
    // The steppe band (M2-29 A5): drifts of feather grass, rust sorrel between them.
    ...steppePlants([
      ...steppeDrift(110, 432, 8),
      ...steppeDrift(410, 454, 10),
      ...steppeDrift(640, 428, 6),
      ['sorrel.a', 300, 442],
      ['sorrel.b', 560, 468],
      ['sorrel.a', 740, 436],
    ]),
  ],
  // Nearest the viewer (parallax 1.2, ~786 px wide on a 390 px phone): clumps along the bottom, sunflowers and
  // mallows at the corners of the first screen, the rest spread for the pan. No near sunflowers while the garden's
  // own (5-px heads) are in view (art-director M2-06: they read ×2 the garden's) — the second clump is the suburb's.
  foreground: [
    { sprite: 'plant.sunflowers', x: 30, ground: 376, amp: 1, phase: 0 },
    { sprite: 'plant.grass', x: 70, ground: 380, amp: 1, phase: 0.35 },
    { sprite: 'plant.grass', x: 190, ground: 382, amp: 1, phase: 0.7 },
    { sprite: 'plant.mallows', x: 330, ground: 377, amp: 1, phase: 0.2 },
    { sprite: 'plant.grass', x: 372, ground: 381, amp: 1, phase: 0.5 },
    { sprite: 'plant.grass', x: 470, ground: 380, amp: 1, phase: 0.9 },
    { sprite: 'plant.grass', x: 560, ground: 377, amp: 1, phase: 0.45 },
    { sprite: 'plant.reeds', x: 660, ground: 381, amp: 1, phase: 0.1 },
    { sprite: 'plant.grass', x: 750, ground: 379, amp: 1, phase: 0.8 },
  ],
  paths: FARM_PATHS,
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
 * The forge fire on the smithy's hearth (4 frames @8 fps, `@emissive`, the zone's night light pool): `dx`/`lift` from
 * the generator's `smithyForge` (a unit test holds them equal), sorted just in front of the smithy.
 */
const forge = (dx: number): TierPart => ({
  sprite: 'forge',
  dx,
  dground: 1,
  lift: 10,
  shadow: false,
  animate: { kind: 'cycle', frames: 4, fps: 8 },
});
/** The smithy by tier (generator `smithy`): the shed, then the hut, the lean-to, the shoeing frame, the gilt shoe. */
const SMITHY: TierSprite = {
  building: 'smithy',
  x: 318,
  ground: 214,
  tiers: [
    { parts: [{ sprite: 'smithy.t1' }, forge(-6)] },
    { parts: [{ sprite: 'smithy.t2', smoke: { dx: -10, lift: 37 } }, forge(-9)] },
    { parts: [{ sprite: 'smithy.t3', smoke: { dx: -16, lift: 45 } }, forge(-15)] },
    { parts: [{ sprite: 'smithy.t4', smoke: { dx: -16, lift: 45 } }, forge(-15)] },
    { parts: [{ sprite: 'smithy.t5', smoke: { dx: -18, lift: 49 } }, forge(-17)] },
    { parts: [{ sprite: 'smithy.t6', smoke: { dx: -18, lift: 50 } }, forge(-17)] },
  ],
};

/** The tavern's віхоть on its pole just right of the door (`tavernDoor` in the generator), in front of the wall. */
const broomSign = (door: number): TierPart => ({ sprite: 'broom-sign', dx: door + 8, dground: 2 });
// Tier III: its door + 8 crossed the right-hand window, so it stands 4 px further right (art: off the window).
const HITCHING_RAIL = (dx: number): TierPart => ({ sprite: 'hitching-rail', dx, dground: 8 });
/**
 * The tavern by tier (generator `tavern`): the house grows longer, gets a porch, a storeroom and a cart shed; its
 * windows light a pool as wide as the wall (`poolRx` ≈ 0.45 × the wall, not the 132-px frame).
 */
const TAVERN: TierSprite = {
  building: 'tavern',
  x: 96,
  ground: 112,
  tiers: [
    { parts: [{ sprite: 'tavern.t1', poolRx: 20 }, broomSign(0)] },
    { parts: [{ sprite: 'tavern.t2', poolRx: 23 }, broomSign(1), HITCHING_RAIL(46)] },
    { parts: [{ sprite: 'tavern.t3', smoke: { dx: 4, lift: 46 }, poolRx: 27 }, broomSign(6), HITCHING_RAIL(50)] },
    {
      parts: [
        { sprite: 'barrels', dx: -58, dground: 3 },
        { sprite: 'tavern.t4', smoke: { dx: 5, lift: 47 }, poolRx: 31 },
        broomSign(3),
        HITCHING_RAIL(54),
      ],
    },
    {
      parts: [
        { sprite: 'barrels', dx: -60, dground: 3 },
        { sprite: 'tavern.t5', smoke: { dx: 6, lift: 48 }, poolRx: 32 },
        broomSign(3),
        HITCHING_RAIL(50),
      ],
    },
    {
      parts: [
        { sprite: 'barrels', dx: -62, dground: 3 },
        { sprite: 'tavern.t6', smoke: { dx: 7, lift: 52 }, poolRx: 34 },
        { sprite: 'broom-sign', dx: -41, dground: 2 },
        // The gilt jug on a stake left of the porch (not in front of the door); the pole off the painted eave band.
        { sprite: 'gilt.jug', dx: -24, dground: 3, shadow: false, animate: GILT_SHIMMER },
        HITCHING_RAIL(52),
      ],
    },
  ],
};

/** A pennant in the wind (4 frames at the wind's rate, plan M2-11; 4 longer ones in a storm, M2-29 B4), hung at a pole's hoist (`lift` above `dground`). */
const pennant = (variant: 'a' | 'b', dx: number, lift: number, dground = 0): TierPart => ({
  sprite: `pennant.${variant}`,
  dx,
  dground,
  lift,
  shadow: false,
  animate: { kind: 'cycle', frames: 4, fps: 'wind', gale: true },
});
const STALL_DGROUND = -8;
/** A stall stands behind the goods row (sorted behind the mats). */
const stall = (variant: 'a' | 'b' | 'c', dx: number): TierPart => ({
  sprite: `stall.${variant}`,
  dx,
  dground: STALL_DGROUND,
});
/** Stall `a` with the green pennant on its pole (generator `STALL_PENNANT`). */
const STALL_PENNANT = { dx: -12, lift: 38 } as const;
const stallA = (dx: number): TierPart[] => [
  stall('a', dx),
  pennant('b', dx + STALL_PENNANT.dx, STALL_PENNANT.lift, STALL_DGROUND),
];
/** The fair's crimson pennant on its pole (V–VI, generator `fairPennant`). */
export const FAIR_PENNANT = { t5: { dx: -48, lift: 29 }, t6: { dx: -54, lift: 35 } } as const;
/** The shop at the back left of the square (from IV); the gilt vane of VI on its ridge (generator `SHOP_RIDGE`). */
const SHOP_DGROUND = -16;
const shop = (dx: number): TierPart => ({ sprite: 'shop', dx, dground: SHOP_DGROUND });
const SHOP_VANE = { dx: 2, lift: 38 } as const;
/**
 * The fair by tier (generator `fair`: the goods on mats, sacks, crates, the pennant pole): one striped stall at I, a
 * second at II, barrels at III, the shop at IV, a third stall at V, the gilt vane on the shop at VI. From V the
 * barrels stand by the shop, well inside the square's rim (the right side is the third stall's).
 */
const FAIR: TierSprite = {
  building: 'fair',
  x: 150,
  ground: 236,
  tiers: [
    { parts: [...stallA(0), { sprite: 'fair.t1' }] },
    { parts: [...stallA(-16), stall('b', 24), { sprite: 'fair.t2' }] },
    { parts: [...stallA(-16), stall('b', 24), { sprite: 'fair.t3' }, { sprite: 'barrels', dx: 50, dground: -2 }] },
    {
      parts: [
        shop(-58),
        ...stallA(-14),
        stall('b', 24),
        { sprite: 'fair.t4' },
        { sprite: 'barrels', dx: 56, dground: -2 },
      ],
    },
    {
      parts: [
        shop(-60),
        ...stallA(-18),
        stall('b', 20),
        stall('c', 58),
        { sprite: 'fair.t5' },
        pennant('a', FAIR_PENNANT.t5.dx, FAIR_PENNANT.t5.lift),
        { sprite: 'barrels', dx: -44, dground: -12 },
      ],
    },
    {
      parts: [
        shop(-64),
        {
          sprite: 'gilt.vane',
          dx: -64 + SHOP_VANE.dx,
          dground: SHOP_DGROUND,
          lift: SHOP_VANE.lift,
          shadow: false,
          animate: GILT_SHIMMER,
        },
        ...stallA(-22),
        stall('b', 16),
        stall('c', 54),
        { sprite: 'fair.t6' },
        pennant('a', FAIR_PENNANT.t6.dx, FAIR_PENNANT.t6.lift),
        { sprite: 'barrels', dx: -46, dground: -12 },
      ],
    },
  ],
};

/**
 * The suburb (передмістя, SPEC §3.0, ART-BIBLE §6; plan M2-08): the trade street between the khutir and the Sich. The
 * farm's meadow and grass run on; the path becomes the suburb road (hoofprints, straw: same ruts, clean seams) and the
 * front row is grass trodden bald by feet and hooves. Back row: the шинок with its віхоть sign and hitching rail, the
 * crane well, the roadside cross toward the Sich. Front row: the fair on its trodden square (stalls, barrels, later a
 * shop) and the smithy nearest the Sich, its forge the zone's night light.
 */
/** The suburb's plot variants: before the tavern, at the fair square's edge, in the smithy's yard. */
const SUBURB_VARIANTS: readonly Prop[] = [
  addOn('tavern', 0, 'bench', 90, 126),
  addOn('tavern', 1, 'woodpile', 84, 126),
  addOn('fair', 0, 'pumpkins', 168, 250),
  addOn('fair', 1, 'cart', 236, 258),
  addOn('fair', 2, 'bench', 120, 248),
  addOn('smithy', 0, 'woodpile', 340, 232),
  addOn('smithy', 1, 'kennel', 345, 230),
  // A plough left for a new share, not a second sheaf cart (seed 1 drew the fair's and this one side by side; M2-29 B3).
  addOn('smithy', 2, 'plough', 300, 240),
];

export const KHORTYTSIA_SUBURB: ZoneScene = {
  // A fisherman's dugout out on the river behind the tavern, swinging on the stream.
  boats: [{ sprite: 'boat.b', x: 132, ground: 15, drift: 6 }],
  width: 384,
  rows: [
    { tile: 'meadow', top: 0, h: 32 },
    { tile: 'grass', top: 32, h: 96 },
    { tile: 'road', top: 128, h: 32 },
    // Worn where people and horses go (the road, the fair, the smithy), plain grass again further down.
    { tile: 'trodden', top: 160, h: 96 },
    { tile: 'grass', top: 256, h: 32 },
    ...toSteppe(288),
  ],
  fill: 'steppe',
  decals: [
    // Where the Dnipro ends: its bank (sand lip on the 2:1 waterline, boulders, reeds) — row ends from the world's river.
    { sprite: 'bank', x: 324, ground: 0 },
    // The fair's trodden square under the stalls (from the first stall).
    { sprite: 'square', x: 150, ground: 226, plot: { building: 'fair', from: 1 } },
  ],
  props: [
    // The crane well between the tavern and the road's bend; the roadside cross (M2-01) now stands toward the Sich.
    { sprite: 'well', x: 214, ground: 108 },
    { sprite: 'cross', x: 268, ground: 124 },
    TAVERN,
    FAIR,
    SMITHY,
    ...SUBURB_VARIANTS,
    // The steppe band (M2-29 A5): one kurgan, the centre of the world's bottom edge, feather grass on its flanks.
    { sprite: 'kurgan', x: 214, ground: 462 },
    ...steppePlants([
      ...steppeDrift(20, 440, 6),
      ...steppeDrift(300, 474, 7),
      ['sorrel.a', 100, 424],
      ['sorrel.b', 330, 432],
    ]),
  ],
  paths: SUBURB_PATHS,
  foreground: [
    { sprite: 'plant.grass', x: 40, ground: 380, amp: 1, phase: 0.3 },
    { sprite: 'plant.sunflowers', x: 190, ground: 381, amp: 1, phase: 0.75 },
    { sprite: 'plant.reeds', x: 320, ground: 379, amp: 1, phase: 0.55 },
  ],
  // Puddles in the road's ruts and on the fair's square.
  puddles: [
    { x: 40, ground: 144, w: 10 },
    { x: 120, ground: 138, w: 8 },
    { x: 205, ground: 150, w: 12 },
    { x: 290, ground: 142, w: 9 },
    { x: 350, ground: 148, w: 8 },
    { x: 118, ground: 232, w: 12 },
    { x: 196, ground: 222, w: 9 },
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
 * Sich buildings by tier (plan M2-09, ART-BIBLE §6; Sich I–IV at levels 1/10/25/50): I a palisaded camp — II the moat,
 * the first wall tower, the корогва in the wind — III the rampart's fighting walk, a ring of towers, tin domes — IV
 * gilt. The palisade is a shared add-on of the walls (plain props with a plot), never part of a tier look.
 */
/**
 * The wind-blown корогва (4 frames at the wind's rate, like the sails) hung off a pole top: `dx`/`lift` put its pivot
 * (the cloth's top-left) at the hoist of the generator under it — gate `BANNER_HOIST`, `FLAGPOLE_HOIST` (unit-tested).
 */
const banner = (dx: number, lift: number, dground = 0): TierPart => ({
  sprite: 'banner',
  dx,
  dground,
  lift,
  shadow: false,
  animate: { kind: 'cycle', frames: 4, fps: 'wind' },
});
/** Gate pivot → its pole's hoist (gate generator: pivot (38, 111), hoist (68, 3)). */
export const GATE_BANNER = { dx: 30, lift: 108 } as const;
/** Flagpole pivot → its hoist (flagpole generator: pivot (5, 63), hoist (6, 4)). */
export const FLAGPOLE_BANNER = { dx: 1, lift: 59 } as const;
/** Сторожова вежа (the land's special building) on the wall's left corner: the M1 tower, then gallery, beacon, gilt. */
const WATCHTOWER: TierSprite = {
  building: 'special',
  x: 62,
  ground: 37,
  tiers: [
    { parts: [{ sprite: 'tower' }] },
    { parts: [{ sprite: 'watchtower.t2' }] },
    { parts: [{ sprite: 'watchtower.t3' }] },
    { parts: [{ sprite: 'watchtower.t4' }] },
  ],
};
/** Wall towers along the palisade, `dx` from the gate (world x 340 from II; 540 and 720 from III). */
const wallTowers = (tier: 2 | 3 | 4, dxs: readonly number[]): TierPart[] =>
  dxs.map((dx) => ({ sprite: `wall-tower.t${String(tier) as '2' | '3' | '4'}`, dx, dground: -2 }));
const GATE_FLAG = banner(GATE_BANNER.dx, GATE_BANNER.lift);
/**
 * Вали, частокіл і брама: the M1 gate (its painted корогва) at I; from II the moat behind the palisade (ground band) and
 * a plank bridge through the passage, the корогва in the wind and the first wall tower; from III the rampart (ground
 * band) and three towers; IV the gilt gate with the Pokrova icon.
 */
const WALLS: TierSprite = {
  building: 'walls',
  x: 198,
  ground: 39,
  tiers: [
    { parts: [{ sprite: 'gate' }] },
    { parts: [...wallTowers(2, [142]), { sprite: 'brama.t2' }, GATE_FLAG] },
    { parts: [...wallTowers(3, [142, 342, 522]), { sprite: 'brama.t2' }, GATE_FLAG] },
    { parts: [...wallTowers(4, [142, 342, 522]), { sprite: 'brama.t4' }, GATE_FLAG] },
  ],
};
/**
 * The Pokrova church at the back of the maidan right at the rampart's foot (inside the walls), tall enough that its
 * centre cross clears the gate's roof against open sky: the M1 church at I; from II the gallery (опасання) and the
 * belfry beside it (6 px further out than in M1: clear of the gallery), III tin domes, IV the gilt main dome.
 */
const BELFRY: TierPart = { sprite: 'belfry', dx: 84, dground: 9 };
const CHURCH: TierSprite = {
  building: 'church',
  x: 280,
  ground: 63,
  tiers: [
    { parts: [{ sprite: 'church' }] },
    { parts: [{ sprite: 'pokrova.t2' }, BELFRY] },
    { parts: [{ sprite: 'pokrova.t3' }, BELFRY] },
    { parts: [{ sprite: 'pokrova.t4' }, BELFRY] },
  ],
};
/** The 2nd–4th kurins; window pools ≈ 0.45 × the wall, not the frame. */
const KURIN_2: TierPart = { sprite: 'kurin', dx: 208, dground: 58 };
const KURIN_3: TierPart = { sprite: 'kurin-b', dx: 410, dground: 26, poolRx: 42 };
const KURIN_4: TierPart = { sprite: 'kurin-c', dx: 586, dground: 66, poolRx: 41, smoke: { dx: 8, lift: 58 } };
/** Курені round the maidan: one more per tier (the 3rd whitewashed, the 4th with a porch), the koshovyi's house at IV. */
const KURINS: TierSprite = {
  building: 'kurins',
  x: 92,
  ground: 210,
  tiers: [
    { parts: [{ sprite: 'kurin' }] },
    { parts: [{ sprite: 'kurin' }, KURIN_2] },
    { parts: [{ sprite: 'kurin' }, KURIN_2, KURIN_3] },
    {
      parts: [
        { sprite: 'koshovyi', dx: 500, dground: -76, poolRx: 34, smoke: { dx: 7, lift: 60 } },
        { sprite: 'kurin' },
        KURIN_2,
        KURIN_3,
        KURIN_4,
      ],
    },
  ],
};
/**
 * The maidan (drill: the army's power): the cannons (I–II), the flagpole with the корогва where the host gathers (III),
 * a second fire with the куліш cauldron by the far kurins (IV; the kazan stands beside the fire — over it the night
 * flames would hide the pot).
 */
const CANNONS: readonly TierPart[] = [{ sprite: 'cannon' }, { sprite: 'cannon', dx: 148, dground: 12 }];
const FLAGPOLE: readonly TierPart[] = [
  { sprite: 'flagpole', dx: 108, dground: 36 },
  banner(108 + FLAGPOLE_BANNER.dx, FLAGPOLE_BANNER.lift, 36),
];
const MAIDAN: TierSprite = {
  building: 'maidan',
  x: 128,
  ground: 100,
  tiers: [
    { parts: [{ sprite: 'cannon' }] },
    { parts: CANNONS },
    { parts: [...CANNONS, ...FLAGPOLE] },
    {
      parts: [
        ...CANNONS,
        ...FLAGPOLE,
        { sprite: 'campfire', dx: 458, dground: 100, animate: { kind: 'cycle', frames: 6, fps: 10 } },
        { sprite: 'kazan', dx: 476, dground: 101 },
      ],
    },
  ],
};
/**
 * Скарбниця: a cellar under a turf mound on the maidan's right, clear of the walk at row 150 (its mound top ≥ 8 px
 * below it, art-director M2-09); its lantern (III+) lights a small pool, I–II stay dark
 * (`noPool`: the generator's shared emissive layer is empty there).
 */
const TREASURY: TierSprite = {
  building: 'treasury',
  x: 344,
  ground: 188,
  tiers: [
    { parts: [{ sprite: 'treasury.t1', noPool: true }] },
    { parts: [{ sprite: 'treasury.t2', noPool: true }] },
    { parts: [{ sprite: 'treasury.t3', poolRx: 9 }] },
    { parts: [{ sprite: 'treasury.t4', poolRx: 9 }] },
  ],
};

/**
 * Khortytsia, the Sich zone (plan ART-11, ART-BIBLE §6): seen from inside, back to front — the river, the rampart
 * with the palisade along its crest, two watchtowers and the gate with the корогва, the maidan, two курені. No women
 * on the Sich (historical): only Cossacks walk here.
 */
export const KHORTYTSIA_SICH: ZoneScene = {
  width: 768,
  rows: [
    // Behind the palisade: the moat from walls II (it shows where the wall opens: the left end and the gate).
    { tile: 'ditch', top: 0, h: 32, plot: { building: 'walls', from: 2 }, alt: 'meadow' },
    // Until the walls stand the rampart is steppe; until the first kurin the maidan is grass with a trodden patch by
    // the fire (art-director M1-19: an empty dirt maidan read as an abandoned building site).
    // The rampart's inner slope; from walls II the moat along its toe, from III the fighting walk and stake revetment.
    {
      tile: 'val',
      top: 32,
      h: 32,
      plot: { building: 'walls', from: 1 },
      alt: 'grass',
      upgrades: [
        { from: 2, tile: 'moat' },
        { from: 3, tile: 'rampart' },
      ],
    },
    { tile: 'maidan', top: 64, h: 224, plot: { building: 'kurins', from: 1 }, alt: 'grass' }, // the maidan, ~75 %
    { tile: 'maidan-end', top: 288, h: 32, plot: { building: 'kurins', from: 1 }, alt: 'grass' }, // ragged into grass
    ...toSteppe(320),
  ],
  fill: 'steppe',
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
    // The rampart's end by walls tier (M2-29 A2): the moat and the rampart's walk start inside it on ragged edges.
    { sprite: 'val-end.val', x: 0, ground: 32, plot: { building: 'walls', from: 1, until: 2 } },
    { sprite: 'val-end.moat', x: 0, ground: 32, plot: { building: 'walls', from: 2, until: 3 } },
    { sprite: 'val-end.rampart', x: 0, ground: 32, plot: { building: 'walls', from: 3 } },
    // The outer moat's ragged head at the zone edge (walls II+), not a vertical cut at x 0.
    { sprite: 'ditch-end', x: 0, ground: 0, plot: { building: 'walls', from: 2 } },
    // The plank bridge over the moat where the gate path crosses it (walls II+), over the road track.
    { sprite: 'moat-bridge', x: 198, ground: 57, plot: { building: 'walls', from: 2 } },
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
    WATCHTOWER,
    WALLS,
    CHURCH,
    KURINS,
    MAIDAN,
    TREASURY,
    { sprite: 'logpile', x: 178, ground: 252 },
    // The campfire in the middle of the maidan (ART-16): the night's warm, local light; flames 6 frames @10 fps.
    { sprite: 'campfire', x: 196, ground: 176, animate: { kind: 'cycle', frames: 6, fps: 10 } },
    // Gathered for building, by the fire: the first Sich is a camp (art-director M1-19).
    { sprite: 'logpile', x: 226, ground: 186 },
    // The steppe band (M2-29 A5).
    ...steppePlants([
      ...steppeDrift(80, 436, 9),
      ...steppeDrift(390, 458, 11),
      ...steppeDrift(630, 428, 7),
      ['sorrel.a', 250, 450],
      ['sorrel.b', 540, 426],
      ['sorrel.a', 730, 466],
    ]),
  ],
  paths: SICH_PATHS,
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
  base: Pick<WorldLayout, 'river' | 'farPlanes' | 'agents' | 'raid'> & {
    /** Path edges between zones (node ids are world-wide). */
    readonly links: PathGraph['edges'];
  },
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
  const { links, ...rest } = base;
  return {
    ...rest,
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
    paths: {
      nodes: placed.flatMap(({ id, scene, x0: z }) => scene.paths.nodes.map((n) => ({ ...n, x: n.x + z, zone: id }))),
      edges: [...placed.flatMap(({ scene }) => scene.paths.edges), ...links],
    },
    foreground: placed.flatMap(({ scene, fg }) => shift(scene.foreground, fg)),
    puddles: placed.flatMap(({ scene, x0: z }) => shift(scene.puddles, z)),
    boats: placed.flatMap(({ scene, x0: z }) => shift(scene.boats ?? [], z)),
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
export const TIER_ART_PENDING: Readonly<Partial<Record<PlotBuilding, string>>> = {};

/**
 * Khortytsia as one continuous world (plan M2-01, Q2 ≈ 5 screens, 1920 px): the farm (the M-ART scene, x 0–768) → the suburb
 * stub (768–1152) → the Sich (1152–1920). The Dnipro runs behind the farm and the suburb and ends at the Sich's edge.
 */
export const KHORTYTSIA_WORLD: WorldLayout = composeWorld(
  {
    // The Dnipro between the far bank and the settlement: it covers the far meadow row but the near bank below it.
    // Its end (M2-29 A2, art-director M2-15 tail 4): a ragged bank — cuts held 1–3 rows, runs of 1–9 px, the boulders
    // on held cuts.
    river: {
      x0: 0,
      x1: KHORTYTSIA_FARM.width + KHORTYTSIA_SUBURB.width,
      rows: 26,
      taper: 50,
      bank: [0, 0, 3, 4, 4, 9, 9, 10, 12, 13, 13, 19, 19, 20, 21, 21, 26, 27, 28, 33, 33, 34, 36, 41, 44, 50],
      rocks: [6, 14, 21],
    },
    links: KHORTYTSIA_LINKS,
    agents: KHORTYTSIA_AGENTS,
    raid: KHORTYTSIA_RAID,
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
