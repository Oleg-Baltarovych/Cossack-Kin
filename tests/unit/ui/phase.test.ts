import { describe, expect, it } from 'vitest';
import { SKY_KEYS, skyPhase } from '../../../src/render/atmosphere/skyKeys.ts';
import { localMinutes, uiPhase } from '../../../src/ui/phase.ts';

const at = (id: string): number => {
  const key = SKY_KEYS.find((k) => k.id === id);
  if (!key) throw new Error(`no sky key ${id}`);
  return key.at;
};
const MIN = 60_000;
const DAY = 1440;

describe('skyPhase (M4-16a: the UI follows the sky keys)', () => {
  it('is dusk from the dusk key to the night key, night from there to dawn, day otherwise', () => {
    expect(skyPhase(at('dusk') - 1)).toBe('day');
    expect(skyPhase(at('dusk'))).toBe('dusk');
    expect(skyPhase(at('night') - 1)).toBe('dusk');
    expect(skyPhase(at('night'))).toBe('night');
    expect(skyPhase(DAY - 1)).toBe('night');
    expect(skyPhase(0)).toBe('night');
    expect(skyPhase(at('dawn') - 1)).toBe('night');
    expect(skyPhase(at('dawn'))).toBe('day');
    expect(skyPhase(at('day'))).toBe('day');
  });

  it('wraps any minute count into the day', () => {
    expect(skyPhase(at('night') + DAY)).toBe('night');
    expect(skyPhase(at('day') - DAY)).toBe('day');
  });
});

describe('uiPhase: the game clock in its own zone, or the pinned ?time=', () => {
  // 2026-06-01 00:00 UTC.
  const midnightUtc = Date.UTC(2026, 5, 1);

  it('reads the local minute of `ms + tzOffsetMin`, never the device zone', () => {
    expect(localMinutes(midnightUtc + 90 * MIN, 0)).toBe(90);
    expect(localMinutes(midnightUtc, 180)).toBe(180);
    expect(localMinutes(midnightUtc, -60)).toBe(DAY - 60);
  });

  it('the same instant is night in one zone and day in another', () => {
    const ms = midnightUtc + at('night') * MIN; // the night key in UTC
    expect(uiPhase(ms, 0, null)).toBe('night');
    expect(uiPhase(ms, -(at('night') - at('day')), null)).toBe('day');
  });

  it('a pinned time of day wins over the clock', () => {
    expect(uiPhase(midnightUtc + at('day') * MIN, 0, at('dusk'))).toBe('dusk');
  });
});
