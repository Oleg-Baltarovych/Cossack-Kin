// The relic and pysanky chances are clamped to 1 after the multipliers (plan M3-03, ADR 012) — checked on artificial
// content whose chances overflow: one rumour (kurgan, ×2 relic chance) on h8, whose own chances are 0.9.
import { describe, expect, it, vi } from 'vitest';
import { RELIC_IDS } from '../../../src/content/relics.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { previewRaid, raidBoard, rollRaid } from '../../../src/core/systems/raids.ts';
import { createRng } from '../../../src/core/rng.ts';

vi.mock('../../../src/content/raids.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/content/raids.ts')>();
  return {
    ...real,
    RAID_TIERS: real.RAID_TIERS.map((t) => (t.id === 'h8' ? { ...t, relicChance: 0.9, pysankyChance: 0.9 } : t)),
    BOARD: { ...real.BOARD, rumors: real.BOARD.rumors.filter((r) => r.id === 'kurgan'), rumorTiers: ['h8'] },
  };
});

const T0 = 1_763_400_000_000;

function state(relics: GameState['relics'], rngSeed = 1): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    rng: createRng(rngSeed),
    army: { infantry: 900 },
    raids: { slots: [{ kind: 'idle' }, { kind: 'idle' }, { kind: 'idle' }], rumorDay: -1, pity: 0 },
    relics,
  };
}

describe('chance clamp (artificial content > 1)', () => {
  it('the board puts the kurgan rumour on h8', () => {
    expect(raidBoard(5, 0).find((o) => o.tier === 'h8')?.rumor).toBe('kurgan');
  });

  it('relic chance 0.9 × 2 → 1; with all relics found, pysanky 0.9 + 1.8 → 1', () => {
    expect(previewRaid(state([]), 'h8').relicChance).toBe(1);
    expect(previewRaid(state([]), 'h8').pysankyChance).toBeCloseTo(0.9, 12);
    expect(previewRaid(state(RELIC_IDS), 'h8').relicChance).toBe(0);
    expect(previewRaid(state(RELIC_IDS), 'h8').pysankyChance).toBe(1);
  });

  it('a clamped chance of 1 always comes true', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(rollRaid(state([], seed), 'h8', T0).roll.loot.relic).not.toBeNull();
      expect(rollRaid(state(RELIC_IDS, seed), 'h8', T0).roll.loot.pysanky).toBeGreaterThan(0);
    }
  });
});
