// A raid that comes back after the offline cap still comes back (plan M3-05, ADR 012: raid timers have no offline
// cap). With the content's numbers the cap (8 h) is never shorter than a raid, so the case is checked on a 30-min cap.
import { describe, expect, it, vi } from 'vitest';
import { OFFLINE } from '../../../src/content/economy.ts';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import { applyOffline } from '../../../src/core/offline.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';

vi.mock('../../../src/content/economy.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/content/economy.ts')>();
  return { ...real, OFFLINE: { ...real.OFFLINE, capSec: 1800 } };
});

const T0 = 1_763_400_000_000;
const HOUR = 3600 * 1000;

function game(): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    story: { seen: [...STORY_BEAT_IDS] },
    village: { ...s.village, levels: { ...s.village.levels, field: 30, garden: 12 } },
    army: { infantry: 2000 },
    stats: { ...s.stats, hires: 2000 },
  };
}

describe('applyOffline past the offline cap (M3-05)', () => {
  it('a 4-h raid, 5 h away with a 30-min cap: the raid is back, the income is the 30 min only', () => {
    const s = applyAction(game(), { type: 'startRaid', slot: 0, tier: 'h4' }, T0).state;
    const r = applyOffline(s, T0 + 5 * HOUR);
    expect(r.state.raids.slots[0]?.kind).toBe('returned');
    expect(r.events.filter((e) => e.type === 'RaidReturned')).toHaveLength(1);
    expect(r.state.time.lastSeen).toBe(T0 + 5 * HOUR);
    const report = r.state.returnReport;
    expect(report).toMatchObject({ countedSec: 1800, capped: true });
    const half = advance(s, T0 + 1800 * 1000).state.currencies.ducats.sub(s.currencies.ducats);
    expect(report?.ducats.div(half.mul(OFFLINE.mult)).toNumber()).toBeCloseTo(1, 9);
  });
});
