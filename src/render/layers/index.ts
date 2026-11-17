// Ordered world layers, back to front (SPEC §6.2).
import { createCloudsLayer } from './Clouds.ts';
import { createFarLayer } from './Far.ts';
import { createForegroundLayer } from './Foreground.ts';
import { createFxLayer } from './Fx.ts';
import { createGroundLayer, type GroundLayerOptions } from './Ground.ts';
import type { WorldLayer } from './Layer.ts';
import { createLightLayer } from './Light.ts';
import { createMidLayer } from './Mid.ts';
import { createSkyLayer } from './Sky.ts';
import type { Texture } from 'pixi.js';

export type { LayerFrame, LayerId, LayerSize, WorldLayer } from './Layer.ts';

export interface WorldLayerOptions extends GroundLayerOptions {
  /** Scene atlas lookup that returns `null` for a missing frame. */
  readonly findFrame: (name: string) => Texture | null;
}

export function createWorldLayers(options: WorldLayerOptions): WorldLayer[] {
  return [
    createSkyLayer({ weather: options.weather }),
    createCloudsLayer({ frame: options.frame, weather: options.weather }),
    createFarLayer(options.layout.farPlanes, options.weather),
    createMidLayer(options.layout.farPlanes, options.weather),
    createGroundLayer(options),
    createForegroundLayer(options),
    createFxLayer(),
    createLightLayer({
      weather: options.weather,
      quality: options.quality,
      layout: options.layout,
      findFrame: options.findFrame,
      lessMotion: options.lessMotion,
    }),
  ];
}
