// Offline progress and the return window (SPEC §3.8, §12.1; plan §0, M1-11, Q7). `applyOffline(state, now)` counts
// the absence through the same `advance` the online ticks use — after the caps, never past them:
//   now < lastSeen                          → 0 earned, lastSeen stays                  (reason 'clockBack')
//     lastSeen never moves back: lowering it to `now` would let «clock back 8 h, then forward» count the same 8 h
//     again and again once saves exist (platform review M1-18). Time with the clock behind earns nothing.
//   now > maxSeen + forwardJumpCapSec       → exactly offlineCapSec counted              (reason 'forwardJump')
//   otherwise                               → min(away, offlineCapSec) counted           (reason 'normal')
// Glory is held to the store (gloryCapSec of income). What was earned goes into `returnReport`, and `claimReturn`
// credits it (room for the M8 doubling); an unclaimed report is credited first. Under returnMinSec there is no
// report: the income goes straight in. `tick` routes a short gap to `advance` and a long one here, so a long
// "online" gap cannot bypass the caps. Raids are not capped (ADR 012): the income is integrated to the capped window,
// but raids come back up to the real `now` — a forward jump too (Q8); with the clock behind nothing returns.
import { OFFLINE } from '../content/economy.ts';
import { advance, integrate, type AdvanceResult } from './advance.ts';
import { Big } from './big.ts';
import type { GameEvent } from './events.ts';
import { collectModifiers } from './modifiers.ts';
import type { GameState, ReturnReport } from './state.ts';
import { gloryGain, gloryRate } from './systems/army.ts';
import { returnRaids } from './systems/raids.ts';
import { checkStory } from './systems/story.ts';

const MS_PER_SEC = 1000;

/** Credits the waiting return report (if any) and clears it. */
export function creditReport(state: GameState): AdvanceResult {
  const r = state.returnReport;
  if (!r) return { state, events: [] };
  return {
    state: {
      ...state,
      currencies: {
        ...state.currencies,
        ducats: state.currencies.ducats.add(r.ducats),
        glory: state.currencies.glory.add(r.glory),
      },
      village: { ...state.village, lifetimeDucats: state.village.lifetimeDucats.add(r.ducats) },
      returnReport: null,
    },
    events: [{ type: 'ReturnClaimed', ducats: r.ducats, glory: r.glory }],
  };
}

function report(
  state: GameState,
  fields: Omit<ReturnReport, 'ducats' | 'glory'>,
  ducats: Big,
  glory: Big,
): AdvanceResult {
  const r: ReturnReport = { ...fields, ducats, glory };
  return { state: { ...state, returnReport: r }, events: [{ type: 'OfflineApplied', report: r }] };
}

/** The player is back at `now` (ms): count the absence and prepare the return report. */
export function applyOffline(input: GameState, now: number): AdvanceResult {
  if (!Number.isFinite(now)) return { state: input, events: [] };
  const credited = creditReport(input);
  const s = credited.state;
  const before: readonly GameEvent[] = credited.events;
  const from = s.time.lastSeen;
  const awaySec = Math.max(0, Math.round((now - from) / MS_PER_SEC));

  if (now < from) {
    const r = report(s, { awaySec: 0, countedSec: 0, capped: false, reason: 'clockBack' }, Big.ZERO, Big.ZERO);
    return { state: r.state, events: [...before, ...r.events] };
  }
  if (awaySec < OFFLINE.returnMinSec) {
    const a = advance(s, now);
    return { state: a.state, events: [...before, ...a.events] };
  }

  const mods = collectModifiers(s, from);
  const forwardJump = now > s.time.maxSeen + OFFLINE.forwardJumpCapSec * MS_PER_SEC;
  const countedSec = forwardJump ? mods.offlineCapSec : Math.min(awaySec, mods.offlineCapSec);
  // Integrate only the counted window (the cap comes first: work and events stay bounded for any absence).
  const counted = integrate(s, from + countedSec * MS_PER_SEC).state;
  const ducats = counted.currencies.ducats.sub(s.currencies.ducats).mul(mods.offlineMult);
  // Glory has no wind in it: its rate is constant over the absence, so the store cap is rate × min(counted, cap).
  const glory = gloryGain(gloryRate(s, mods), countedSec, mods.gloryCapSec);
  const restored: GameState = {
    ...counted,
    // The income waits in the report; the storms the windmill weathered count at once (SPEC §3.7).
    currencies: s.currencies,
    village: { ...counted.village, lifetimeDucats: s.village.lifetimeDucats },
    time: { ...s.time, lastSeen: now, maxSeen: Math.max(s.time.maxSeen, now) },
  };
  // Raids finish to the real now, past the cap.
  const back = returnRaids(restored, now);
  // Beats due by now fire on the state kept (their rewards go straight in, not into the report).
  const story = checkStory(back.state);
  const r = report(
    story.state,
    {
      awaySec,
      countedSec,
      capped: forwardJump || awaySec > countedSec,
      reason: forwardJump ? 'forwardJump' : 'normal',
    },
    ducats,
    glory,
  );
  const returned = back.returns.map((x) => x.event);
  return { state: r.state, events: [...before, ...returned, ...story.events, ...r.events] };
}

/** One step of the game loop: a short gap is plain time (`advance`), a long one is an absence (`applyOffline`). */
export function tick(state: GameState, now: number): AdvanceResult {
  return now - state.time.lastSeen <= OFFLINE.onlineGapSec * MS_PER_SEC
    ? advance(state, now)
    : applyOffline(state, now);
}

/**
 * The first tick of a returning page (or a loaded save): like `tick`, but a clock set back by more than the online
 * gap is reported (`clockBack`), so the window can say why nothing grew. Ticks of the running loop stay quiet while
 * the clock is behind (`advance` ignores now ≤ lastSeen) — otherwise the notice would come back ten times a second.
 */
export function resume(state: GameState, now: number): AdvanceResult {
  return now < state.time.lastSeen - OFFLINE.onlineGapSec * MS_PER_SEC ? applyOffline(state, now) : tick(state, now);
}
