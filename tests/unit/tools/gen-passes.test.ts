// Generator passes (plan ART-02, ADR 004): light → texture → AO → dither → colored outline → selective outline →
// quantize, on 8×8 micro-buffers in ramp-index space.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndexBuffer, quantize, type IndexBuffer, type RampName } from '../../../assets-src/gen/lib/buffer.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import {
  compose,
  dither,
  light,
  occlusion,
  outline,
  selectiveOutline,
  type Material,
} from '../../../assets-src/gen/lib/passes.ts';
import { seededRng } from '../../../assets-src/gen/lib/rng.ts';
import { rect, unitNormal } from '../../../assets-src/gen/lib/shapes.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
const rampSize = (ramp: RampName): number => palette.ramps.get(ramp)?.length ?? 0;
const RAMPS = palette.rampNames as readonly RampName[];

const shadeAt = (buf: IndexBuffer, x: number, y: number): number => buf.get(x, y).shade;

function block(
  buf: IndexBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  px: { ramp: RampName; shade: number; normal?: readonly [number, number, number]; depth?: number; material?: number },
): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) buf.set(x, y, px);
}

describe('light (normal · L, sun top-left)', () => {
  it('a face turned to the light ends ≥ 1 ramp step lighter than the face turned away', () => {
    const buf = createIndexBuffer(8, 8, palette);
    block(buf, 0, 0, 4, 8, { ramp: 'wood', shade: 3, normal: unitNormal(-1, 0, 1) });
    block(buf, 4, 0, 4, 8, { ramp: 'wood', shade: 3, normal: unitNormal(1, 0, 1) });
    light(buf);
    dither(buf, rampSize);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        for (let x2 = 4; x2 < 8; x2++) expect(shadeAt(buf, x, y)).toBeGreaterThanOrEqual(shadeAt(buf, x2, y) + 1);
      }
    }
  });

  it('an upward face is lit, a downward face shaded, a face toward the viewer keeps its base shade', () => {
    const buf = createIndexBuffer(8, 3, palette);
    block(buf, 0, 0, 8, 1, { ramp: 'plaster', shade: 3, normal: unitNormal(0, -1, 1) });
    block(buf, 0, 1, 8, 1, { ramp: 'plaster', shade: 3 });
    block(buf, 0, 2, 8, 1, { ramp: 'plaster', shade: 3, normal: unitNormal(0, 1, 1) });
    light(buf);
    expect(shadeAt(buf, 3, 0)).toBeGreaterThan(3.5);
    expect(shadeAt(buf, 3, 1)).toBe(3);
    expect(shadeAt(buf, 3, 2)).toBeLessThan(2.5);
  });

  it('is directional, not pillow shading: a sphere is lightest top-left, darkest bottom-right', () => {
    const buf = createIndexBuffer(8, 8, palette);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const nx = (x - 3.5) / 4;
        const ny = (y - 3.5) / 4;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        buf.set(x, y, { ramp: 'stone', shade: 3, normal: unitNormal(nx, ny, nz) });
      }
    }
    light(buf);
    expect(shadeAt(buf, 1, 1)).toBeGreaterThan(shadeAt(buf, 3, 3));
    expect(shadeAt(buf, 3, 3)).toBeGreaterThan(shadeAt(buf, 6, 6));
    // The right edge is darker than the left edge on the same row (no symmetric rim falloff).
    expect(shadeAt(buf, 0, 4)).toBeGreaterThan(shadeAt(buf, 7, 4));
  });
});

describe('occlusion (AO + cast shadow)', () => {
  it('darkens the inner corner more than an edge and leaves open px untouched', () => {
    const buf = createIndexBuffer(8, 8, palette);
    block(buf, 0, 0, 8, 8, { ramp: 'plaster', shade: 4 });
    block(buf, 0, 0, 8, 1, { ramp: 'plaster', shade: 4, depth: 3 });
    block(buf, 0, 0, 1, 8, { ramp: 'plaster', shade: 4, depth: 3 });
    occlusion(buf, { radius: 1, strength: 1 });
    const corner = shadeAt(buf, 1, 1);
    const edge = shadeAt(buf, 5, 1);
    expect(corner).toBeLessThan(edge);
    expect(edge).toBeLessThan(4);
    expect(shadeAt(buf, 5, 5)).toBe(4);
  });

  it('a protruding part casts its shadow down-right (away from the top-left sun), not up-left', () => {
    const buf = createIndexBuffer(8, 8, palette);
    block(buf, 0, 0, 8, 8, { ramp: 'plaster', shade: 4 });
    block(buf, 3, 3, 2, 2, { ramp: 'wood', shade: 3, depth: 4 });
    occlusion(buf, { radius: 0, strength: 0, cast: { length: 3, strength: 1.5 } });
    expect(shadeAt(buf, 5, 5)).toBeLessThan(4);
    expect(shadeAt(buf, 2, 2)).toBe(4);
    expect(shadeAt(buf, 3, 3)).toBe(3);
  });

  it('transparent px never occlude', () => {
    const buf = createIndexBuffer(8, 8, palette);
    block(buf, 2, 2, 4, 4, { ramp: 'grass', shade: 3 });
    occlusion(buf, { radius: 2, strength: 1, cast: { length: 3, strength: 1 } });
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) expect(shadeAt(buf, x, y)).toBe(3);
  });
});

