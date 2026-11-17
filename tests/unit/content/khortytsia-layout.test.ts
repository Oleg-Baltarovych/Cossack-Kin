import { describe, expect, it } from 'vitest';
import { KHORTYTSIA_FARM, KHORTYTSIA_SICH } from '../../../src/content/villages/khortytsia.layout.ts';
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

  it('every khata stands on a yard decal (not on a uniform lawn)', () => {
    const khatas = KHORTYTSIA_FARM.props.filter((p) => p.sprite.startsWith('khata'));
    expect(khatas.length).toBeGreaterThan(0);
    for (const k of khatas) {
      const yard = KHORTYTSIA_FARM.decals.find((d) => Math.abs(d.x - k.x) <= 8 && Math.abs(d.ground - k.ground) <= 8);
      expect(yard, `yard under ${k.sprite} at ${String(k.x)}`).toBeDefined();
    }
  });
});

describe('khortytsia sich layout (ART-11)', () => {
  it('is all Cossacks (no women on the Sich), stays inside the world and has the gate and towers on the rampart', () => {
    const s = KHORTYTSIA_SICH;
    for (const w of s.walkers) expect(w.sprite.startsWith('kozak')).toBe(true);
    for (const p of s.props) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WORLD_WIDTH_PX);
    }
    expect(s.props.filter((p) => p.sprite === 'gate')).toHaveLength(1);
    expect(s.props.filter((p) => p.sprite === 'tower').length).toBeGreaterThanOrEqual(2);
    const val = s.rows.find((r) => r.tile === 'val');
    expect(val).toBeDefined();
    for (const p of s.props.filter((q) => q.sprite.startsWith('palisade'))) {
      expect(p.ground).toBeGreaterThanOrEqual(val?.top ?? 0);
      expect(p.ground).toBeLessThan((val?.top ?? 0) + (val?.h ?? 0));
    }
  });

  it('the palisade never repeats one height on more than two neighbouring sections (not a comb)', () => {
    const line = KHORTYTSIA_SICH.props.filter((p) => p.sprite.startsWith('palisade')).map((p) => p.sprite);
    for (let i = 2; i < line.length; i++) {
      expect(line[i] === line[i - 1] && line[i] === line[i - 2]).toBe(false);
    }
  });
});
