// Plot ground bands by tier (M2-09): the rampart's val tile turns into the fighting walk from walls III, the band is
// the steppe while the walls are not built, and render alone (no game) shows the top look.
import { describe, expect, it } from 'vitest';
import type { VisualTiers } from '../../../src/core/selectors.ts';
import { visualTiers } from '../../../src/core/selectors.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { plotTileTexture } from '../../../src/render/layers/Ground.ts';

const band = {
  plot: { building: 'walls', from: 1 },
  on: 'val',
  off: 'meadow',
  upgrades: [{ from: 3, texture: 'rampart' }],
} as const;
const withWalls = (n: number): VisualTiers => ({ ...visualTiers(createInitialState({ seed: 1, now: 0 })), walls: n });

describe('plotTileTexture', () => {
  it('is the alt tile while the plot is empty, the band tile, then its upgrades by tier', () => {
    expect([0, 1, 2, 3, 4].map((n) => plotTileTexture(band, withWalls(n)))).toEqual([
      'meadow',
      'val',
      'val',
      'rampart',
      'rampart',
    ]);
  });

  it('shows the top look without a game', () => {
    expect(plotTileTexture(band, null)).toBe('rampart');
  });
});
