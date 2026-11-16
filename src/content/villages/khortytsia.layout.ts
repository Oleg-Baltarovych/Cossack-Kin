// Khortytsia farm scene layout (plan §0, ART-05): positions only. M2 grows this into the full village file
// (buildings by tier, plots, path graph). Units are logical px; x is in world px (0..WORLD_WIDTH = 720),
// y offsets are measured down from the horizon row.

/** Ground tile variants of the `khortytsia` atlas (`ground.<tile>/idle/00`, 64×32). */
export type GroundTile = 'meadow' | 'grass' | 'path' | 'earth';

export interface GroundRow {
  readonly tile: GroundTile;
  /** Rows below the horizon where this band starts; bands are whole tiles (multiples of 32) tall. */
  readonly top: number;
  readonly h: number;
}

export interface Prop {
  /** Atlas frame stem in `khortytsia` (`<stem>/idle/00`, companions `<entity>@shadow…`). */
  readonly sprite: 'khata.t1' | 'khata.t3' | 'tyn';
  /** Pivot (bottom-centre of the ground row the prop stands on), world x. */
  readonly x: number;
  /** Pivot y below the horizon; also the Y-sort key. */
  readonly ground: number;
}

export interface SceneLayout {
  /** Horizon as a share of the view height (ART-BIBLE §2: 40–45 %; the bottom sheet covers the lowest ~25 %). */
  readonly horizonRatio: number;
  /** Depth bands from the horizon down; below the last one the `fill` tile runs to the bottom of the view. */
  readonly rows: readonly GroundRow[];
  readonly fill: GroundTile;
  readonly props: readonly Prop[];
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
  props: [
    // Back row, along the upper edge of the path: khata I with its yard fence running right.
    { sprite: 'tyn', x: 44, ground: 124 },
    { sprite: 'khata.t1', x: 112, ground: 122 },
    { sprite: 'tyn', x: 176, ground: 125 },
    { sprite: 'tyn', x: 216, ground: 125 },
    // Front row, below the path: khata III, nearer and to the right.
    { sprite: 'khata.t3', x: 292, ground: 206 },
  ],
};
