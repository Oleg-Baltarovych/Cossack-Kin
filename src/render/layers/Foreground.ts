// Layer 5 — foreground (parallax 1.2). Stub until ART-14 (grass, reeds, sunflowers with wind sway).
import { createLayer, type WorldLayer } from './Layer.ts';

export function createForegroundLayer(): WorldLayer {
  return createLayer('foreground', 1.2);
}
