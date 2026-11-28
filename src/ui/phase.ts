// The phase of the day for the DOM UI (M4-16a, ADR 014): the game's clock in its own zone (`settings.tzOffsetMin`,
// like every clock text — never the device zone), or the dev/test `?time=` the world is pinned to. The hours are the
// sky keys' (`render/atmosphere/skyKeys.ts`), so the UI dims when the sky does.
import { skyPhase, wrapMinutes, type SkyPhase } from '../render/atmosphere/skyKeys.ts';

const MS_PER_MIN = 60_000;

/** Minute of the local day of `ms` at `tzOffsetMin`. */
export function localMinutes(ms: number, tzOffsetMin: number): number {
  return wrapMinutes(Math.floor(ms / MS_PER_MIN) + tzOffsetMin);
}

/** `fixedMinutes` (a pinned time of day) wins over the clock. */
export function uiPhase(ms: number, tzOffsetMin: number, fixedMinutes: number | null): SkyPhase {
  return skyPhase(fixedMinutes ?? localMinutes(ms, tzOffsetMin));
}
