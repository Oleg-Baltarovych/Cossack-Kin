// Layer 0 — sky (parallax 0, ART-04). The sky band above the horizon is painted on the CPU at logical
// resolution (atmosphere/skyPaint.ts: dithered palette gradient per ART-BIBLE §8 key, sun/moon with halo,
// twinkling stars) into one buffer texture drawn by one sprite. The base is repainted when the game-time
// minute bucket or the view size changes; stars are re-composited on each twinkle step. The sky is the light
// source, so it is not graded by the world LUT (its key colors already are the time of day).
import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import { createCosmeticRng } from '../clock.ts';
import { lutBucket } from '../atmosphere/grading.ts';
import { makeStars, paintSkyBase, paintStars, starDensity, type Star } from '../atmosphere/skyPaint.ts';
import { STARS } from '../atmosphere/config.ts';
import { contentWidth, createLayer, horizonY, type LayerFrame, type WorldLayer } from './Layer.ts';

const PARALLAX = 0;
/** Fixed star-field seed: the same sky every session (and in every screenshot). */
const STAR_SEED = 0x5ea7;

interface Band {
  readonly w: number;
  readonly h: number;
  readonly base: Uint8Array;
  readonly pixels: Uint8Array;
  readonly light: Float32Array;
  readonly stars: readonly Star[];
  readonly source: BufferImageSource;
  readonly texture: Texture;
}

export function createSkyLayer(): WorldLayer {
  return createLayer('sky', PARALLAX, (container) => {
    const sprite = new Sprite({ roundPixels: true, label: 'sky' });
    container.addChild(sprite);
    let band: Band | null = null;
    let baseKey = '';
    let starStep = Number.NaN;

    const freeBand = (): void => {
      if (!band) return;
      sprite.texture = Texture.EMPTY;
      band.texture.destroy(true);
      band = null;
    };

    return {
      resize: (size) => {
        const w = contentWidth(PARALLAX, size);
        const h = horizonY(size.viewH);
        if (band && band.w === w && band.h === h) return;
        freeBand();
        if (w <= 0 || h <= 0) return;
        const pixels = new Uint8Array(w * h * 4);
        const source = new BufferImageSource({
          resource: pixels,
          width: w,
          height: h,
          format: 'rgba8unorm',
          alphaMode: 'premultiplied-alpha', // opaque, so premultiplied = straight
          scaleMode: 'nearest',
          autoGenerateMipmaps: false,
        });
        const texture = new Texture({ source });
        band = {
          w,
          h,
          base: new Uint8Array(w * h * 4),
          pixels,
          light: new Float32Array(w * h),
          stars: makeStars(w, h, createCosmeticRng(STAR_SEED)),
          source,
          texture,
        };
        sprite.texture = texture;
        baseKey = '';
      },
      update: (frame: LayerFrame) => {
        if (!band) return;
        const { cycle } = frame;
        const key = `${String(lutBucket(frame.minutes))}:${cycle.keyA}:${cycle.keyB}`;
        const density = starDensity(cycle);
        const step = density > 0 ? Math.floor(frame.seconds * STARS.hz) : 0;
        const baseChanged = key !== baseKey;
        if (baseChanged) {
          paintSkyBase(band.base, band.light, band.w, band.h, cycle);
          baseKey = key;
        }
        if (!baseChanged && step === starStep) return;
        starStep = step;
        band.pixels.set(band.base);
        paintStars(band.pixels, band.light, band.w, band.h, band.stars, density, frame.seconds);
        band.source.update();
      },
      dispose: freeBand,
    };
  });
}
