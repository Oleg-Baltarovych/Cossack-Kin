// `pnpm sprites` pipeline (plan M0-08, ADR 004): palette by construction, palette/alpha/size checks,
// shelf packer, deterministic atlases in Pixi Spritesheet format.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import swatch from '../../../assets-src/gen/debug/swatch/index.ts';
import { createIndexBuffer, PIXEL_DEFAULTS, quantize } from '../../../assets-src/gen/lib/buffer.ts';
import { loadPalette, nearestColor, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import { hashString, seededRng } from '../../../assets-src/gen/lib/rng.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import { decodePng, type RgbaImage } from '../../../tools/lib/png.ts';
import {
  atlasIndex,
  buildAtlases,
  composeAtlas,
  frameNames,
  SpriteBuildError,
  type FrameImage,
} from '../../../tools/lib/sprites/atlas.ts';
import { checkFrame } from '../../../tools/lib/sprites/check.ts';
import { packShelves, type PackRect } from '../../../tools/lib/sprites/pack.ts';

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
/** seededRng('debug:swatch/idle/00') (FNV-1a → mulberry32), pinned at M0-08: k / 2^32 floats are exact. */
const GOLDEN_HASH = 723189658;
const GOLDEN_RNG = [0.9888619754929096, 0.7192477204371244, 0.9565023416653275];
const nn = (i: number): string => String(i).padStart(2, '0');

const frame = (name: string, img: RgbaImage): FrameImage => ({
  name,
  image: img,
  declared: { w: img.width, h: img.height },
  anchor: { x: 0.5, y: 1 },
});

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
    buf.set(0, 0, { ramp: 'grass', shade: 3 });
    buf.set(1, 0, { ramp: 'grass', shade: 99 }); // clamps to the lightest
    const img = quantize(buf, palette);
    expect([...img.data.subarray(0, 4)]).toEqual([0x3f, 0x75, 0x35, 255]);
    expect(hex(((img.data[4] ?? 0) << 16) | ((img.data[5] ?? 0) << 8) | (img.data[6] ?? 0))).toBe('#dfe08a');
    expect([...img.data.subarray(8, 12)]).toEqual([0, 0, 0, 0]);
  });

  it('dithers a fractional shade with Bayer 4×4 between the two neighbouring colors only', () => {
    const buf = createIndexBuffer(4, 4, palette);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) buf.set(x, y, { ramp: 'sky', shade: 2.5 });
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
      buf.set(2, 0, { ramp: 'grass', shade: 1 });
    }).toThrow('outside 2×2');
    expect(() => {
      buf.set(0, 0, { ramp: 'nope' as 'grass', shade: 1 });
    }).toThrow('unknown ramp "nope"');
  });

  it('stores every per-px field, reads it back and applies explicit defaults', () => {
    const buf = createIndexBuffer(2, 1, palette);
    buf.set(0, 0, { ramp: 'wood', shade: 2.25, alpha: 1, material: 7, normal: [-90, 10, 80], partId: 300, depth: 4.5 });
    buf.set(1, 0, { ramp: 'grass', shade: 1 });
    expect(buf.get(0, 0)).toEqual({
      ramp: 'wood',
      shade: 2.25,
      alpha: 1,
      material: 7,
      normal: [-90, 10, 80],
      partId: 300,
      depth: 4.5,
    });
    expect(buf.get(1, 0)).toEqual({ ramp: 'grass', shade: 1, ...PIXEL_DEFAULTS });
  });

  it('clear() resets every field, not just the ramp', () => {
    const buf = createIndexBuffer(1, 1, palette);
    buf.set(0, 0, { ramp: 'wood', shade: 3, alpha: 0.5, material: 9, normal: [1, 2, 3], partId: 5, depth: 2 });
    buf.clear(0, 0);
    expect(buf.get(0, 0)).toEqual({ ramp: null, shade: 0, ...PIXEL_DEFAULTS, alpha: 0 });
    expect(buf.get(0, 0)).toEqual(createIndexBuffer(1, 1, palette).get(0, 0));
  });

  it('inBounds() guards neighbour passes; get() throws outside', () => {
    const buf = createIndexBuffer(3, 2, palette);
    const probes: [number, number][] = [
      [0, 0],
      [2, 1],
      [3, 0],
      [-1, 0],
      [0.5, 0],
    ];
    expect(probes.map(([x, y]) => buf.inBounds(x, y))).toEqual([true, true, false, false, false]);
    expect(() => buf.get(0, 2)).toThrow('outside 3×2');
  });

  it.each([
    ['alpha', { alpha: 1.5 }, 'alpha 1.5'],
    ['material', { material: 256 }, 'material 256'],
    ['normal', { normal: [0, 0, 128] as const }, 'normal [0, 0, 128]'],
    ['partId', { partId: 70000 }, 'partId 70000'],
    ['depth', { depth: Number.NaN }, 'depth NaN'],
    ['shade', { shade: Number.POSITIVE_INFINITY }, 'shade Infinity'],
  ])('rejects an invalid %s', (_field, extra, message) => {
    const buf = createIndexBuffer(1, 1, palette);
    expect(() => {
      buf.set(0, 0, { ramp: 'grass', shade: 1, ...extra });
    }).toThrow(message);
  });
});

