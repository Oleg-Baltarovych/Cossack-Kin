// Khortytsia farm scene layout (plan §0, ART-05): positions only. M2 grows this into the full village file
// (buildings by tier, plots, path graph). Units are logical px; x is in world px (0..WORLD_WIDTH = 720),
// y offsets are measured down from the horizon row.

/**
 * Ground tile kinds of the `khortytsia` atlas (`ground.<tile>/idle/00`, 64×32). `grass` has seeded variants
 * (`grass`, `grass-b`, `grass-c`) that the ground layer picks per tile.
 */
export type GroundTile = 'meadow' | 'grass' | 'path' | 'earth' | 'val' | 'maidan' | 'maidan-end';

export interface GroundRow {
  readonly tile: GroundTile;
  /** Rows below the horizon where this band starts; bands are whole tiles (multiples of 32) tall. */
  readonly top: number;
  readonly h: number;
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
    | 'windmill-sails';
  /** Pivot (bottom-centre of the ground row the prop stands on), world x. */
  readonly x: number;
  /** Pivot y below the horizon; also the Y-sort key. */
  readonly ground: number;
  /** Draw the pivot this many px above `ground` (sails hung on a hub); sorts just in front of its ground row. */
  readonly lift?: number;
  /** `false`: the sprite has no `@shadow` frame (default true). */
  readonly shadow?: boolean;
  /** Cycle `<sprite>/idle/NN` frames: count and rate (`wind` = from the wind strength). */
  readonly animate?: { readonly frames: number; readonly fps: number | 'wind' };
}

