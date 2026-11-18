import { describe, expect, it } from 'vitest';
import { BLOOM, FARM } from '../../../src/content/economy.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { bloomStatus } from '../../../src/core/systems/bloom.ts';

const T0 = 1_763_400_000_000;

function state(farm: number, sich: number, storms: number): GameState {
  const s = createInitialState({ seed: 1, now: T0 });
  const levels = Object.fromEntries(
    Object.keys(s.village.levels).map((k) => [k, farm]),
  ) as GameState['village']['levels'];
  const sichLevels = Object.fromEntries(
    Object.keys(s.village.sichLevels).map((k) => [k, sich]),
  ) as GameState['village']['sichLevels'];
  return { ...s, village: { ...s.village, levels, sichLevels, mechanic: { kind: 'wind', stormsSurvived: storms } } };
}

describe('bloomStatus (SPEC §3.6, plan Q6)', () => {
  it('all three conditions: farm ≥ 50, every open Sich building ≥ 25, the land goal (3 storms)', () => {
    expect(bloomStatus(state(BLOOM.farmLevel, BLOOM.sichLevel, KHORTYTSIA.bloomGoal.storms))).toEqual({
      farm: true,
      sich: true,
      goal: true,
      reached: true,
    });
  });

  it('each condition alone is not enough', () => {
    expect(bloomStatus(state(BLOOM.farmLevel - 1, 50, 9)).reached).toBe(false);
    expect(bloomStatus(state(FARM.levelMax, BLOOM.sichLevel - 1, 9)).reached).toBe(false);
    expect(bloomStatus(state(FARM.levelMax, 50, KHORTYTSIA.bloomGoal.storms - 1)).reached).toBe(false);
  });

  it('a Sich building still locked (the cannon foundry of land 5) does not block bloom', () => {
    const s = state(BLOOM.farmLevel, BLOOM.sichLevel, 3);
    const noCannons = { ...s, village: { ...s.village, sichLevels: { ...s.village.sichLevels, cannonry: 0 } } };
    expect(bloomStatus(noCannons).sich).toBe(true);
  });
});
