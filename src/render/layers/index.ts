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

export type { LayerId, LayerSize, WorldLayer } from './Layer.ts';

export type WorldLayerOptions = GroundLayerOptions;

export function createWorldLayers(options: WorldLayerOptions): WorldLayer[] {
  return [
    createSkyLayer(),
    createCloudsLayer(),
    createFarLayer(),
    createMidLayer(),
    createGroundLayer(options),
    createForegroundLayer(),
    createFxLayer(),
    createLightLayer(),
  ];
}
