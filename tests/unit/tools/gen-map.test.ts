// Raid map art (plan M3-10): the map is RAID_MAP-sized and opaque, within its budget (≤ 24 colours, ≤ 6 ramps); every
// region of the content sits on the geography the map draws; every tier marker stands inside the map's inner rule at
// every region; the five tier flags grow with the raid's length; markers stay within the prop budget.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import raidMap, { MAP_FRAME, nearRiver, RIVERS, RAPIDS } from '../../../assets-src/gen/map/raid-map/index.ts';
import raidMarker from '../../../assets-src/gen/map/raid-marker/index.ts';
import raidRumor from '../../../assets-src/gen/map/raid-rumor/index.ts';
import raidSquad from '../../../assets-src/gen/map/raid-squad/index.ts';
import { loadPalette } from '../../../assets-src/gen/lib/palette.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import { RAID_MAP, RAID_TIER_IDS, REGIONS, type RegionId } from '../../../src/content/raids.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';

const palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));

function frames(gen: SpriteGenerator): FrameImage[] {
  const problems: string[] = [];
  const out = renderGenerator(gen, palette, problems);
  expect(problems).toEqual([]);
  return out;
}

const opaque = (f: FrameImage, x: number, y: number): boolean =>
  (f.image.data[(y * f.image.width + x) * 4 + 3] ?? 0) !== 0;

/** Opaque px box of a frame relative to its pivot. */
function box(f: FrameImage): { x0: number; y0: number; x1: number; y1: number } {
  const px = Math.round(f.anchor.x * f.image.width);
  const py = Math.round(f.anchor.y * f.image.height);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < f.image.height; y++)
    for (let x = 0; x < f.image.width; x++)
      if (opaque(f, x, y)) {
        x0 = Math.min(x0, x - px);
        y0 = Math.min(y0, y - py);
        x1 = Math.max(x1, x - px);
        y1 = Math.max(y1, y - py);
      }
  return { x0, y0, x1, y1 };
}

