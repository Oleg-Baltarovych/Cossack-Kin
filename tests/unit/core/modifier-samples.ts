// Random states for the modifier tests (plan M4-03, M4-05): farm levels spread around the «all farm ≥ 25» Sich unlock,
// every Sich level random (locked ones too, as a crafted save), random relics and a random moment for the wind — drawn
// from the seeded core RNG. No culture and no heroes: these are the states whose field values the golden file
// `tests/fixtures/golden/modifier-fields-m4-03.json` pinned before culture and hero sources existed (M4-05).
import { RELIC_IDS } from '../../../src/content/relics.ts';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import { createRng, next, type Rng } from '../../../src/core/rng.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';

export const T0 = 1_763_400_000_000;
export const DAY = 24 * 3600 * 1000;
export const STATES = 50;

/** Integers 0…max drawn from the seeded core RNG. */
function draws(seed: number): (max: number) => number {
  let rng: Rng = createRng(seed * 7919);
  return (max) => {
    const [u, r] = next(rng);
    rng = r;
    return Math.floor(u * (max + 1));
  };
}

export interface Sample {
  readonly state: GameState;
  readonly now: number;
}

export function randomState(seed: number): Sample {
  const int = draws(seed);
  const s = createInitialState({ seed, now: T0 });
  const floor = int(40);
  const levels = { ...s.village.levels };
  for (const id of FARM_BUILDING_IDS) levels[id] = floor + int(60);
  const sichLevels = { ...s.village.sichLevels };
  for (const id of SICH_BUILDING_IDS) sichLevels[id] = int(50);
  const relics = RELIC_IDS.filter((_, i) => (seed >> i) % 2 === 1);
  return { state: { ...s, relics, village: { ...s.village, levels, sichLevels } }, now: T0 + int(30 * DAY) };
}

export const SAMPLES: readonly Sample[] = Array.from({ length: STATES }, (_, i) => randomState(i + 1));
