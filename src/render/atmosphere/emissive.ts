// Per-key levels blended between the two keys of the current `dayCycle`: emissive night masks (ART-05) and
// cloud-shadow strength (ART-07).
import { CLOUD_SHADOW_LEVELS, EMISSIVE_LEVELS, type SkyKeyId } from './config.ts';
import type { DayCycle } from './dayCycle.ts';

export function keyLevel(levels: Readonly<Record<SkyKeyId, number>>, cycle: DayCycle): number {
  const a = levels[cycle.keyA];
  return a + (levels[cycle.keyB] - a) * cycle.t;
}

export const emissiveLevel = (cycle: DayCycle): number => keyLevel(EMISSIVE_LEVELS, cycle);
export const cloudShadowLevel = (cycle: DayCycle): number => keyLevel(CLOUD_SHADOW_LEVELS, cycle);
