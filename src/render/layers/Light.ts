// Layer 7 — light and atmosphere (screen-fixed). Stub until ART-04+ (LUT grading, god rays, fog, emissive).
import { createLayer, type WorldLayer } from './Layer.ts';

export function createLightLayer(): WorldLayer {
  return createLayer('light', 0);
}
