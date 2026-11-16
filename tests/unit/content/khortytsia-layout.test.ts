import { describe, expect, it } from 'vitest';
import { KHORTYTSIA_FARM } from '../../../src/content/villages/khortytsia.layout.ts';
import { WORLD_WIDTH_PX } from '../../../src/content/world.ts';

describe('khortytsia farm layout', () => {
  it('horizon follows ART-BIBLE §2 (40–45 % of the view)', () => {
    expect(KHORTYTSIA_FARM.horizonRatio).toBeGreaterThanOrEqual(0.4);
    expect(KHORTYTSIA_FARM.horizonRatio).toBeLessThanOrEqual(0.45);
  });

  it('ground rows start at the horizon, are contiguous and whole 32-px tiles tall', () => {
    let top = 0;
    for (const row of KHORTYTSIA_FARM.rows) {
      expect(row.top).toBe(top);
      expect(row.h % 32).toBe(0);
      expect(row.h).toBeGreaterThan(0);
      top += row.h;
    }
  });

  it('props stand inside the world and inside the ground rows', () => {
    const last = KHORTYTSIA_FARM.rows.at(-1);
    const depth = last ? last.top + last.h : 0;
    for (const p of KHORTYTSIA_FARM.props) {
      expect(p.x - 32).toBeGreaterThanOrEqual(0);
      expect(p.x + 32).toBeLessThanOrEqual(WORLD_WIDTH_PX);
      expect(p.ground).toBeGreaterThan(0);
      expect(p.ground).toBeLessThan(depth);
    }
  });
});
