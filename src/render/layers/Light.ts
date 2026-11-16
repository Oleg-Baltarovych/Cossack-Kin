// Layer 7 — light and atmosphere (screen-fixed, ungraded; ART-08): the haze band over the ground under the horizon,
// horizon-coloured px on a thinning Bayer share (atmosphere/landscapePaint.ts). Strength follows the time of day
// (HAZE_LEVELS: morning mist, clear noon) and `weather=fog` makes it a tall dense bank that swallows the back row.
// Repainted when the LUT bucket or key pair changes. God rays come with ART-10.
import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import { FOG, HAZE_BAND } from '../atmosphere/config.ts';
import { lutBucket } from '../atmosphere/grading.ts';
import { paintHazeBand } from '../atmosphere/landscapePaint.ts';
import type { Weather } from '../settings.ts';
import { airHaze } from './landscape.ts';
import { createLayer, horizonY, type WorldLayer } from './Layer.ts';

const MAX_ROWS = Math.max(FOG.bandRows + FOG.leadRows, HAZE_BAND.rows[1]);

export function createLightLayer(weather: Weather): WorldLayer {
  return createLayer('light', 0, (container) => {
    const sprite = new Sprite({ roundPixels: true, label: 'haze-band' });
    container.addChild(sprite);
    let buffer: { w: number; pixels: Uint8Array; source: BufferImageSource; texture: Texture } | null = null;
    let paintedKey = '';
    const free = (): void => {
      if (!buffer) return;
      sprite.texture = Texture.EMPTY;
      buffer.texture.destroy(true);
      buffer = null;
    };
    const lead = weather === 'fog' ? FOG.leadRows : 0;
    return {
      resize: (size) => {
        sprite.y = horizonY(size.viewH) - lead;
        if (buffer?.w === size.viewW) return;
        free();
        const w = size.viewW;
        if (w <= 0) return;
        const pixels = new Uint8Array(w * MAX_ROWS * 4);
        const source = new BufferImageSource({
          resource: pixels,
          width: w,
          height: MAX_ROWS,
          format: 'rgba8unorm',
          alphaMode: 'premultiplied-alpha',
          scaleMode: 'nearest',
          autoGenerateMipmaps: false,
        });
        const texture = new Texture({ source });
        buffer = { w, pixels, source, texture };
        sprite.texture = texture;
        paintedKey = '';
      },
      update: ({ minutes, cycle }) => {
        if (!buffer) return;
        const key = `${String(lutBucket(minutes))}:${cycle.keyA}:${cycle.keyB}`;
        if (key === paintedKey) return;
        paintedKey = key;
        const { haze } = airHaze(cycle, weather);
        const fog = weather === 'fog';
        const rows = fog
          ? FOG.bandRows
          : Math.round(HAZE_BAND.rows[0] + (HAZE_BAND.rows[1] - HAZE_BAND.rows[0]) * haze);
        const cover = fog ? FOG.bandCover : HAZE_BAND.cover * haze;
        paintHazeBand(buffer.pixels, buffer.w, Math.min(rows, MAX_ROWS - lead), cycle, cover, lead);
        buffer.source.update();
      },
      dispose: free,
    };
  });
}
