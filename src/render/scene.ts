// What the game shows in the scene (plan M1-19, SPEC §6.5): per building its visual tier (which plot props stand) and
// the wind. Render only reads it — render/bridge.ts fills it from store events; without a game (render alone, the
// M-ART look) every prop stands and a breeze blows.
import type { Plot } from '../content/villages/khortytsia.layout.ts';
import type { VisualTiers } from '../core/selectors.ts';
import { WIND } from './atmosphere/config.ts';

export interface SceneState {
  /** Visual tier per building; `null` = no game attached: show everything. */
  readonly tiers: VisualTiers | null;
  /** Wind strength 0..1 for sails and sway. */
  readonly wind: number;
}

export const DEFAULT_SCENE: SceneState = { tiers: null, wind: WIND.strength };

/** Whether a prop or decal with `plot` stands now. */
export function plotShown(plot: Plot | undefined, tiers: VisualTiers | null): boolean {
  if (!plot || !tiers) return true;
  const t = tiers[plot.building];
  if (t < plot.from || (plot.until !== undefined && t >= plot.until)) return false;
  return (plot.requires ?? []).every((r) => tiers[r.building] >= r.from);
}
