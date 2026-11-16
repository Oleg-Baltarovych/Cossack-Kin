// Layer 6 — particles and weather (parallax 1.0). Stub until ART-16/17; counts go through fx/registry.ts.
import { createLayer, type WorldLayer } from './Layer.ts';

export function createFxLayer(): WorldLayer {
  return createLayer('fx', 1);
}
