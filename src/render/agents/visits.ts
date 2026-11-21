// The visitors' clock in render (plan M2-21): which visit the core timetable (`visitOfSlot`) has going on at this
// frame, and how far into it. Visit time = the game's time at the anchor + the animation seconds since, so walking is
// smooth at 60 Hz while the game ticks at 10 Hz; a live clock re-anchors on the game's time when the two drift apart
// (`VISITOR_CLOCK.rebaseMs`: a resumed tab, a loaded save). A frozen clock never re-anchors: `?freeze=<s>` is then the
// game's frozen time + s, so screenshots step through a visit. Reads only — the game's state is never written.
// No allocation per frame: the slot's visit is looked up once per slot, the result object is reused.
import { VISITOR_CLOCK } from '../../content/visitors.ts';
import { visitOfSlot, visitSlot, type Visit } from '../../core/systems/visitors.ts';
import type { VisitorFeed } from '../scene.ts';
import type { VisitNow } from './sim.ts';

export interface VisitClock {
  /** The visit at animation time `seconds` (the returned object is reused frame to frame), or null. */
  at(feed: VisitorFeed | null | undefined, seconds: number): VisitNow | null;
}

export function createVisitClock(frozen: boolean): VisitClock {
  let anchor: { feed: VisitorFeed; ms: number; seconds: number } | null = null;
  let slot = NaN;
  let seed = NaN;
  let visit: Visit | null = null;
  const now: { -readonly [K in keyof VisitNow]: VisitNow[K] } = {
    visitor: 'kobzar',
    slot: 0,
    elapsedS: 0,
    durationS: 0,
  };
  return {
    at: (feed, seconds) => {
      if (!feed) return null;
      // A new game (another feed) anchors anew; a frozen clock anchors at animation time 0.
      if (anchor?.feed !== feed) anchor = { feed, ms: feed.gameMs(), seconds: frozen ? 0 : seconds };
      let t = anchor.ms + (seconds - anchor.seconds) * 1000;
      if (!frozen) {
        const game = feed.gameMs();
        if (Math.abs(t - game) > VISITOR_CLOCK.rebaseMs) {
          anchor = { feed, ms: game, seconds };
          t = game;
        }
      }
      const s = visitSlot(t);
      if (s !== slot || feed.seed !== seed) {
        slot = s;
        seed = feed.seed;
        visit = visitOfSlot(seed, slot);
      }
      if (!visit || t < visit.start || t >= visit.end) return null;
      now.visitor = visit.visitor;
      now.slot = visit.slot;
      now.elapsedS = (t - visit.start) / 1000;
      now.durationS = (visit.end - visit.start) / 1000;
      return now;
    },
  };
}
