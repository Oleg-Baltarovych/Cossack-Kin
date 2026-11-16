import { describe, expect, it } from 'vitest';
import master from '../../../assets-src/palettes/master.json';
import { rampColor, rampCss, rampSize } from '../../../src/render/palette.ts';

describe('rampColor', () => {
  it('reads colors from master.json as 0xRRGGBB numbers', () => {
    expect(rampColor('ink', 0)).toBe(Number.parseInt(String(master.ramps.ink[0]).slice(1), 16));
    expect(rampColor('water', 7)).toBe(Number.parseInt(String(master.ramps.water[7]).slice(1), 16));
  });

  it('pins a literal value so a broken JSON import cannot pass by comparing with itself', () => {
    expect(rampColor('ink', 0)).toBe(0x140e17);
    expect(rampCss('ink', 0)).toBe('#140e17');
  });

  it('negative index counts from the light end', () => {
    expect(rampColor('grass', -1)).toBe(rampColor('grass', rampSize('grass') - 1));
  });

  it('throws on an index outside the ramp', () => {
    expect(() => rampColor('ink', 4)).toThrow(/ink/);
    expect(() => rampColor('ink', -5)).toThrow(/ink/);
  });
});
