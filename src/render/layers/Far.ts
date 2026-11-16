// Layer 2 — far plane (parallax 0.2, ART-08): the land's far planes (Khortytsia: the steppe of the left bank with
// kurgans, the granite bluffs), CPU-painted in the sky's colours (aerial perspective). See landscape.ts.
import type { FarPlane } from '../../content/villages/khortytsia.layout.ts';
import type { Weather } from '../settings.ts';
import { createLandscapeLayer } from './landscape.ts';
import type { WorldLayer } from './Layer.ts';

export function createFarLayer(planes: readonly FarPlane[], weather: Weather): WorldLayer {
  return createLandscapeLayer({ id: 'far', parallax: 0.2, planes: planes.filter((p) => p.layer === 'far'), weather });
}
