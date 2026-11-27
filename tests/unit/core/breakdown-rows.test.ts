// A breakdown row the player would read as 0 is dropped (plan M4-07, code review); the field still counts it. No
// content share is that small (percent-step.test.ts), so a relic share below `PERCENT_STEP` is mocked in.
import { describe, expect, it, vi } from 'vitest';
import { PERCENT_STEP } from '../../../src/content/effects.ts';
import { modifierBreakdown } from '../../../src/core/culture-selectors.ts';
import { collectModifiers, modifierSources } from '../../../src/core/modifiers.ts';
import { createInitialState } from '../../../src/core/state.ts';

vi.mock('../../../src/content/relics.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/content/relics.ts')>();
  return {
    ...real,
    RELIC_DEFS: real.RELIC_DEFS.map((r) =>
      r.id === 'pernach' ? { ...r, effect: { ...r.effect, share: (PERCENT_STEP / 100) * 0.4 } } : r,
    ),
  };
});

describe('modifierBreakdown rows (M4-07)', () => {
  it('a share shown as 0 is not a row; the field still has it', () => {
    const s = { ...createInitialState({ seed: 5, now: 1_763_400_000_000 }), relics: ['pernach' as const] };
    expect(modifierSources(s).some((x) => x.source.kind === 'relic')).toBe(true);
    const b = modifierBreakdown(s, 'powerMult');
    expect(b.sources.some((x) => x.source.kind === 'relic')).toBe(false);
    expect(b.value).toBe(collectModifiers(s, s.time.lastSeen).powerMult);
    expect(b.value).toBeGreaterThan(1);
  });
});
