// Khortytsia farm scene layout (plan §0, ART-05): positions only. M2 grows this into the full village file
// (buildings by tier, plots, path graph). Units are logical px; x is in world px (0..WORLD_WIDTH = 720),
// y offsets are measured down from the horizon row.

/**
 * Ground tile kinds of the `khortytsia` atlas (`ground.<tile>/idle/00`, 64×32). `grass` has seeded variants
 * (`grass`, `grass-b`, `grass-c`) that the ground layer picks per tile.
 */
export type GroundTile = 'meadow' | 'grass' | 'path' | 'earth';

export interface GroundRow {
  readonly tile: GroundTile;
  /** Rows below the horizon where this band starts; bands are whole tiles (multiples of 32) tall. */
  readonly top: number;
  readonly h: number;
}

export interface Prop {
  /** Atlas frame stem in `khortytsia` (`<stem>/idle/00`, companions `<entity>@shadow…`). */
  readonly sprite: 'khata.t1' | 'khata.t3' | 'tyn' | 'mallows';
  /** Pivot (bottom-centre of the ground row the prop stands on), world x. */
  readonly x: number;
  /** Pivot y below the horizon; also the Y-sort key. */
  readonly ground: number;
}

/** Flat ground decal (no shadow, not Y-sorted): drawn over the tiles, under every shadow and prop. */
export interface Decal {
  readonly sprite: 'yard';
  /** Centre of the decal, world x / rows below the horizon. */
  readonly x: number;
  readonly ground: number;
}

/** A person on a scripted route (ART-06 spike; villager FSM and path graph come in M2). */
export interface Walker {
  /** Atlas frame stem `<entity>.<variant>` (`<stem>/walk/NN`, `<stem>/idle/NN`, `<entity>.<variant>@shadow/…`). */
  readonly sprite: 'kozak.a' | 'kozak.b' | 'selianka.a' | 'selianka.b';
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

export interface SceneLayout {
  /** Horizon as a share of the view height (ART-BIBLE §2: 40–45 %; the bottom sheet covers the lowest ~25 %). */
  readonly horizonRatio: number;
  /** Depth bands from the horizon down; below the last one the `fill` tile runs to the bottom of the view. */
  readonly rows: readonly GroundRow[];
  readonly fill: GroundTile;
  readonly decals: readonly Decal[];
  readonly props: readonly Prop[];
  readonly walkers: readonly Walker[];
}

export const KHORTYTSIA_FARM: SceneLayout = {
  horizonRatio: 0.42,
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
    { sprite: 'yard', x: 296, ground: 244 },
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
    // Front row, below the path: khata III, nearer and to the right, its own fence and mallows.
    { sprite: 'khata.t3', x: 292, ground: 240 },
    { sprite: 'mallows', x: 266, ground: 243 },
    { sprite: 'tyn', x: 356, ground: 242 },
  ],
  walkers: [
    // A Cossack walking the road; a woman between the two yards; a second Cossack resting by khata I.
    { sprite: 'kozak.a', x0: 40, x1: 340, ground: 146, speed: 22, rest: 3, phase: 0 },
    { sprite: 'selianka.a', x0: 230, x1: 150, ground: 198, speed: 20, rest: 4, phase: 0.4 },
    { sprite: 'kozak.b', x0: 158, x1: 158, ground: 108, speed: 0, rest: 0, phase: 0.2 },
  ],
};
