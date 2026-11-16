// Paper-doll library and the ART-06 characters: masks paint the outfit's ramps, frames stand on their ground row,
// walk frames differ from each other (it is an animation, not one pose), palette swaps change only colours.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import kozak, { KOZAK_GROUND } from '../../../assets-src/gen/khortytsia/kozak/index.ts';
import selianka, { SELIANKA_GROUND } from '../../../assets-src/gen/khortytsia/selianka/index.ts';
import { checkMask, paintDoll, type Outfit } from '../../../assets-src/gen/lib/doll.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import { Plot } from '../../../assets-src/gen/lib/plot.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));

const outfit: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'wood', tones: [0, 1, 2, 3] },
  shirt: { ramp: 'plaster', tones: [2, 3, 5, 6] },
  lower: { ramp: 'cloth', tones: [0, 1, 2, 3] },
  accent: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'crimson', tones: [0, 1, 2, 3] },
  hat: { ramp: 'ink', tones: [1, 2, 3, 3] },
};

describe('paper-doll masks', () => {
  it('paints each legend letter as its slot ramp at the tone (upper = light, pair letter = shade)', () => {
    const plot = new Plot();
    paintDoll(plot, outfit, [{ mask: ['sSzZ', 'p.q.'], x: 2, y: 3 }]);
    expect(plot.get(2, 3)).toEqual({ ramp: 'skin', shade: 3 });
    expect(plot.get(3, 3)).toEqual({ ramp: 'skin', shade: 4 });
    expect(plot.get(4, 3)).toEqual({ ramp: 'skin', shade: 2 });
    expect(plot.get(5, 3)).toEqual({ ramp: 'skin', shade: 1 });
    expect(plot.get(2, 4)).toEqual({ ramp: 'cloth', shade: 2 });
    expect(plot.has(3, 4)).toBe(false);
    expect(plot.get(4, 4)).toEqual({ ramp: 'cloth', shade: 1 });
  });

  it('later stamps cover earlier ones; unknown letters are rejected', () => {
    const plot = new Plot();
    paintDoll(plot, outfit, [
      { mask: ['ww'], x: 0, y: 0 },
      { mask: ['.r'], x: 0, y: 0 },
    ]);
    expect(plot.get(0, 0)?.ramp).toBe('plaster');
    expect(plot.get(1, 0)?.ramp).toBe('crimson');
    expect(() => {
      checkMask(['w?'], 'bad');
    }).toThrow(/unknown mask char "\?"/);
  });
});

function render(gen: SpriteGenerator): FrameImage[] {
  const problems: string[] = [];
  const frames = renderGenerator(gen, palette, problems);
  expect(problems).toEqual([]);
  return frames;
}
const lowestRow = (f: FrameImage): number => {
  let low = -1;
  for (let i = 3; i < f.image.data.length; i += 4)
    if ((f.image.data[i] ?? 0) > 0) low = Math.floor(i / 4 / f.image.width);
  return low;
};
const key = (f: FrameImage): string => Buffer.from(f.image.data).toString('base64');
const alphaKey = (f: FrameImage): string =>
  Array.from(
    f.image.data.filter((_, i) => i % 4 === 3),
    (a) => (a > 0 ? 1 : 0),
  ).join('');

describe.each([
  { gen: selianka, ground: SELIANKA_GROUND },
  { gen: kozak, ground: KOZAK_GROUND },
])('$gen.id (ART-06)', ({ gen, ground }) => {
  const frames = render(gen);
  const base = frames.filter((f) => !f.name.includes('@'));

  it('declares idle 4 and walk 6 frames per variant, each with a ground shadow', () => {
    expect(gen.frames).toEqual({ idle: 4, walk: 6 });
    expect(base.length).toBe((gen.variants?.length ?? 1) * 10);
    expect(frames.filter((f) => f.name.includes('@shadow')).length).toBe(base.length);
  });

  it('every frame stands on its ground row (the soles are the pivot)', () => {
    for (const f of base) expect(lowestRow(f), f.name).toBe(ground);
  });

  it('walk frames are distinct poses; variants share the silhouette and differ in colour', () => {
    const walk = base.filter((f) => f.name.startsWith(`${gen.id}.a/walk/`));
    expect(new Set(walk.map(key)).size).toBeGreaterThanOrEqual(4);
    const a = base.find((f) => f.name === `${gen.id}.a/idle/00`);
    const b = base.find((f) => f.name === `${gen.id}.b/idle/00`);
    if (!a || !b) throw new Error('missing variant frames');
    expect(alphaKey(a)).toBe(alphaKey(b));
    expect(key(a)).not.toBe(key(b));
  });
});