describe('dither (Bayer 4×4)', () => {
  it('turns fractional shades into whole ramp indices, mixing only the two neighbouring steps', () => {
    const buf = createIndexBuffer(8, 8, palette);
    block(buf, 0, 0, 8, 8, { ramp: 'sky', shade: 2.5 });
    dither(buf, rampSize);
    const seen = new Set<number>();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) seen.add(shadeAt(buf, x, y));
    expect([...seen].sort()).toEqual([2, 3]);
  });

  it('with a narrow spread only near-half fractions dither; others round', () => {
    const buf = createIndexBuffer(8, 2, palette);
    block(buf, 0, 0, 8, 1, { ramp: 'sky', shade: 2.2 });
    block(buf, 0, 1, 8, 1, { ramp: 'sky', shade: 2.8 });
    dither(buf, rampSize, { spread: 0.4 });
    for (let x = 0; x < 8; x++) {
      expect(shadeAt(buf, x, 0)).toBe(2);
      expect(shadeAt(buf, x, 1)).toBe(3);
    }
  });

  it('clamps to the ramp', () => {
    const buf = createIndexBuffer(2, 1, palette);
    buf.set(0, 0, { ramp: 'ink', shade: -3 });
    buf.set(1, 0, { ramp: 'ink', shade: 12 });
    dither(buf, rampSize);
    expect([shadeAt(buf, 0, 0), shadeAt(buf, 1, 0)]).toEqual([0, rampSize('ink') - 1]);
  });
});

