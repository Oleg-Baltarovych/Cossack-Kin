// Emissive layer strength for the time of day (ART-05): blended between the two keys of the current `dayCycle`.
import { EMISSIVE_LEVELS } from './config.ts';
import type { DayCycle } from './dayCycle.ts';

export function emissiveLevel(cycle: DayCycle): number {
  const a = EMISSIVE_LEVELS[cycle.keyA];
  return a + (EMISSIVE_LEVELS[cycle.keyB] - a) * cycle.t;
}
