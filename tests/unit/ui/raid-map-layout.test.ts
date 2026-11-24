// Raid map flags as tap targets (M3-11 review): at the map's scale (×2) every two flags' --tap boxes (centred on the
// cloth) stay apart on each phone of the e2e matrix, for any pair of regions the day board can show together. At ×1
// they would overlap — the map then falls back to a list of tier buttons (RaidMap.tsx), so ×1 is never tapped.
import { describe, expect, it } from 'vitest';
import { RAID_MAP, REGIONS } from '../../../src/content/raids.ts';
import { uiScale } from '../../../src/ui/theme.ts';

const PHONES = [
  [390, 844, 3],
  [360, 800, 3],
  [412, 915, 3.5],
] as const;

/** The smallest Chebyshev distance between two flag centres, in map px (two square boxes overlap below their side). */
function closest(): number {
  const list = REGIONS.khortytsia;
  let min = Infinity;
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a || !b) continue;
      min = Math.min(min, Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));
    }
  return min;
}

describe('raid map flags: tap boxes apart (M3-11 review)', () => {
  it.each(PHONES)('%i×%i@%f: the nearest two flags at ×2 are at least one --tap apart', (w, h, dpr) => {
    const { px, tap } = uiScale(w, h, dpr);
    expect(closest() * RAID_MAP.scale * px).toBeGreaterThanOrEqual(tap);
  });

  it('at ×1 they would not be (why the map lists the tiers instead)', () => {
    const { px, tap } = uiScale(390, 844, 3);
    expect(closest() * px).toBeLessThan(tap);
  });
});
