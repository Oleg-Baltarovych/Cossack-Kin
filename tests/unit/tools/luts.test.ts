import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAllLuts, buildLut, lutLookup, paletteColors, type Rgb } from '../../../assets-src/luts/gen.ts';
import {
  GRADE_LOOKS,
  LUT_SIZE,
  RAIN_GRADE_LOOKS,
  SKY_KEY_IDS,
  type GradeLook,
} from '../../../src/render/atmosphere/config.ts';

const master = JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')) as {
  ramps: Record<string, string[]>;
};
const palette = paletteColors(master);
const hex = (h: string): Rgb => [
  Number.parseInt(h.slice(1, 3), 16),
  Number.parseInt(h.slice(3, 5), 16),
  Number.parseInt(h.slice(5, 7), 16),
];
const luma = ([r, g, b]: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ramp = (name: string, i: number): Rgb => hex(master.ramps[name]?.[i] ?? '#000000');
/** HSV hue in degrees. */
const hue = ([r, g, b]: Rgb): number => {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('buildLut', () => {
  it('writes a 256×16 RGBA strip, opaque, deterministic per key', () => {
    for (const id of SKY_KEY_IDS) {
      const a = buildLut(GRADE_LOOKS[id], palette);
      expect(a.length).toBe(LUT_SIZE * LUT_SIZE * LUT_SIZE * 4);
      for (let i = 3; i < a.length; i += 4) expect(a[i]).toBe(255);
      expect(buildLut(GRADE_LOOKS[id], palette)).toEqual(a);
    }
  });

  it('day is (almost) neutral: no lattice color moves by more than 6/255', () => {
    const lut = buildLut(GRADE_LOOKS.day, palette);
    for (let b = 0; b < LUT_SIZE; b++)
      for (let g = 0; g < LUT_SIZE; g++)
        for (let r = 0; r < LUT_SIZE; r++) {
          const out = lutLookup(lut, [r * 17, g * 17, b * 17]);
          expect(Math.abs(out[0] - r * 17)).toBeLessThanOrEqual(6);
          expect(Math.abs(out[1] - g * 17)).toBeLessThanOrEqual(6);
          expect(Math.abs(out[2] - b * 17)).toBeLessThanOrEqual(6);
        }
  });

  it('night is never black: pure black maps to about ink 2, and night is blue', () => {
    const lut = buildLut(GRADE_LOOKS.night, palette);
    const black = lutLookup(lut, [0, 0, 0]);
    expect(luma(black)).toBeGreaterThanOrEqual(luma(hex(master.ramps['ink']?.[2] ?? '#000000')) - 4);
    const plaster = lutLookup(lut, hex(master.ramps['plaster']?.[4] ?? '#000000'));
    expect(plaster[2]).toBeGreaterThan(plaster[0]); // white walls turn moonlit blue
    expect(luma(plaster)).toBeLessThan(luma(hex(master.ramps['plaster']?.[4] ?? '#000000')) * 0.75);
  });

  it('golden hour (M2-29, ART-19 deferred 1): the meadow sinks to a deep warm olive, lit walls and thatch stay bright', () => {
    const lut = buildLut(GRADE_LOOKS.golden, palette);
    // The meadow's body (grass 2–3): a tone darker than by day, olive (yellow-green, green still ≥ red), never brown mud.
    for (const i of [2, 3]) {
      const src = ramp('grass', i);
      const grass = lutLookup(lut, src);
      expect(luma(grass), `grass ${String(i)}`).toBeLessThan(luma(src) * 0.8);
      expect(grass[1], `grass ${String(i)} not brown`).toBeGreaterThanOrEqual(grass[0]);
      expect(hue(grass), `grass ${String(i)} olive`).toBeGreaterThanOrEqual(60);
      expect(hue(grass), `grass ${String(i)} olive`).toBeLessThanOrEqual(100);
      expect(grass[0] - grass[1]).toBeGreaterThan(src[0] - src[1]); // warmer: red gained on green
    }
    // Sunlit whitewash and thatch keep (or gain) their value: against the darker meadow they glow (Kuindzhi).
    for (const [name, i] of [
      ['plaster', 4],
      ['plaster', 5],
      ['thatch', 4],
      ['thatch', 5],
    ] as const) {
      const src = ramp(name, i);
      const lit = lutLookup(lut, src);
      expect(luma(lit), `${name} ${String(i)}`).toBeGreaterThanOrEqual(luma(src) * 0.97);
      expect(lit[0], `${name} ${String(i)} warm`).toBeGreaterThan(lit[2] + 30);
    }
    // Wall-to-meadow contrast clearly above the day's.
    const dayLut = buildLut(GRADE_LOOKS.day, palette);
    const ratio = (l: Uint8Array): number =>
      luma(lutLookup(l, ramp('plaster', 5))) / luma(lutLookup(l, ramp('grass', 3)));
    expect(ratio(lut)).toBeGreaterThan(ratio(dayLut) * 1.3);
    const earth = lutLookup(lut, ramp('earth', 0));
    expect(Math.abs(earth[0] - ramp('ink', 2)[0])).toBeLessThan(20); // deep: about ink 2 (a ramp step darker than by day)
    expect(earth[2]).toBeGreaterThan(ramp('earth', 0)[2]); // toward violet ink 3, away from brown
    expect(earth[0] - earth[2]).toBeLessThan(ramp('earth', 0)[0] - ramp('earth', 0)[2]);
  });

  it('night ground (M0 bands): blue hue, top band no lighter than cloth 1 and darker than the cloth 2 horizon, never black, bands distinct', () => {
    const lut = buildLut(GRADE_LOOKS.night, palette);
    // Ground placeholder bands, top → bottom (render/layers/Ground.ts).
    const bands = [ramp('grass', 4), ramp('grass', 3), ramp('earth', 3), ramp('earth', 2), ramp('earth', 1)].map((c) =>
      lutLookup(lut, c),
    );
    const top = bands[0] ?? [0, 0, 0];
    expect(luma(top)).toBeLessThanOrEqual(luma(ramp('cloth', 1)) + 2);
    expect(luma(top)).toBeLessThan(luma(ramp('cloth', 2)));
    for (const b of bands) {
      expect(hue(b)).toBeGreaterThanOrEqual(220);
      expect(hue(b)).toBeLessThanOrEqual(240);
      expect(luma(b)).toBeGreaterThanOrEqual(luma(ramp('ink', 2)) - 3);
    }
    for (let i = 1; i < bands.length; i++) {
      const [a0, a1, a2] = bands[i - 1] ?? [0, 0, 0];
      const [b0, b1, b2] = bands[i] ?? [0, 0, 0];
      expect(
        Math.abs(a0 - b0) + Math.abs(a1 - b1) + Math.abs(a2 - b2),
        `bands ${String(i)}/${String(i + 1)}`,
      ).toBeGreaterThanOrEqual(6);
    }
  });

  it('night: whitewash glows pale cool blue (Kuindzhi khatas)', () => {
    const lut = buildLut(GRADE_LOOKS.night, palette);
    for (const i of [5, 6]) {
      const wall = lutLookup(lut, ramp('plaster', i));
      expect(hue(wall)).toBeGreaterThan(185);
      expect(hue(wall)).toBeLessThan(220);
      expect(luma(wall)).toBeGreaterThan(130);
      expect(luma(wall)).toBeLessThan(luma(ramp('water', 6)));
    }
  });

  it('golden hour spares the reds and the sunlit timber the curve would sink (M2-29 A4)', () => {
    const lut = buildLut(GRADE_LOOKS.golden, palette);
    const noKeep = buildLut({ ...GRADE_LOOKS.golden, hueKeep: [] }, palette);
    // Mallow and banner reds keep most of their value (A3: they drowned in the olive).
    for (const i of [3, 4]) {
      const src = ramp('crimson', i);
      expect(luma(lutLookup(lut, src)), `crimson ${String(i)}`).toBeGreaterThan(luma(lutLookup(noKeep, src)) * 1.15);
      expect(luma(lutLookup(lut, src)), `crimson ${String(i)}`).toBeGreaterThanOrEqual(luma(src) * 0.85);
    }
    // Lit log faces of the Sich (wood 4) keep more light than with the plain curve.
    const wood = ramp('wood', 4);
    expect(luma(lutLookup(lut, wood))).toBeGreaterThan(luma(lutLookup(noKeep, wood)) * 1.1);
    // The meadow is not spared: grass 2–4 grade as with the plain curve.
    for (const i of [2, 3, 4]) {
      const src = ramp('grass', i);
      expect(Math.abs(luma(lutLookup(lut, src)) - luma(lutLookup(noKeep, src))), `grass ${String(i)}`).toBeLessThan(3);
    }
  });

  it('rain (M2-29 A4): the daylight keys grey the land, and rain at golden hour is no longer sunk below the rain morning', () => {
    const chroma = ([r, g, b]: Rgb): number => Math.max(r, g, b) - Math.min(r, g, b);
    // Dusk and night tint the land to one cool hue already: their rain grade is the clear one.
    for (const id of ['dawn', 'morning', 'day', 'golden'] as const) {
      const clear = buildLut(GRADE_LOOKS[id], palette);
      const rain = buildLut(RAIN_GRADE_LOOKS[id], palette);
      for (const [name, i] of [
        ['grass', 3],
        ['grass', 4],
        ['crimson', 4],
      ] as const) {
        const src = ramp(name, i);
        expect(chroma(lutLookup(rain, src)), `${id} ${name} ${String(i)}`).toBeLessThan(
          chroma(lutLookup(clear, src)) * 0.85,
        );
      }
    }
    const meadow = (look: GradeLook): number => luma(lutLookup(buildLut(look, palette), ramp('grass', 3)));
    expect(meadow(RAIN_GRADE_LOOKS.golden)).toBeGreaterThan(meadow(GRADE_LOOKS.golden) * 1.15);
    expect(meadow(RAIN_GRADE_LOOKS.golden)).toBeGreaterThanOrEqual(meadow(RAIN_GRADE_LOOKS.morning) * 0.85);
    expect(meadow(RAIN_GRADE_LOOKS.golden)).toBeLessThan(meadow(RAIN_GRADE_LOOKS.day));
    // Still warm in the evening: a mid grey leans red.
    const grey = lutLookup(buildLut(RAIN_GRADE_LOOKS.golden, palette), [128, 128, 128]);
    expect(grey[0]).toBeGreaterThan(grey[2] + 8);
  });

  it('builds the clear and the rain set, deterministic', () => {
    const a = buildAllLuts(palette);
    expect(Object.keys(a.rain)).toEqual([...SKY_KEY_IDS]);
    expect(a.rain.golden).not.toEqual(a.clear.golden);
    expect(buildAllLuts(palette).rain.day).toEqual(a.rain.day);
  });

  it('golden hour warms a mid grey, dusk and night darken it', () => {
    const grey: Rgb = [128, 128, 128];
    const golden = lutLookup(buildLut(GRADE_LOOKS.golden, palette), grey);
    expect(golden[0]).toBeGreaterThan(golden[2] + 15);
    const dusk = lutLookup(buildLut(GRADE_LOOKS.dusk, palette), grey);
    const night = lutLookup(buildLut(GRADE_LOOKS.night, palette), grey);
    expect(luma(dusk)).toBeLessThan(luma(grey));
    expect(luma(night)).toBeLessThan(luma(dusk));
  });
});