/** Flat ground decal (no shadow, not Y-sorted): drawn over the tiles, under every shadow and prop. */
export interface Decal {
  readonly sprite: 'yard' | 'trail.l' | 'trail.r';
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

export interface SceneLayout {
  /** Horizon as a share of the view height (ART-BIBLE §2: 40–45 %; the bottom sheet covers the lowest ~25 %). */
  readonly horizonRatio: number;
  /** Depth bands from the horizon down; below the last one the `fill` tile runs to the bottom of the view. */
  readonly rows: readonly GroundRow[];
  readonly fill: GroundTile;
  readonly decals: readonly Decal[];
  readonly props: readonly Prop[];
  readonly walkers: readonly Walker[];
  /** Back to front. */
  readonly farPlanes: readonly FarPlane[];
  /** The river under the horizon (ART-09): rows of water from the horizon down; 0 = no water. */
  readonly waterRows: number;
  /**
   * Haze band over the ground under the horizon (ART-08), default on. Off where the near scene stands right at the
   * horizon (the Sich's rampart is near, not far meadow).
   */
  readonly groundHaze?: boolean;
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
    // The post mill by the road past the yard fence, its sails turning with the wind (hub 53 px above the trestle foot).
    // Low enough that the top sail (93 px above the foot) stays clear of the 26-row river band.
    { sprite: 'windmill', x: 312, ground: 124 },
    { sprite: 'windmill-sails', x: 312, ground: 124, lift: 53, shadow: false, animate: { frames: 8, fps: 'wind' } },
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
  // The Dnipro between the far bank and the farm: it covers the far meadow row but the near bank below it.
  waterRows: 26,
  // Far plane layer (parallax 0.2) is ~460 px wide on a 390 px phone, the mid layer (0.5) ~555 px.
  farPlanes: [
    // Left bank of the Dnipro: flat steppe with a chain of kurgans (Vasylkivsky's steppe).
    {
      kind: 'steppe',
      layer: 'far',
      depth: 0.8,
      seed: 11,
      // A continuous 8–11 px band; kurgans 4–6 px on top of it, 20–40 px wide.
      kurgans: [
        [64, 16, 5],
        [300, 20, 6],
        [430, 12, 4],
      ],
    },
    // Khortytsia's granite bluffs: a long plateau and a lower spur, trees on the crest.
    {
      kind: 'cliffs',
      layer: 'far',
      depth: 1.4,
      seed: 23,
      plateaus: [
        [150, 290, 36],
        [330, 400, 24],
      ],
    },
    // Groves on our side, between the far bank and the farm.
    {
      kind: 'grove',
      layer: 'mid',
      depth: 2.3,
      seed: 37,
      groves: [
        [0, 70, 18],
        [210, 330, 22],
        [470, 560, 16],
      ],
    },
  ],
};

/** Palisade sections along the rampart: 16-px tiles, heights mixed by a fixed pattern (never a comb). */
const PALISADE_PATTERN = ['h1', 'h0', 'h2', 'h1', 'h3', 'h0', 'h2', 'h1', 'h0', 'h3', 'h2', 'h1'] as const;
const palisadeLine = (x0: number, x1: number, ground: number, skip: readonly (readonly [number, number])[]): Prop[] => {
  const out: Prop[] = [];
  for (let x = x0, i = 0; x < x1; x += 16, i++) {
    if (skip.some(([a, b]) => x + 16 > a && x < b)) continue;
    const h = PALISADE_PATTERN[i % PALISADE_PATTERN.length] ?? 'h1';
    out.push({ sprite: `palisade.${h}`, x, ground });
  }
  return out;
};

/**
 * Khortytsia, the Sich zone (plan ART-11, ART-BIBLE §6): seen from inside, back to front — the river, the rampart
 * with the palisade along its crest, two watchtowers and the gate with the корогва, the maidan, two курені. No women
 * on the Sich (historical): only Cossacks walk here.
 */
export const KHORTYTSIA_SICH: SceneLayout = {
  horizonRatio: KHORTYTSIA_FARM.horizonRatio,
  rows: [
    { tile: 'meadow', top: 0, h: 32 },
    { tile: 'val', top: 32, h: 32 }, // the rampart's inner slope
    { tile: 'maidan', top: 64, h: 224 }, // the maidan, down to ~75 % of the screen
    { tile: 'maidan-end', top: 288, h: 32 }, // a ragged edge into the grass
  ],
  fill: 'grass',
  // Worn paths from the gate to the two курінь doors (they lead the eye to the gate).
  decals: [
    { sprite: 'trail.l', x: 90, ground: 42 },
    { sprite: 'trail.r', x: 196, ground: 42 },
  ],
  props: [
    // The palisade runs on behind the towers and the gate (no gaps where the footprints end).
    ...palisadeLine(0, 720, 35, []),
    { sprite: 'tower', x: 62, ground: 37 },
    { sprite: 'gate', x: 198, ground: 39 },
    { sprite: 'tower', x: 340, ground: 37 },
    // The Pokrova church at the back of the maidan right at the rampart's foot (inside the walls), tall enough that its
    // centre cross clears the gate's roof against open sky; its belfry beside it with some air.
    { sprite: 'church', x: 280, ground: 63 },
    { sprite: 'belfry', x: 358, ground: 72 },
    { sprite: 'kurin', x: 92, ground: 210 },
    { sprite: 'kurin', x: 300, ground: 268 },
    { sprite: 'cannon', x: 128, ground: 100 },
    { sprite: 'cannon', x: 276, ground: 112 },
    { sprite: 'logpile', x: 178, ground: 252 },
    { sprite: 'logpile', x: 36, ground: 280 },
  ],
  walkers: [
    { sprite: 'kozak.a', x0: 150, x1: 250, ground: 226, speed: 22, rest: 3, phase: 0 },
    { sprite: 'kozak.b', x0: 222, x1: 222, ground: 96, speed: 0, rest: 0, phase: 0.3 },
    { sprite: 'kozak.a', x0: 330, x1: 30, ground: 150, speed: 20, rest: 5, phase: 1.1 },
  ],
  farPlanes: KHORTYTSIA_FARM.farPlanes,
  // From inside the Sich the river is hidden behind the rampart (and a water band would cover the tower bases).
  waterRows: 0,
  groundHaze: false,
};

/** Scene layout per zone of Khortytsia (the suburb comes with M2). */
export const KHORTYTSIA_ZONES = { farm: KHORTYTSIA_FARM, suburb: KHORTYTSIA_FARM, sich: KHORTYTSIA_SICH } as const;
