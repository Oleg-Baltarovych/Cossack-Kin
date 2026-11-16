import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildLut, lutLookup, paletteColors, type Rgb } from '../../../assets-src/luts/gen.ts';
import { GRADE_LOOKS, LUT_SIZE, SKY_KEY_IDS } from '../../../src/render/atmosphere/config.ts';

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

  it('golden hour: mid greens turn olive/ochre, darkest tones lean to ink 3 (lit by sunset)', () => {
    const lut = buildLut(GRADE_LOOKS.golden, palette);
    const grass = lutLookup(lut, ramp('grass', 5)); // #84ad45
    expect(grass[0]).toBeGreaterThan(grass[1] - 12); // red caught up with green: olive/ochre, not lime
    expect(grass[2]).toBeLessThan(grass[1] - 40);
    const earth = lutLookup(lut, ramp('earth', 0));
    expect(Math.abs(earth[0] - ramp('ink', 3)[0])).toBeLessThan(20);
    expect(earth[2]).toBeGreaterThan(ramp('earth', 0)[2]); // toward violet ink 3, away from brown
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