describe('colored outline + selective outline', () => {
  const woodBlock = (): IndexBuffer => {
    const buf = createIndexBuffer(8, 8, palette);
    block(buf, 2, 2, 4, 4, { ramp: 'wood', shade: 4 });
    return buf;
  };

  it('outer outline takes the neighbour ramp −2 on the shadow side, never ink', () => {
    const buf = woodBlock();
    outline(buf, rampSize, { mode: 'outer' });
    expect(buf.get(6, 3)).toMatchObject({ ramp: 'wood', shade: 2 });
    expect(buf.get(3, 6)).toMatchObject({ ramp: 'wood', shade: 2 });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(buf.get(x, y).ramp).not.toBe('ink');
    // Diagonal corners stay empty (4-neighbour outline keeps the silhouette crisp).
    expect(buf.get(6, 6).ramp).toBeNull();
  });

  it('inner outline replaces the silhouette px with −2 of the inward neighbour', () => {
    const buf = woodBlock();
    outline(buf, rampSize, { mode: 'inner' });
    expect(buf.get(5, 3)).toMatchObject({ ramp: 'wood', shade: 2 });
    expect(buf.get(3, 3)).toMatchObject({ ramp: 'wood', shade: 4 });
    expect(buf.get(6, 3).ramp).toBeNull();
  });

  it('an ink object is outlined in ink 1 at the darkest, never ink[0] automatically', () => {
    const buf = createIndexBuffer(8, 8, palette);
    block(buf, 2, 2, 4, 4, { ramp: 'ink', shade: 1 });
    outline(buf, rampSize, { mode: 'outer' });
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const px = buf.get(x, y);
        if (px.ramp !== null) expect(px.shade).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('a dark outline step never goes below the ramp: shade 1 → 0 of the same ramp', () => {
    const buf = createIndexBuffer(8, 8, palette);
    block(buf, 2, 2, 4, 4, { ramp: 'grass', shade: 1 });
    outline(buf, rampSize, { mode: 'outer' });
    expect(buf.get(6, 3)).toMatchObject({ ramp: 'grass', shade: 0 });
  });

  it('selective outline: the top-left (lit) side lightens or vanishes, the shadow side stays dark', () => {
    const lighter = woodBlock();
    selectiveOutline(lighter, outline(lighter, rampSize, { mode: 'outer' }), { lit: 'lighter' });
    expect(lighter.get(1, 3)).toMatchObject({ ramp: 'wood', shade: 3 });
    expect(lighter.get(3, 1)).toMatchObject({ ramp: 'wood', shade: 3 });
    expect(lighter.get(6, 3)).toMatchObject({ ramp: 'wood', shade: 2 });

    const vanish = woodBlock();
    selectiveOutline(vanish, outline(vanish, rampSize, { mode: 'outer' }), { lit: 'vanish' });
    expect(vanish.get(1, 3).ramp).toBeNull();
    expect(vanish.get(3, 1).ramp).toBeNull();
    expect(vanish.get(6, 3)).toMatchObject({ ramp: 'wood', shade: 2 });
  });

  it('internal lines appear only where the material changes', () => {
    const buf = createIndexBuffer(8, 4, palette);
    block(buf, 0, 0, 4, 4, { ramp: 'plaster', shade: 5, depth: 0, material: 1 });
    block(buf, 4, 0, 4, 4, { ramp: 'wood', shade: 4, depth: 1, material: 2 });
    outline(buf, rampSize, { mode: 'inner', edges: 'opaque', internal: true });
    // The px behind (lower depth) at the material seam gets a 1-step line; the rest of the plaster is untouched.
    expect(buf.get(3, 1)).toMatchObject({ ramp: 'plaster', shade: 4 });
    expect(buf.get(2, 1)).toMatchObject({ ramp: 'plaster', shade: 5 });
    expect(buf.get(4, 1)).toMatchObject({ ramp: 'wood', shade: 4 });
  });
});

describe('compose (full pass chain)', () => {
  const flat: Material = {
    id: 3,
    base: () => ({ ramp: 'thatch', shade: 3 }),
    texture: (f) => ((f.x + f.y) % 3 === 0 ? 0.6 : 0),
  };

  it('runs paint → light → texture → AO → dither → outline and leaves whole shades', () => {
    const buf = createIndexBuffer(8, 8, palette);
    compose(buf, [{ shape: rect(1, 1, 6, 6), material: flat, partId: 1 }], rampSize, { outline: { mode: 'inner' } });
    for (let y = 1; y < 7; y++) {
      for (let x = 1; x < 7; x++) {
        const px = buf.get(x, y);
        expect(px).toMatchObject({ ramp: 'thatch', material: 3, partId: 1 });
        expect(Number.isInteger(px.shade)).toBe(true);
      }
    }
    expect(buf.get(0, 0).ramp).toBeNull();
  });

  it('writes the emissive layer only where the material emits', () => {
    const buf = createIndexBuffer(8, 8, palette);
    const glow = createIndexBuffer(8, 8, palette);
    const glass: Material = {
      id: 4,
      base: () => ({ ramp: 'cloth', shade: 1 }),
      emissive: () => ({ ramp: 'gold', shade: 4 }),
    };
    compose(
      buf,
      [
        { shape: rect(0, 0, 8, 8), material: flat },
        { shape: rect(3, 3, 2, 2), material: glass, depth: -1 },
      ],
      rampSize,
      { emissive: glow },
    );
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const inside = x >= 3 && x < 5 && y >= 3 && y < 5;
        expect(glow.get(x, y).ramp).toBe(inside ? 'gold' : null);
      }
    }
  });

  it('never produces a color outside the palette — 200 random micro-buffers through every pass', () => {
    const rng = seededRng('passes-palette-property');
    for (let trial = 0; trial < 200; trial++) {
      const buf = createIndexBuffer(8, 8, palette);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (rng() < 0.25) continue;
          const ramp = RAMPS[Math.floor(rng() * RAMPS.length)] ?? 'ink';
          buf.set(x, y, {
            ramp,
            shade: rng() * 14 - 4,
            normal: unitNormal(rng() * 2 - 1, rng() * 2 - 1, rng()),
            depth: Math.floor(rng() * 6) - 2,
            material: Math.floor(rng() * 3),
          });
        }
      }
      light(buf, { strength: rng() * 6 });
      occlusion(buf, { radius: 2, strength: rng() * 3, cast: { length: 3, strength: rng() * 2 } });
      dither(buf, rampSize);
      selectiveOutline(buf, outline(buf, rampSize, { mode: rng() < 0.5 ? 'outer' : 'inner', internal: true }), {
        lit: rng() < 0.5 ? 'vanish' : 'lighter',
      });
      const img = quantize(buf, palette);
      for (let i = 0; i < 64; i++) {
        if ((img.data[i * 4 + 3] ?? 0) === 0) continue;
        const rgb = ((img.data[i * 4] ?? 0) << 16) | ((img.data[i * 4 + 1] ?? 0) << 8) | (img.data[i * 4 + 2] ?? 0);
        expect(palette.colors.has(rgb), `trial ${String(trial)} px ${String(i)}`).toBe(true);
      }
    }
  });
});
