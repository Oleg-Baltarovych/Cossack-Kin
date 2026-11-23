// What the game shows in the scene (plan M1-19, SPEC §6.5): per building its visual tier (which plot props stand),
// per plot its cosmetic variant (M2-10: which add-ons stand) and the wind. Render only reads it — render/bridge.ts
// fills it from store events; without a game (render alone, the M-ART look) every plot stands, no add-on does, and a
// breeze blows.
import { isVariantPlot } from '../content/variants.ts';
import type { Plot, PlotBuilding } from '../content/villages/khortytsia.layout.ts';
import type { PlotVariants, VisualTiers } from '../core/selectors.ts';
import { WIND } from './atmosphere/config.ts';
import type { PlotMark } from './fx/outline.ts';

export interface SceneState {
  /** Visual tier per building; `null` = no game attached: show everything. */
  readonly tiers: VisualTiers | null;
  /** Cosmetic add-on set per plot (core `plotVariants`); `null` = none (no game, the M-ART showcase). */
  readonly variants: PlotVariants | null;
  /** Wind strength 0..1 for sails and sway. */
  readonly wind: number;
  /** Cossacks the army has on the scene (core `populationView`, M2-19); absent = no game: every Cossack walks. */
  readonly cossacks?: number;
  /** Villagers the household has on the scene (core `populationView`, M2-29 D); absent = no game: every villager. */
  readonly villagers?: number;
  /**
   * Seconds between food carts leaving the farm (core `populationView`, M2-20); `null` = no food, no carts; absent =
   * no game: the busiest traffic.
   */
  readonly cartPeriodS?: number | null;
  /**
   * Where the visitors' timetable comes from (M2-21): the game's seed and its clock (core `visitorAt` reads both);
   * `null` or absent = nobody visits (no game, the showcase). The same object for the bridge's whole life.
   */
  readonly visitors?: VisitorFeed | null;
  /**
   * Buildings popping in right now (plan M2-12, Q5): their props are drawn at this scale about their pivots, in whole
   * px. Set by render/fx/build.ts for one frame at a time, never by the bridge.
   */
  readonly pop?: Readonly<Partial<Record<PlotBuilding, number>>>;
  /**
   * Buildings outlined this frame (M2-29, render/fx/outline.ts): the selected row's building and a new tier's night
   * rim. Set per frame by App and render/fx/build.ts, never by the bridge.
   */
  readonly marks?: readonly PlotMark[];
}

/** The game's seed and a reader of its time (ms, `GameState.time.lastSeen`): read-only, for the visitors. */
export interface VisitorFeed {
  readonly seed: number;
  readonly gameMs: () => number;
}

export const DEFAULT_SCENE: SceneState = { tiers: null, variants: null, wind: WIND.strength };

/** Whether a prop or decal with `plot` stands now. A variant add-on needs its plot's variant (none without a game). */
export function plotShown(plot: Plot | undefined, tiers: VisualTiers | null, variants: PlotVariants | null): boolean {
  if (plot?.variant !== undefined) {
    const v = variants && isVariantPlot(plot.building) ? variants[plot.building] : undefined;
    if (v !== plot.variant) return false;
  }
  if (!plot || !tiers) return true;
  const t = tiers[plot.building];
  if (t < plot.from || (plot.until !== undefined && t >= plot.until)) return false;
  return (plot.requires ?? []).every((r) => tiers[r.building] >= r.from);
}
