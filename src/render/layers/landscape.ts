// Shared CPU-painted landscape layers (ART-08): the far (0.2) and mid (0.5) planes of the land's `farPlanes`, painted
// by atmosphere/landscapePaint.ts into one buffer texture per layer that stands on the horizon. Like the sky they are
// not LUT-graded (their colours come from the sky chain of the key), so App draws them right after the sky. Repainted
// when the game-time LUT bucket or the key pair changes, or on resize.
import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import type { FarPlane } from '../../content/villages/khortytsia.layout.ts';
import { FOG, HAZE_DEPTH_K, HAZE_LEVELS, RAIN_HAZE } from '../atmosphere/config.ts';
import type { DayCycle } from '../atmosphere/dayCycle.ts';
import { keyLevel } from '../atmosphere/emissive.ts';
import { lutBucket } from '../atmosphere/grading.ts';
import { paintPlane, planeProfile, type PaintPlaneOptions, type Profile } from '../atmosphere/landscapePaint.ts';
import type { Weather } from '../settings.ts';
import { contentWidth, createLayer, horizonY, type LayerId, type WorldLayer } from './Layer.ts';

/** Buffer height (rows above the horizon): tallest plane + crest trees, with margin. */
export const PLANE_ROWS = 60;

/** Air haze and the plane options it implies for this key and weather. */
export function airHaze(cycle: DayCycle, weather: Weather): PaintPlaneOptions {
  const clear = keyLevel(HAZE_LEVELS, cycle);
  if (weather === 'fog') {
    return { haze: Math.max(clear, FOG.haze), depthScale: FOG.depthScale, fog: true, maxDepth: FOG.maxDepth, weather };
  }
  // Rain thickens the air: the far planes sink toward the grey horizon (RAIN_HAZE).
  const haze = weather === 'rain' ? Math.max(clear, RAIN_HAZE) : clear;
  return { haze, depthScale: 1 - HAZE_DEPTH_K * haze, fog: false, maxDepth: Number.POSITIVE_INFINITY, weather };
}

export interface LandscapeLayerOptions {
  readonly id: Extract<LayerId, 'far' | 'mid'>;
  readonly parallax: number;
  readonly planes: readonly FarPlane[];
  readonly weather: Weather;
}

export function createLandscapeLayer({ id, parallax, planes, weather }: LandscapeLayerOptions): WorldLayer {
  return createLayer(id, parallax, (container) => {
    const sprite = new Sprite({ roundPixels: true, label: id });
    container.addChild(sprite);
    let buffer: { w: number; pixels: Uint8Array; source: BufferImageSource; texture: Texture } | null = null;
    let profiles: Profile[] = [];
    let paintedKey = '';

    const free = (): void => {
      if (!buffer) return;
      sprite.texture = Texture.EMPTY;
      buffer.texture.destroy(true);
      buffer = null;
    };

    return {
      resize: (size) => {
        const w = contentWidth(parallax, size);
        sprite.y = horizonY(size.viewH) - PLANE_ROWS;
        if (buffer?.w === w) return;
        free();
        if (w <= 0 || planes.length === 0) return;
        const pixels = new Uint8Array(w * PLANE_ROWS * 4);
        const source = new BufferImageSource({
          resource: pixels,
          width: w,
          height: PLANE_ROWS,
          format: 'rgba8unorm',
          // Binary alpha: transparent px are all-zero, opaque px are plain colours, so premultiplied = straight.
          alphaMode: 'premultiplied-alpha',
          scaleMode: 'nearest',
          autoGenerateMipmaps: false,
        });
        const texture = new Texture({ source });
        buffer = { w, pixels, source, texture };
        sprite.texture = texture;
        profiles = planes.map((p) => planeProfile(p, w));
        paintedKey = '';
      },
      update: ({ minutes, cycle }) => {
        if (!buffer) return;
        const key = `${String(lutBucket(minutes))}:${cycle.keyA}:${cycle.keyB}`;
        if (key === paintedKey) return;
        paintedKey = key;
        buffer.pixels.fill(0);
        const air = airHaze(cycle, weather);
        planes.forEach((plane, i) => {
          const profile = profiles[i];
          if (buffer && profile) paintPlane(buffer.pixels, buffer.w, PLANE_ROWS, plane, profile, cycle, air);
        });
        buffer.source.update();
      },
      dispose: free,
    };
  });
}
