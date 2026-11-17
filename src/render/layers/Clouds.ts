// Layer 1 — clouds (parallax 0.1, ART-07). Volumetric cloud sprites (`cloud.<variant>` in the scene atlas) drift
// right with the wind and wrap around the layer's width; their base rows sit at a share of the sky height, so the
// layout follows the horizon on every phone. Clouds low over the horizon are squashed and see-through (far away).
// Per key (CLOUD_LOOKS): a brightness multiply before the LUT (dark masses at dusk and night) and a tinted rim frame
// along the underside and sun side (glow of a low sun). The ground's cloud shadows live in Ground.ts. A `cloudMask`
// for light shafts comes with ART-10.
import type { Weather } from '../settings.ts';
import { Container, Sprite, type Texture } from 'pixi.js';
import {
  CLOUD_LOOKS,
  CLOUD_WRAP_MARGIN,
  CLOUDS,
  LOW_CLOUD,
  RAIN_CLOUD_BRIGHTNESS,
  type CloudPlacement,
} from '../atmosphere/config.ts';
import type { DayCycle } from '../atmosphere/dayCycle.ts';
import { rampColor } from '../palette.ts';
import { contentWidth, createLayer, horizonY, type LayerSize, type WorldLayer } from './Layer.ts';

const PARALLAX = 0.1;

/**
 * Whole-px x of a cloud's pivot after `seconds` of drift, wrapped into [−margin, span + margin): a cloud that leaves
 * on the right re-enters from the left.
 */
export function cloudX(cloud: CloudPlacement, seconds: number, span: number, margin = CLOUD_WRAP_MARGIN): number {
  const period = span + 2 * margin;
  const raw = cloud.x + margin + cloud.speed * seconds;
  return Math.round((((raw % period) + period) % period) - margin);
}

const channel = (c: number, shift: number): number => (c >> shift) & 0xff;
const mix = (a: number, b: number, t: number): number => {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    out |= Math.round(channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t) << shift;
  }
  return out;
};

/** Cloud tint (grey brightness), rim tint and rim alpha for the blend of two keys. */
export function cloudLook(
  cycle: DayCycle,
  weather: Weather = 'clear',
): { tint: number; rimTint: number; rimAlpha: number } {
  const a = CLOUD_LOOKS[cycle.keyA];
  const b = CLOUD_LOOKS[cycle.keyB];
  const rain = weather === 'rain' ? RAIN_CLOUD_BRIGHTNESS : 1;
  const brightness = (a.brightness + (b.brightness - a.brightness) * cycle.t) * rain;
  const grey = Math.round(Math.min(1, Math.max(0, brightness)) * 255);
  return {
    tint: (grey << 16) | (grey << 8) | grey,
    rimTint: mix(rampColor(...a.rim), rampColor(...b.rim), cycle.t),
    rimAlpha: a.rimAlpha + (b.rimAlpha - a.rimAlpha) * cycle.t,
  };
}

export interface CloudsLayerOptions {
  readonly frame: (name: string) => Texture;
  readonly weather: Weather;
}

export function createCloudsLayer({ frame, weather }: CloudsLayerOptions): WorldLayer {
  return createLayer('clouds', PARALLAX, (container) => {
    const group = new Container({ label: 'clouds' });
    // No discrete clouds in fog or rain (ART-17): the overcast / murky sky carries itself — fair-weather cumulus
    // on a rain sky read as pasted on, and half-alpha clouds came out brighter than the ungraded fog sky.
    group.visible = weather === 'clear';
    container.addChild(group);
    const sprites = CLOUDS.map((cloud) => {
      const make = (anim: string): Sprite => {
        const sprite = new Sprite({ texture: frame(`cloud.${cloud.variant}/${anim}/00`), roundPixels: true });
        sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 1 });
        if (cloud.y > LOW_CLOUD.below) sprite.scale.y = LOW_CLOUD.scaleY;
        group.addChild(sprite);
        return sprite;
      };
      const body = make('idle');
      const rim = make('rim');
      const low = cloud.y > LOW_CLOUD.below;
      return { cloud, body, rim, alpha: low ? LOW_CLOUD.alpha : 1 };
    });
    let span = 0;
    const resize = (size: LayerSize): void => {
      span = contentWidth(PARALLAX, size);
      const sky = horizonY(size.viewH);
      for (const { cloud, body, rim } of sprites) {
        body.y = Math.round(sky * cloud.y);
        rim.y = body.y;
      }
    };
    return {
      resize,
      update: ({ ambient: seconds, cycle }) => {
        const look = cloudLook(cycle, weather);
        for (const { cloud, body, rim, alpha } of sprites) {
          const x = cloudX(cloud, seconds, span);
          body.x = x;
          rim.x = x;
          body.tint = look.tint;
          body.alpha = alpha;
          rim.tint = look.rimTint;
          rim.alpha = alpha * look.rimAlpha;
          rim.visible = rim.alpha > 0.01;
        }
      },
    };
  });
}
