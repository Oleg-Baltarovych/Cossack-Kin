// Construction art (plan M2-12): scaffolds grow stage by stage within the footprint render's dust uses, the standard's
// cloth climbs the pole frame by frame, every new frame stays binary-alpha and within the prop colour budget.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import confetti from '../../../assets-src/gen/khortytsia/confetti/index.ts';
import dust from '../../../assets-src/gen/khortytsia/dust/index.ts';
import flash from '../../../assets-src/gen/khortytsia/flash/index.ts';
import scaffold, { SCAFFOLD_LOOKS } from '../../../assets-src/gen/khortytsia/scaffold/index.ts';
import standard from '../../../assets-src/gen/khortytsia/standard/index.ts';
import { loadPalette } from '../../../assets-src/gen/lib/palette.ts';
import { BUILD } from '../../../src/render/atmosphere/config.ts';
import { STANDARD_FRAMES } from '../../../src/render/fx/construction.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';

const palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));

function render(gen: Parameters<typeof renderGenerator>[0]): FrameImage[] {
  const problems: string[] = [];
  const frames = renderGenerator(gen, palette, problems);
  expect(problems).toEqual([]);
  return frames;
}

const alpha = (f: FrameImage, i: number): number => f.image.data[i * 4 + 3] ?? 0;
const opaque = (f: FrameImage): number => {
  let n = 0;
  for (let i = 0; i < f.image.width * f.image.height; i++) if (alpha(f, i) > 0) n += 1;
  return n;
};
/** Bounding box of the opaque px. */
function box(f: FrameImage): { x0: number; x1: number; y0: number; y1: number } {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let y = 0; y < f.image.height; y++)
    for (let x = 0; x < f.image.width; x++)
      if (alpha(f, y * f.image.width + x) > 0)
        Object.assign(b, {
          x0: Math.min(b.x0, x),
          x1: Math.max(b.x1, x),
          y0: Math.min(b.y0, y),
          y1: Math.max(b.y1, y),
        });
  return b;
}
const colours = (f: FrameImage): number => {
  const set = new Set<number>();
  for (let i = 0; i < f.image.width * f.image.height; i++)
    if (alpha(f, i) > 0) {
      const d = f.image.data;
      set.add(((d[i * 4] ?? 0) << 16) | ((d[i * 4 + 1] ?? 0) << 8) | (d[i * 4 + 2] ?? 0));
    }
  return set.size;
};

describe('construction sprites (M2-12)', () => {
  it('render code keeps the scaffold footprints of the generator', () => {
    expect(BUILD.scaffoldW).toEqual({ s: SCAFFOLD_LOOKS.s.w, l: SCAFFOLD_LOOKS.l.w });
  });

  it('each scaffold grows stage by stage and stands on its pivot row', () => {
    const frames = render(scaffold);
    for (const v of ['s', 'l']) {
      const stages = [0, 1, 2].map((i) => frames.find((f) => f.name === `scaffold.${v}/idle/0${String(i)}`));
      const [a, b, c] = stages;
      if (!a || !b || !c) throw new Error(`no scaffold.${v} stages`);
      expect(opaque(a)).toBeLessThan(opaque(b));
      expect(opaque(b)).toBeLessThan(opaque(c));
      for (const f of [a, b, c]) expect(box(f).y1).toBe(Math.round(f.anchor.y * f.image.height));
      expect(box(c).x1 - box(c).x0 + 1).toBeLessThanOrEqual(SCAFFOLD_LOOKS[v === 'l' ? 'l' : 's'].w + 2);
    }
  });

  it('the standard has 6 frames and its cloth climbs to the top', () => {
    const all = render(standard);
    const frames = all.filter((f) => !f.name.includes('@'));
    expect(frames).toHaveLength(STANDARD_FRAMES);
    // The gold finial is its night glint: a small @emissive mask on every frame (art-director M2-12).
    const glints = all.filter((f) => f.name.startsWith('standard@emissive/'));
    expect(glints).toHaveLength(STANDARD_FRAMES);
    for (const g of glints) expect(opaque(g)).toBeLessThanOrEqual(4);
    // The cloth's lowest px (the furled cloth's foot) rises frame by frame until it flies.
    const clothBottom = (f: FrameImage): number => {
      let bottom = -1;
      for (let y = 0; y < f.image.height; y++)
        for (let x = 3; x < f.image.width; x++) if (alpha(f, y * f.image.width + x) > 0) bottom = y;
      return bottom;
    };
    const bottoms = frames.map(clothBottom);
    for (let i = 1; i < 4; i++) expect(bottoms[i]).toBeLessThan(bottoms[i - 1] ?? 0);
  });

  it('every frame is binary alpha and within the prop budget (≤ 16 colours)', () => {
    for (const gen of [scaffold, standard, dust, confetti, flash]) {
      for (const f of render(gen).filter((x) => !x.name.includes('@'))) {
        for (let i = 0; i < f.image.width * f.image.height; i++) expect([0, 255]).toContain(alpha(f, i));
        expect(colours(f), f.name).toBeLessThanOrEqual(16);
        expect(opaque(f), f.name).toBeGreaterThan(0);
      }
    }
  });
});
