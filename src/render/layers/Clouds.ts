// Layer 1 — clouds (parallax 0.1). Stub until ART-07 (volumetric clouds, cloud shadows, cloudMask).
import { createLayer, type WorldLayer } from './Layer.ts';

export function createCloudsLayer(): WorldLayer {
  return createLayer('clouds', 0.1);
}
