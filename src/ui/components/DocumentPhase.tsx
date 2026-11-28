// Keeps <html data-phase> (day | dusk | night) in step with the sky (M4-16a): the window scrim turns cool at dusk and
// at night. The phase comes from the game clock (10 Hz, frozen under `?freeze`) in the game's zone; `?time=` pins it,
// as it pins the world. Only the phase is selected, so the clock's ticks re-render nothing.
import { useEffect } from 'react';
import { parseDebugParams, timeToMinutes } from '../../render/debug/params.ts';
import { useGame } from '../hooks/useGame.ts';
import { uiPhase } from '../phase.ts';

function pinnedMinutes(): number | null {
  if (!__CK_DEBUG__) return null;
  const { time } = parseDebugParams(window.location.search, import.meta.env.MODE);
  return time === null ? null : timeToMinutes(time);
}

const PINNED = pinnedMinutes();

export function DocumentPhase() {
  const phase = useGame((s) => uiPhase(s.time.lastSeen, s.settings.tzOffsetMin, PINNED));
  useEffect(() => {
    document.documentElement.dataset.phase = phase;
  }, [phase]);
  return null;
}
