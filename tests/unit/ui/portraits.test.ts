// Story portraits from the `people` atlas (plan M2-25, Q14): the atlas JSON is untrusted input — only whole frames of
// the three portraits, inside the sheet and no bigger than the portrait box, are drawn.
import { describe, expect, it } from 'vitest';
import { PORTRAIT_MAX_PX } from '../../../src/content/story.ts';
import { PORTRAIT_FRAMES, parsePortraits } from '../../../src/ui/portraits.ts';

const frame = (x: number, y: number, w: number, h: number) => ({ frame: { x, y, w, h } });
const sheet = (frames: Record<string, unknown>, image: unknown = 'people.png') => ({
  frames,
  meta: { image, size: { w: 256, h: 128 } },
});

describe('parsePortraits', () => {
  it('maps each portrait to its sprite frame and keeps the image url', () => {
    const a = parsePortraits(
      sheet({
        [PORTRAIT_FRAMES.kobzar]: frame(0, 0, 32, 28),
        [PORTRAIT_FRAMES.messenger]: frame(32, 0, 32, 28),
        [PORTRAIT_FRAMES.otaman]: frame(64, 0, 32, 36),
        'kozak.a/idle/00': frame(96, 0, 32, 28),
      }),
      '/a/',
    );
    expect(a.url).toBe('/a/people.png');
    expect([...a.frames.entries()]).toEqual([
      ['kobzar', { x: 0, y: 0, w: 32, h: 28 }],
      ['messenger', { x: 32, y: 0, w: 32, h: 28 }],
      ['otaman', { x: 64, y: 0, w: 32, h: 36 }],
    ]);
  });

  it('refuses a malformed sheet', () => {
    expect(() => parsePortraits(null)).toThrow();
    expect(() => parsePortraits({ frames: [], meta: {} })).toThrow();
    expect(() => parsePortraits(sheet({}, '../x.png'))).toThrow();
  });

  it('leaves out a bad frame: not whole, outside the sheet, larger than the box', () => {
    const a = parsePortraits(
      sheet({
        [PORTRAIT_FRAMES.kobzar]: frame(0.5, 0, 32, 28),
        [PORTRAIT_FRAMES.messenger]: frame(240, 0, 32, 28),
        [PORTRAIT_FRAMES.otaman]: frame(0, 0, PORTRAIT_MAX_PX.w + 1, 36),
      }),
    );
    expect(a.frames.size).toBe(0);
  });
});
