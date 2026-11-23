// The sky is the light source and is not graded (ART-04, ART-BIBLE §8.2): the painter writes master-palette colours
// only, over the whole band — the @screens palette check sees just the rows above the clouds, and only at keys without
// light shafts (additive light over the sky, ART-10), so this is the full-coverage guard.
import { describe, expect, it } from 'vitest';
import master from '../../../assets-src/palettes/master.json';
import { SKY_KEYS } from '../../../src/render/atmosphere/config.ts';
import { dayCycle } from '../../../src/render/atmosphere/dayCycle.ts';
import { paintSkyBase } from '../../../src/render/atmosphere/skyPaint.ts';
import { WEATHERS } from '../../../src/render/settings.ts';

const PALETTE = new Set(
  Object.values(master.ramps).flatMap((ramp) => ramp.map((hex) => Number.parseInt(hex.slice(1), 16))),
);
/** A 390×844 frame's sky band (horizon ≈ 270 rows) and a taller one. */
const SIZES = [
  { w: 131, h: 271 },
  { w: 138, h: 330 },
] as const;
/** Each key in full, and the middle of the transition after it. */
const MINUTES = SKY_KEYS.flatMap((k, i) => {
  const next = SKY_KEYS[(i + 1) % SKY_KEYS.length]?.at ?? k.at;
  const end = next > k.at ? next : next + 24 * 60;
  return [k.at, Math.round((k.at + k.hold + end) / 2) % (24 * 60)];
});

describe('paintSkyBase', () => {
  for (const weather of WEATHERS)
    it(`writes only master-palette colours (${weather}, every key and transition)`, () => {
      for (const { w, h } of SIZES)
        for (const minutes of MINUTES) {
          const out = new Uint8Array(w * h * 4);
          paintSkyBase(out, new Float32Array(w * h), w, h, dayCycle(minutes), weather);
          const off = new Set<string>();
          for (let i = 0; i < out.length; i += 4) {
            const c = ((out[i] ?? 0) << 16) | ((out[i + 1] ?? 0) << 8) | (out[i + 2] ?? 0);
            if (!PALETTE.has(c)) off.add(`#${c.toString(16).padStart(6, '0')}`);
          }
          expect([...off].slice(0, 5), `${String(minutes)} min ${String(w)}×${String(h)}`).toEqual([]);
        }
    });
});
