// Cosmetic plot variants (SPEC §2.6, plan M2-10): each plot below shows one of `options` small add-on sets (a kennel,
// a bench, pumpkins by the fence …) picked by core `plotVariant` from the game seed alone — no state, no save field,
// the same seed always the same village. The add-ons and their positions are the layout's (`Plot.variant`).
import type { SichBuildingId } from './sich.ts';
import type { FarmBuildingId } from './villages/khortytsia.ts';

export interface PlotVariantSlot {
  /**
   * Frozen hash index of the plot: never reuse or renumber — changing it reshuffles every shipped village. `options`
   * may grow (core `pickStable` moves a game only onto a new option) but never shrink.
   */
  readonly key: number;
  /** How many add-on sets the layout draws for this plot (variant 0 … options − 1). */
  readonly options: number;
}

/** Plots with cosmetic variants; a plot that is not here always looks the same. */
export const PLOT_VARIANTS = {
  windmill: { key: 0, options: 3 },
  potter: { key: 1, options: 3 },
  field: { key: 2, options: 3 },
  apiary: { key: 3, options: 3 },
  garden: { key: 4, options: 3 },
  tavern: { key: 5, options: 2 },
  fair: { key: 6, options: 3 },
  smithy: { key: 7, options: 3 },
} as const satisfies Partial<Record<FarmBuildingId | SichBuildingId, PlotVariantSlot>>;

export type VariantPlot = keyof typeof PLOT_VARIANTS;

/** Whether `building` has cosmetic variants. */
export const isVariantPlot = (building: string): building is VariantPlot => Object.hasOwn(PLOT_VARIANTS, building);

/**
 * Frozen hash domain of the variants (keeps them independent of the seed's other schedules, the wind windows):
 * changing it reshuffles every shipped village.
 */
export const VARIANT_SALT = 0x5a17;
