// Layer 3 — mid plane (parallax 0.5). Stub until ART-08/09/14 (groves, willows, Dnipro).
import { createLayer, type WorldLayer } from './Layer.ts';

export function createMidLayer(): WorldLayer {
  return createLayer('mid', 0.5);
}
