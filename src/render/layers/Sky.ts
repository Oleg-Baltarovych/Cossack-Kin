// Layer 0 — sky (parallax 0). M0 placeholder: banded day gradient with 1-row checker dither between
// bands, drawn at logical resolution. The time-of-day sky with ART-BIBLE §8 ramps replaces it in ART-04.
import { Graphics } from 'pixi.js';
import { rampColor, type RampName } from '../palette.ts';
import { contentWidth, createLayer, horizonY, type WorldLayer } from './Layer.ts';

const PARALLAX = 0;
/** Top → horizon. Temporary day colors (light end of `water`) until the `sky` keys of ART-04. */
const BANDS: readonly (readonly [RampName, number])[] = [
  ['water', 4],
  ['water', 5],
  ['water', 6],
  ['water', 7],
];

export function createSkyLayer(): WorldLayer {
  return createLayer('sky', PARALLAX, (container) => {
    const g = new Graphics();
    container.addChild(g);
    return (size) => {
      g.clear();
      const width = contentWidth(PARALLAX, size);
      const bottom = horizonY(size.viewH);
      let top = 0;
      BANDS.forEach(([ramp, index], i) => {
        const end = i === BANDS.length - 1 ? bottom : Math.round((bottom * (i + 1)) / BANDS.length);
        g.rect(0, top, width, end - top).fill(rampColor(ramp, index));
        const next = BANDS[i + 1];
        if (next && end > top) {
          // Checker row on the last line of the band mixes in the next color (no banding edge).
          for (let x = 0; x < width; x += 2) g.rect(x, end - 1, 1, 1);
          g.fill(rampColor(next[0], next[1]));
        }
        top = end;
      });
    };
  });
}
