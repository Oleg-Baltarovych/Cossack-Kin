// Layer 4 — ground (parallax 1.0). M0 placeholder: grass + earth strip across the whole world with grass
// tufts every TUFT_STEP px — vertical edges that make camera shifts and pixel blocks easy to check in
// screenshots. Replaced by the generated ground of ART-05. In dev/test builds it also shows the `debug/swatch`
// atlas frame (plan M0-08) standing on the horizon: the atlas pipeline end to end.
import { Graphics, Sprite, type Texture } from 'pixi.js';
import { rampColor, type RampName } from '../palette.ts';
import { contentWidth, createLayer, horizonY, type WorldLayer } from './Layer.ts';

const PARALLAX = 1;
/** Rows from the horizon down: [ramp, index, share of the strip height] (the last row takes the rest). */
const ROWS: readonly (readonly [RampName, number, number])[] = [
  ['grass', 5, 0],
  ['grass', 4, 0.12],
  ['grass', 3, 0.25],
  ['earth', 3, 0.2],
  ['earth', 2, 0.2],
  ['earth', 1, 1],
];
const TUFT_STEP = 16;
const TUFT_HEIGHT = 2;
/** Left edge of the swatch in logical px (visible at camera 0 on every M0 phone). */
const SWATCH_X = 12;

export interface GroundLayerOptions {
  /**
   * `debug` atlas frame `swatch/idle/00` (dev/test builds only; production passes none). Its anchor
   * (bottom-centre) comes from the atlas JSON.
   */
  readonly swatch?: Texture | undefined;
}

export function createGroundLayer(options: GroundLayerOptions): WorldLayer {
  return createLayer(
    'ground',
    PARALLAX,
    (container) => {
      const g = new Graphics();
      container.addChild(g);
      const swatch = options.swatch ? new Sprite({ texture: options.swatch, roundPixels: true }) : null;
      if (swatch) container.addChild(swatch);
      return (size) => {
        g.clear();
        const width = contentWidth(PARALLAX, size);
        const top = horizonY(size.viewH);
        const stripH = size.viewH - top;
        let y = top;
        ROWS.forEach(([ramp, index, share], i) => {
          const isLast = i === ROWS.length - 1;
          const h = isLast ? size.viewH - y : Math.max(1, Math.round(stripH * share));
          if (h > 0) g.rect(0, y, width, h).fill(rampColor(ramp, index));
          y += h;
        });
        for (let x = 0; x < width; x += TUFT_STEP) g.rect(x, top - TUFT_HEIGHT, 1, TUFT_HEIGHT);
        g.fill(rampColor('grass', 6));
        // Whole px: anchor.x · width is an integer for the even-width swatch, so the left edge is SWATCH_X.
        if (swatch) {
          swatch.position.set(SWATCH_X + Math.round(swatch.anchor.x * swatch.width), top);
          swatch.zIndex = top;
        }
      };
    },
    // Placeholder for SPEC §6.2 Y-sorting: buildings and characters (ART-05/M2) set zIndex = foot y.
    { sortableChildren: true },
  );
}