describe('seededRng', () => {
  it('golden values: the sequence for a fixed key never changes', () => {
    expect(hashString('debug:swatch/idle/00')).toBe(GOLDEN_HASH);
    const rng = seededRng('debug:swatch/idle/00');
    expect([rng(), rng(), rng()]).toEqual(GOLDEN_RNG);
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
  it('writes a Pixi spritesheet whose frames hold the source pixels', () => {
    const out = composeAtlas('debug', [frame('swatch/idle/00', solid(3, 2, opaque(GRASS_3)))], palette);
    expect(out.json.meta).toMatchObject({ image: 'debug.png', scale: 1, format: 'RGBA8888' });
    expect(out.json.frames['swatch/idle/00']?.frame).toMatchObject({ w: 3, h: 2 });
    expect(out.json.animations).toEqual({ 'swatch/idle': ['swatch/idle/00'] });
  });

  it('packs frames of different sizes byte-exact, padding transparent, animations in frame order', () => {
    const colors = [GRASS_3, 0x2a6292, 0xb8203f, 0xf2a92e];
    const color = (i: number): number => opaque(colors[i % colors.length] ?? GRASS_3);
    const frames: FrameImage[] = [
      frame('big/idle/00', solid(9, 5, color(0), { x: 3, y: 2, rgba: color(1) })),
      frame('tall/idle/00', solid(2, 7, color(2))),
      // 11 frames, inserted out of order: 10 must follow 09 in the animation.
      ...Array.from({ length: 11 }, (_, k) => 10 - k).map((i) =>
        frame(`run/go/${nn(i)}`, solid(1 + (i % 4), 3, color(i), { x: 0, y: i % 3, rgba: color(i + 1) })),
      ),
    ];
    const out = composeAtlas('test', frames, palette);
    const atlas = decodePng(out.png);
    const covered = new Uint8Array(atlas.width * atlas.height);
    for (const f of frames) {
      const rect = out.json.frames[f.name]?.frame;
      expect(rect, f.name).toMatchObject({ w: f.image.width, h: f.image.height });
      if (!rect) continue;
      for (let y = 0; y < rect.h; y++) {
        const start = (rect.y + y) * atlas.width + rect.x;
        const actual = Buffer.from(atlas.data.subarray(start * 4, (start + rect.w) * 4));
        const expected = Buffer.from(f.image.data.subarray(y * rect.w * 4, (y + 1) * rect.w * 4));
        expect(actual.equals(expected), `${f.name} row ${String(y)}`).toBe(true);
        covered.fill(1, start, start + rect.w);
      }
    }
    const paddingAlpha = new Set<number>();
    for (let i = 0; i < covered.length; i++) if (covered[i] === 0) paddingAlpha.add(atlas.data[i * 4 + 3] ?? -1);
    expect([...paddingAlpha]).toEqual([0]);
    expect(out.json.animations['run/go']).toEqual(Array.from({ length: 11 }, (_, i) => `run/go/${nn(i)}`));
    const framePx = frames.reduce((sum, f) => sum + f.image.width * f.image.height, 0);
    expect(out.utilisation).toBeCloseTo(framePx / (atlas.width * atlas.height), 10);
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
        buffer.set(0, 0, { ramp: 'grass', shade: 3, alpha: 0.5 });
        buffer.set(1, 0, { ramp: 'grass', shade: 3, alpha: 0.5 });
      },
    };
    expect(() => buildAtlases([leaky], palette)).toThrow(
      /leaky\/idle\/00: semi-transparent alpha 128 at \(0, 0\)[\s\S]*at \(1, 0\)/,
    );
  });

  it('names variants and companion layers <entity>[.<variant>][@<layer>]/<anim>/<nn>', () => {
    const calls: string[] = [];
    const hut: SpriteGenerator = {
      atlas: 'test',
      id: 'hut',
      size: { w: 2, h: 2 },
      frames: { idle: 2 },
      variants: ['t1', 't2'],
      layers: ['emissive', 'shadow'],
      generate(_rng, { variant, anim, frame: n, buffer, layers }) {
        calls.push(`${String(variant)}/${anim}/${String(n)}`);
        buffer.set(0, 0, { ramp: 'wood', shade: 2 });
        layers.emissive?.set(1, 0, { ramp: 'gold', shade: 4 });
        layers.shadow?.set(0, 1, { ramp: 'ink', shade: 1 });
      },
    };
    const [atlas] = buildAtlases([hut], palette);
    expect(calls).toEqual(['t1/idle/0', 't1/idle/1', 't2/idle/0', 't2/idle/1']);
    expect(Object.keys(atlas?.json.animations ?? {}).sort()).toEqual([
      'hut.t1/idle',
      'hut.t1@emissive/idle',
      'hut.t1@shadow/idle',
      'hut.t2/idle',
      'hut.t2@emissive/idle',
      'hut.t2@shadow/idle',
    ]);
    // frameNames lists exactly what was drawn, without drawing (content tier test, M2-05).
    expect(frameNames(hut).sort()).toEqual(Object.keys(atlas?.json.frames ?? {}).sort());
    expect(frameNames(swatch).sort()).toEqual(
      Object.keys(buildAtlases([swatch], palette)[0]?.json.frames ?? {}).sort(),
    );
    expect(atlas?.json.animations['hut.t2@emissive/idle']).toEqual([
      'hut.t2@emissive/idle/00',
      'hut.t2@emissive/idle/01',
    ]);
    const img = decodePng(atlas?.png ?? Buffer.alloc(0));
    const rect = atlas?.json.frames['hut.t2@emissive/idle/01']?.frame ?? { x: 0, y: 0 };
    const at = (rect.y * img.width + rect.x + 1) * 4;
    expect(hex(((img.data[at] ?? 0) << 16) | ((img.data[at + 1] ?? 0) << 8) | (img.data[at + 2] ?? 0))).toBe('#ffd458');
  });

  it('rejects bad variants and layers', () => {
    const base: SpriteGenerator = { ...swatch, atlas: 'test' };
    expect(() => buildAtlases([{ ...base, variants: ['T1'] }], palette)).toThrow('variant "T1"');
    expect(() => buildAtlases([{ ...base, variants: ['a', 'a'] }], palette)).toThrow('duplicate variants');
    expect(() => buildAtlases([{ ...base, layers: ['glow' as 'shadow'] }], palette)).toThrow('layer "glow"');
  });
});

describe('atlasIndex', () => {
  it('lists every atlas and flags debug-only ones', () => {
    const atlases = buildAtlases([swatch, { ...swatch, atlas: 'khortytsia' }], palette);
    expect(atlasIndex(atlases)).toEqual({
      version: 1,
      atlases: [
        { name: 'debug', json: 'debug.json', debug: true },
        { name: 'khortytsia', json: 'khortytsia.json', debug: false },
      ],
    });
  });
});
