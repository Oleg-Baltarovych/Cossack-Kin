// Layer 2 — far plane (parallax 0.2). Stub until ART-08 (Khortytsia cliffs, steppe, aerial perspective).
import { createLayer, type WorldLayer } from './Layer.ts';

export function createFarLayer(): WorldLayer {
  return createLayer('far', 0.2);
}