describe('raid map (M3-10)', () => {
  it('is RAID_MAP-sized, fully opaque, pivot top-left, in the map atlas, within 24 colours / 6 ramps', () => {
    const [map, ...rest] = frames(raidMap);
    expect(rest).toEqual([]);
    if (!map) throw new Error('no frame');
    expect(map.name).toBe('raid-map.khortytsia/idle/00');
    expect(raidMap.atlas).toBe('map');
    expect([map.image.width, map.image.height]).toEqual([RAID_MAP.w, RAID_MAP.h]);
    expect(map.anchor).toEqual({ x: 0, y: 0 });
    for (let i = 0; i < RAID_MAP.w * RAID_MAP.h; i++) expect(map.image.data[i * 4 + 3]).toBe(255);
    const s = colorStats(map.image, palette);
    expect(s.colors).toBeLessThanOrEqual(24);
    expect(s.ramps.length).toBeLessThanOrEqual(6);
  });

  it('puts every region on its own geography', () => {
    const at = (id: RegionId) => {
      const r = REGIONS.khortytsia.find((g) => g.id === id);
      if (!r) throw new Error(id);
      return [r.x + 0.5, r.y + 0.5] as const;
    };
    const onRiver = (river: keyof typeof RIVERS, id: RegionId): number => nearRiver(RIVERS[river], ...at(id)).m;
    expect(onRiver('samara', 'samara')).toBeLessThanOrEqual(1);
    expect(onRiver('vovcha', 'vovchiVody')).toBeLessThanOrEqual(1);
    expect(onRiver('konka', 'kinskiVody')).toBeLessThanOrEqual(1);
    expect(onRiver('dnipro', 'tavan')).toBeLessThanOrEqual(1);
    // The rapids' marker stands on the Dnipro between its first and its last stone ridge.
    expect(onRiver('dnipro', 'porohy')).toBeLessThanOrEqual(1);
    const [, py] = at('porohy');
    expect(py).toBeGreaterThanOrEqual(RAPIDS[0]?.[0] ?? Infinity);
    expect(py).toBeLessThanOrEqual(RAPIDS.at(-1)?.[0] ?? -Infinity);
    // The Wild Fields are open steppe: no river near.
    for (const pts of Object.values(RIVERS)) expect(nearRiver(pts, ...at('dykePole')).m).toBeGreaterThan(8);
  });

  it('keeps every tier marker (and the squad beside it) inside the inner rule at every region', () => {
    const inside = MAP_FRAME.inner + 1;
    const shift = (b: ReturnType<typeof box>) => ({ ...b, x0: b.x0 + RAID_MAP.squadDx, x1: b.x1 + RAID_MAP.squadDx });
    const boxes = [
      ...frames(raidMarker).map((f) => ({ name: f.name, b: box(f) })),
      ...frames(raidSquad).map((f) => ({ name: f.name, b: shift(box(f)) })),
    ];
    for (const r of REGIONS.khortytsia)
      for (const { name, b } of boxes) {
        const where = `${name} at ${r.id}`;
        expect(r.x + b.x0, where).toBeGreaterThanOrEqual(inside);
        expect(r.y + b.y0, where).toBeGreaterThanOrEqual(inside);
        expect(r.x + b.x1, where).toBeLessThan(RAID_MAP.w - inside);
        expect(r.y + b.y1, where).toBeLessThan(RAID_MAP.h - inside);
      }
  });

  it('grows the flag with the raid length: m5 → h8, each one distinct', () => {
    const fs = frames(raidMarker);
    expect(fs.map((f) => f.name)).toEqual(RAID_TIER_IDS.map((t) => `raid-marker.${t}/idle/00`));
    const area = fs.map((f) => {
      const b = box(f);
      return (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    });
    for (let i = 1; i < area.length; i++) expect(area[i]).toBeGreaterThan(area[i - 1] ?? Infinity);
    const heights = fs.map((f) => box(f).y0);
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThan(heights[i - 1] ?? -Infinity);
  });

  it('markers, rumour and squad: binary alpha, ≤ 16 colours / 4 ramps, ink outline, no black', () => {
    for (const f of [...frames(raidMarker), ...frames(raidRumor), ...frames(raidSquad)]) {
      const d = f.image.data;
      for (let i = 0; i < f.image.width * f.image.height; i++) {
        const a = d[i * 4 + 3] ?? 0;
        expect([0, 255], f.name).toContain(a);
        if (a > 0) expect((d[i * 4] ?? 0) + (d[i * 4 + 1] ?? 0) + (d[i * 4 + 2] ?? 0), f.name).toBeGreaterThan(0);
      }
      const s = colorStats(f.image, palette);
      expect(s.colors, f.name).toBeLessThanOrEqual(16);
      expect(s.ramps.length, f.name).toBeLessThanOrEqual(4);
      expect(s.ramps, f.name).toContain('ink');
    }
  });

  it('puts the rumour glint on dry land, inside the frame, clear of every flag and of the squad (M3-11)', () => {
    const [map] = frames(raidMap);
    if (!map) throw new Error('no map');
    const ramp = (x: number, y: number): string | undefined => {
      const i = (y * map.image.width + x) * 4;
      const d = map.image.data;
      return palette.colors.get(((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0))?.ramp;
    };
    const [glint] = frames(raidRumor);
    if (!glint) throw new Error('no glint');
    const g = box(glint);
    const others = [
      ...frames(raidMarker).map(box),
      ...frames(raidSquad).map((f) => {
        const b = box(f);
        return { ...b, x0: b.x0 + RAID_MAP.squadDx, x1: b.x1 + RAID_MAP.squadDx };
      }),
    ];
    const inside = MAP_FRAME.inner + 1;
    for (const r of REGIONS.khortytsia) {
      const cx = r.x + r.glint.dx;
      const cy = r.y + r.glint.dy;
      // The glint's opaque box inside the inner rule…
      expect(Math.min(cx + g.x0, cy + g.y0), r.id).toBeGreaterThanOrEqual(inside);
      expect(cx + g.x1, r.id).toBeLessThan(RAID_MAP.w - inside);
      expect(cy + g.y1, r.id).toBeLessThan(RAID_MAP.h - inside);
      // …and with one px of air around it, no water under it and no flag or squad in it.
      const x0 = cx + g.x0 - 1;
      const y0 = cy + g.y0 - 1;
      const x1 = cx + g.x1 + 1;
      const y1 = cy + g.y1 + 1;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) expect(ramp(x, y), `${r.id} at ${String(x)},${String(y)}`).not.toBe('water');
      for (const o of others) {
        const apart = x1 < r.x + o.x0 || r.x + o.x1 < x0 || y1 < r.y + o.y0 || r.y + o.y1 < y0;
        expect(apart, r.id).toBe(true);
      }
    }
  });

  it('the squad trots in 4 distinct frames', () => {
    const keys = frames(raidSquad).map((f) => Buffer.from(f.image.data).toString('base64'));
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(3); // frames 1 and 3 are the same gathered pose
  });
});
