// The raid map atlas as the DOM reads it (plan M3-11): the untrusted JSON → the map, the five flags, the glint and the
// squad's march frames with their pivots; a malformed sheet throws, a bad frame is left out; the march runs as one CSS
// animation only when its frames stand side by side at an even stride.
import { describe, expect, it } from 'vitest';
import { RAID_TIER_IDS } from '../../../src/content/raids.ts';
import { MAP_FRAMES, parseRaidMap, squadStride, type MapSprite } from '../../../src/ui/raidMap.ts';

const frame = (x: number, y: number, w: number, h: number, ax = 0, ay = 0) => ({
  frame: { x, y, w, h },
  anchor: { x: ax, y: ay },
});

function sheet(extra: Record<string, unknown> = {}) {
  const frames: Record<string, unknown> = {
    [MAP_FRAMES.map]: frame(0, 0, 180, 150),
    [MAP_FRAMES.rumor]: frame(76, 151, 11, 11, 5 / 11, 5 / 11),
    ...Object.fromEntries(
      RAID_TIER_IDS.map((t, i) => [MAP_FRAMES.marker(t), frame(181 + i * 15, 0, 14, 20, 2 / 14, 1)]),
    ),
    ...Object.fromEntries([0, 1, 2, 3].map((i) => [MAP_FRAMES.squad(i), frame(i * 19, 151, 18, 16, 0.5, 1)])),
    ...extra,
  };
  return { frames, meta: { image: 'map.png', size: { w: 255, h: 167 } } };
}

describe('parseRaidMap', () => {
  it('reads every sprite with its pivot in whole px', () => {
    const a = parseRaidMap(sheet(), 'atlases/');
    expect(a.url).toBe('atlases/map.png');
    expect(a.map).toEqual({ x: 0, y: 0, w: 180, h: 150, px: 0, py: 0 });
    expect([...a.markers.keys()]).toEqual([...RAID_TIER_IDS]);
    expect(a.markers.get('m5')).toMatchObject({ w: 14, h: 20, px: 2, py: 20 });
    expect(a.rumor).toMatchObject({ px: 5, py: 5 });
    expect(a.squad.map((f) => f.x)).toEqual([0, 19, 38, 57]);
  });

  it('leaves out a frame outside the sheet or with a bad anchor; throws on a malformed sheet', () => {
    const a = parseRaidMap(
      sheet({ [MAP_FRAMES.marker('h8')]: frame(250, 0, 14, 20), [MAP_FRAMES.rumor]: frame(0, 0, 11, 11, 2, 0) }),
    );
    expect(a.markers.has('h8')).toBe(false);
    expect(a.rumor).toBeNull();
    expect(() => parseRaidMap({ frames: {} })).toThrow(/bad json/);
    expect(() => parseRaidMap({ frames: {}, meta: { image: '../x.png', size: { w: 1, h: 1 } } })).toThrow(/bad meta/);
  });
});

describe('squadStride', () => {
  const f = (x: number, y = 151): MapSprite => ({ x, y, w: 18, h: 16, px: 9, py: 16 });
  it('an even row of equal frames animates; anything else stands still', () => {
    expect(squadStride([f(0), f(19), f(38), f(57)])).toBe(19);
    expect(squadStride([f(0), f(19), f(40), f(57)])).toBeNull();
    expect(squadStride([f(0), f(19, 0)])).toBeNull();
    expect(squadStride([f(0)])).toBeNull();
  });
});
