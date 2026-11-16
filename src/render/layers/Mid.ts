// Layer 3 — mid plane (parallax 0.5, ART-08): grove lines on the horizon, CPU-painted like the far plane but less
// hazy, with the foliage local colour showing through. Willows and the Dnipro come with ART-09/14. See landscape.ts.
import type { FarPlane } from '../../content/villages/khortytsia.layout.ts';
import type { Weather } from '../settings.ts';
import { createLandscapeLayer } from './landscape.ts';
import type { WorldLayer } from './Layer.ts';

export function createMidLayer(planes: readonly FarPlane[], weather: Weather): WorldLayer {
  return createLandscapeLayer({ id: 'mid', parallax: 0.5, planes: planes.filter((p) => p.layer === 'mid'), weather });
}
