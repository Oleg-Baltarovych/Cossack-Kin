// `pnpm sprites` pipeline (plan M0-08, ADR 004): palette by construction, palette/alpha/size checks,
// shelf packer, deterministic atlases in Pixi Spritesheet format.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng, type RgbaImage } from '../../../tools/lib/png.ts';
import { buildAtlases, composeAtlas, SpriteBuildError, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { createIndexBuffer, quantize } from '../../../tools/lib/sprites/buffer.ts';
import { checkFrame } from '../../../tools/lib/sprites/check.ts';
import { packShelves, type PackRect } from '../../../tools/lib/sprites/pack.ts';
import { loadPalette, nearestColor, type Palette } from '../../../tools/lib/sprites/palette.ts';
import { seededRng } from '../../../tools/lib/sprites/rng.ts';
import type { SpriteGenerator } from '../../../tools/lib/sprites/types.ts';
import swatch from '../../../assets-src/gen/debug/swatch/index.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
const hex = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`;

/** Solid image of `rgba` (0xRRGGBBAA), optionally with one different px at (x, y). */
function solid(w: number, h: number, rgba: number, px?: { x: number; y: number; rgba: number }): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  const put = (i: number, v: number): void => {
    data.set([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff], i * 4);
  };
  for (let i = 0; i < w * h; i++) put(i, rgba);
  if (px) put(px.y * w + px.x, px.rgba);
  return { width: w, height: h, data };
}

const GRASS_3 = 0x3f7535;
const opaque = (rgb: number): number => ((rgb << 8) | 0xff) >>> 0;

describe('palette', () => {
  it('loads every ramp of master.json dark → light', () => {
    expect(palette.rampNames).toContain('grass');
    expect(palette.ramps.get('grass')?.[3]).toBe(GRASS_3);
    expect(palette.colors.size).toBeGreaterThanOrEqual(80);
  });

  it('rejects a malformed palette', () => {
    expect(() => loadPalette({ ramps: { bad: ['#12345'] } })).toThrow('bad');
    expect(() => loadPalette({})).toThrow('ramps');
  });

  it('OKLab-nearest maps a palette color to itself and a near color to its neighbour', () => {
    expect(nearestColor(palette, GRASS_3)).toBe(GRASS_3);
    expect(nearestColor(palette, GRASS_3 + 0x010201)).toBe(GRASS_3);
  });
});

describe('index buffer → quantize', () => {
  it('maps integer shades to exact ramp colors and leaves unset px transparent', () => {
    const buf = createIndexBuffer(3, 1, palette);
    buf.set(0, 0, 'grass', 3);
    buf.set(1, 0, 'grass', 99); // clamps to the lightest
    const img = quantize(buf, palette);
    expect([...img.data.subarray(0, 4)]).toEqual([0x3f, 0x75, 0x35, 255]);
    expect(hex(((img.data[4] ?? 0) << 16) | ((img.data[5] ?? 0) << 8) | (img.data[6] ?? 0))).toBe('#dfe08a');
    expect([...img.data.subarray(8, 12)]).toEqual([0, 0, 0, 0]);
  });

  it('dithers a fractional shade with Bayer 4×4 between the two neighbouring colors only', () => {
    const buf = createIndexBuffer(4, 4, palette);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) buf.set(x, y, 'sky', 2.5);
    const img = quantize(buf, palette);
    const seen = new Map<number, number>();
    for (let i = 0; i < 16; i++) {
      const rgb = ((img.data[i * 4] ?? 0) << 16) | ((img.data[i * 4 + 1] ?? 0) << 8) | (img.data[i * 4 + 2] ?? 0);
      seen.set(rgb, (seen.get(rgb) ?? 0) + 1);
    }
    expect([...seen.keys()].map(hex).sort()).toEqual(['#7a3f72', '#b4536f']);
    expect(seen.get(0x7a3f72)).toBe(8);
  });

  it('throws on a write outside the buffer and on an unknown ramp', () => {
    const buf = createIndexBuffer(2, 2, palette);
    expect(() => {
      buf.set(2, 0, 'grass', 1);
    }).toThrow('outside 2×2');
    expect(() => {
      buf.set(0, 0, 'nope' as 'grass', 1);
    }).toThrow('unknown ramp "nope"');
  });
});

describe('checkFrame', () => {
  const declared = { w: 4, h: 4 };

  it('passes palette colors with binary alpha', () => {
    const img = solid(4, 4, opaque(GRASS_3), { x: 1, y: 2, rgba: 0 });
    expect(checkFrame(img, palette, { name: 'a/b/00', declared, softAlpha: false })).toEqual([]);
  });

  it('reports an off-palette px with its coordinate and color', () => {
    const img = solid(4, 4, opaque(GRASS_3), { x: 2, y: 1, rgba: 0x123456ff });
    expect(checkFrame(img, palette, { name: 'a/b/00', declared, softAlpha: false })).toEqual([
      'a/b/00: off-palette #123456 at (2, 1)',
    ]);
  });

  it('reports a semi-transparent px outside the fx exception list', () => {
    const img = solid(4, 4, opaque(GRASS_3), { x: 3, y: 0, rgba: ((GRASS_3 << 8) | 0x80) >>> 0 });
    expect(checkFrame(img, palette, { name: 'a/b/00', declared, softAlpha: false })).toEqual([
      'a/b/00: semi-transparent alpha 128 at (3, 0) (soft alpha is allowed only in atlases: fx)',
    ]);
    expect(checkFrame(img, palette, { name: 'a/b/00', declared, softAlpha: true })).toEqual([]);
  });

  it('reports a frame larger than declared', () => {
    expect(checkFrame(solid(5, 4, opaque(GRASS_3)), palette, { name: 'a/b/00', declared, softAlpha: false })).toEqual([
      'a/b/00: frame 5×4 exceeds the declared 4×4',
    ]);
  });

  it('caps the report and counts the rest', () => {
    const problems = checkFrame(solid(8, 8, 0x010101ff), palette, {
      name: 'a/b/00',
      declared: { w: 8, h: 8 },
      softAlpha: false,
    });
    expect(problems).toHaveLength(21);
    expect(problems.at(-1)).toBe('a/b/00: …and 44 more');
  });
});

describe('packShelves', () => {
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a, pad: number): boolean =>
    a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

  it('never overlaps (with padding) and stays inside the atlas — 300 random sets', () => {
    const rng = seededRng('pack-property');
    for (let trial = 0; trial < 300; trial++) {
      const count = 1 + Math.floor(rng() * 60);
      const rects: PackRect[] = Array.from({ length: count }, (_, i) => ({
        id: `r${String(i)}`,
        w: 1 + Math.floor(rng() * 64),
        h: 1 + Math.floor(rng() * 64),
      }));
      const packed = packShelves(rects, { maxSize: 2048, padding: 1 });
      expect(packed.placements).toHaveLength(count);
      expect(new Set(packed.placements.map((p) => p.id)).size).toBe(count);
      for (const [i, a] of packed.placements.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(packed.width);
        expect(a.y + a.h).toBeLessThanOrEqual(packed.height);
        for (const b of packed.placements.slice(i + 1)) expect(overlaps(a, b, 1), `${a.id} vs ${b.id}`).toBe(false);
      }
    }
  });

  it('does not depend on the input order', () => {
    const rects: PackRect[] = [
      { id: 'a', w: 10, h: 4 },
      { id: 'b', w: 3, h: 9 },
      { id: 'c', w: 10, h: 4 },
    ];
    expect(packShelves([...rects].reverse(), { maxSize: 64, padding: 1 })).toEqual(
      packShelves(rects, { maxSize: 64, padding: 1 }),
    );
  });

  it('fails when the frames do not fit into maxSize²', () => {
    const rects: PackRect[] = Array.from({ length: 5 }, (_, i) => ({ id: String(i), w: 30, h: 30 }));
    expect(() => packShelves(rects, { maxSize: 64, padding: 1 })).toThrow('do not fit into 64×64');
  });
});

describe('composeAtlas', () => {
  const frame = (name: string, img: RgbaImage): FrameImage => ({
    name,
    image: img,
    declared: { w: img.width, h: img.height },
    anchor: { x: 0.5, y: 1 },
  });

  it('writes a Pixi spritesheet whose frames hold the source pixels', () => {
    const a = solid(3, 2, opaque(GRASS_3));
    const out = composeAtlas('debug', [frame('swatch/idle/00', a)], palette);
    expect(out.json.meta).toMatchObject({ image: 'debug.png', scale: 1, format: 'RGBA8888' });
    const rect = out.json.frames['swatch/idle/00']?.frame;
    expect(rect).toMatchObject({ w: 3, h: 2 });
    expect(out.json.animations).toEqual({ 'swatch/idle': ['swatch/idle/00'] });
    const img = decodePng(out.png);
    const at = ((rect?.y ?? 0) * img.width + (rect?.x ?? 0)) * 4;
    expect([...img.data.subarray(at, at + 4)]).toEqual([0x3f, 0x75, 0x35, 255]);
  });

  it('refuses soft alpha outside fx and accepts it in fx', () => {
    const soft = solid(2, 2, ((GRASS_3 << 8) | 0x40) >>> 0);
    expect(() => composeAtlas('debug', [frame('glow/idle/00', soft)], palette)).toThrow(SpriteBuildError);
    expect(composeAtlas('fx', [frame('glow/idle/00', soft)], palette).json.frames['glow/idle/00']).toBeDefined();
  });
});

describe('buildAtlases', () => {
  const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

  it('two runs give the same SHA-256 for every atlas file', () => {
    const run = (): string[] =>
      buildAtlases([swatch], palette).flatMap((atlas) => [sha(atlas.png), sha(atlas.jsonText)]);
    expect(run()).toEqual(run());
  });

  it('names frames <entity>/<anim>/<nn> and validates the generator contract', () => {
    const [atlas] = buildAtlases([swatch], palette);
    expect(Object.keys(atlas?.json.frames ?? {})).toEqual(['swatch/idle/00']);

    const bad: SpriteGenerator = { ...swatch, id: 'Bad Name' };
    expect(() => buildAtlases([bad], palette)).toThrow('id "Bad Name"');
    expect(() => buildAtlases([swatch, swatch], palette)).toThrow('duplicate frame debug:swatch/idle/00');
  });

  it('collects every problem of a generator that writes semi-transparent px', () => {
    const leaky: SpriteGenerator = {
      ...swatch,
      id: 'leaky',
      size: { w: 2, h: 1 },
      generate(_rng, { buffer }) {
        buffer.set(0, 0, 'grass', 3, 0.5);
        buffer.set(1, 0, 'grass', 3, 0.5);
      },
    };
    expect(() => buildAtlases([leaky], palette)).toThrow(
      /leaky\/idle\/00: semi-transparent alpha 128 at \(0, 0\)[\s\S]*at \(1, 0\)/,
    );
  });
});
