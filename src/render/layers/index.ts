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
import type { Quality, Weather } from '../settings.ts';

export type { LayerFrame, LayerId, LayerSize, WorldLayer } from './Layer.ts';

export interface WorldLayerOptions extends GroundLayerOptions {
  readonly weather: Weather;
  readonly quality: Quality | null;
}

export function createWorldLayers(options: WorldLayerOptions): WorldLayer[] {
  return [
    createSkyLayer(),
    createCloudsLayer({ frame: options.frame }),
    createFarLayer(options.layout.farPlanes, options.weather),
    createMidLayer(options.layout.farPlanes, options.weather),
    createGroundLayer(options),
    createForegroundLayer(options),
    createFxLayer(),
    createLightLayer({ weather: options.weather, quality: options.quality, layout: options.layout }),
  ];
}
