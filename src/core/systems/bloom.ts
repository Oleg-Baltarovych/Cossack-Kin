// «Розквіт» of a land (SPEC §3.6; plan Q6 — M1 counts conditions 1–2 and the land goal, the button and the move are
// M5): every farm building ≥ BLOOM.farmLevel, every Sich building that is open in this land ≥ BLOOM.sichLevel, and the
// land's own goal (Khortytsia: storms weathered with the windmill ≥ 25, counted by `advance`).
import { BLOOM } from '../../content/economy.ts';
import { SICH_BUILDINGS } from '../../content/sich.ts';
import { sichUnlocked, villageOf } from '../modifiers.ts';
import type { GameState } from '../state.ts';

export interface BloomStatus {
  readonly farm: boolean;
  readonly sich: boolean;
  readonly goal: boolean;
  readonly reached: boolean;
}

export function bloomStatus(state: GameState): BloomStatus {
  const village = villageOf(state);
  const farm = village.buildings.every((b) => state.village.levels[b.id] >= BLOOM.farmLevel);
  // «Відкриті» = open in this land at all (the cannon foundry of land 5 is not); the church opens at farm 25.
  const sich = SICH_BUILDINGS.filter((b) => b.unlock.kind !== 'land' || village.number >= b.unlock.land).every(
    (b) => sichUnlocked(b, state) && state.village.sichLevels[b.id] >= BLOOM.sichLevel,
  );
  const goal = state.village.mechanic.stormsSurvived >= village.bloomGoal.storms;
  return { farm, sich, goal, reached: farm && sich && goal };
}
