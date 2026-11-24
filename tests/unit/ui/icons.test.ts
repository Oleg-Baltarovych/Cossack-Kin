// The UI icon atlas reader (plan M2-14): the atlas JSON is untrusted input, so only well-formed frames get through,
// and the icons left without a frame are reported (they draw their text fallback).
import { describe, expect, it } from 'vitest';
import { ICON_IDS, LOOT_ICON_IDS, parseIconAtlas } from '../../../src/ui/icons.ts';

const META = { image: 'ui.png', size: { w: 140, h: 40 } };
const atlas = (frames: unknown, meta: unknown = META) => ({ frames, meta });
// An icon frame is 18×18: the 16×16 icon in a 1-px transparent margin (M2-29 B1).
const frame = (x: number, y: number, w = 18, h = 18) => ({ frame: { x, y, w, h } });

describe('parseIconAtlas', () => {
  it('maps icon frames by id and keeps the sheet size and image; the rest are listed as missing', () => {
    const a = parseIconAtlas(
      atlas({
        'icon.ducat/idle/00': frame(38, 0),
        'icon.wind-storm/idle/00': frame(0, 19),
        'other/idle/00': frame(1, 1),
        'icon.unknown/idle/00': frame(50, 0),
      }),
      '/atlases/',
    );
    expect(a).toMatchObject({ url: '/atlases/ui.png', w: 140, h: 40 });
    expect([...a.frames]).toEqual([
      ['ducat', { x: 38, y: 0 }],
      ['wind-storm', { x: 0, y: 19 }],
    ]);
    expect(a.missing).toEqual(ICON_IDS.filter((id) => id !== 'ducat' && id !== 'wind-storm'));
  });

  it('refuses a malformed sheet: not an object, frames not an object, odd image names, bad sizes', () => {
    expect(() => parseIconAtlas(null)).toThrow();
    expect(() => parseIconAtlas(atlas('frames'))).toThrow();
    for (const image of ['../x.png', 'atlases/ui.png', 'ui.json', 'UI.png'])
      expect(() => parseIconAtlas(atlas({}, { ...META, image })), image).toThrow();
    for (const size of [undefined, { w: -1, h: 33 }, { w: Number.NaN, h: 33 }, { w: 140, h: 1.5 }, { w: '140', h: 40 }])
      expect(() => parseIconAtlas(atlas({}, { image: 'ui.png', size })), JSON.stringify(size)).toThrow();
  });

  it('skips a bad frame (not a record, non-integer, wrong size, outside the sheet) instead of drawing garbage', () => {
    const a = parseIconAtlas(
      atlas({
        'icon.ducat/idle/00': 'frame',
        'icon.glory/idle/00': { frame: null },
        'icon.kharch/idle/00': frame(1.5, 0),
        'icon.cossack/idle/00': frame(0, 0, 16, 16),
        'icon.defence/idle/00': frame(130, 0),
        'icon.lock/idle/00': frame(0, 25),
        'icon.quest/idle/00': frame(-18, 0),
        'icon.milestone/idle/00': frame(114, 19),
      }),
    );
    expect([...a.frames.keys()]).toEqual(['milestone']);
    expect(a.missing).toContain('ducat');
    expect(a.missing).toContain('lock');
  });
});

describe('parseIconAtlas: the loot sheet (M3-12)', () => {
  it('reads its own generator prefix only', () => {
    const a = parseIconAtlas(
      { frames: { 'loot-icon.chest/idle/00': frame(0, 0), 'icon.pernach/idle/00': frame(19, 0) }, meta: META },
      '/atlases/',
      LOOT_ICON_IDS,
      'loot-icon',
    );
    expect([...a.frames.keys()]).toEqual(['chest']);
    expect(a.missing).toContain('pernach');
  });
});
