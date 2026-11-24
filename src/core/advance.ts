// advance(state, now) — the one way time moves in the core (SPEC §3.8, §12.1; plan §0, M1-09). It integrates from
// `state.time.lastSeen` to `now` analytically and piecewise: between two actions the levels do not change, so the only
// breakpoints are the wind's (`windBreakpoints`); inside a segment every rate is constant and
//   ducats += farmIncomeRate × duration,  glory += gloryRate × duration,  stormsSurvived += storms begun in it.
// No step loop and no cap here: a 0.1 s tick and an 8 h absence take the same path, which is what makes the offline
// equivalence test hold. The offline cap, the glory store and the clock-cheat guard are `applyOffline`'s (M1-11).
// Raids (M3-05, ADR 012): every `returnAt ∈ (lastSeen, now]` is a breakpoint for the state only — the running slot
// turns returned and `RaidReturned` comes in time order with the wind's events; no rate changes, so the income
// integral is the same with or without it (`returnRaids`).
// At the end the due story beats fire (`checkStory`, M2-22): `integrate` is the same step without them, for
// `applyOffline`, which integrates the capped window and then checks the beats on the state it keeps.
import { Big } from './big.ts';
import type { GameEvent } from './events.ts';
import { collectModifiers, farmIncomeRate, villageOf } from './modifiers.ts';
import type { GameState } from './state.ts';
import { gloryRate } from './systems/army.ts';
import { returnRaids, type RaidReturn } from './systems/raids.ts';
import { checkStory } from './systems/story.ts';
import { stormsSurvivedDuring, windAt, windBreakpoints } from './systems/village-mechanics/wind.ts';

const MS_PER_SEC = 1000;

export interface AdvanceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Moves `state` forward to `now` (ms). `now ≤ lastSeen` or a non-finite `now` changes nothing (a clock going back is applyOffline's case). */
export function advance(state: GameState, now: number): AdvanceResult {
  const moved = integrate(state, now);
  if (moved.state === state) return moved;
  const back = returnRaids(moved.state, now);
  const story = checkStory(back.state);
  return { state: story.state, events: [...inTimeOrder(moved.events, back.returns), ...story.events] };
}

type WindChanged = Extract<GameEvent, { type: 'WindChanged' }>;

/** The wind's events and the raids' returns merged by time; the wind first on a tie (the sort is stable). */
function inTimeOrder(wind: readonly WindChanged[], returns: readonly RaidReturn[]): GameEvent[] {
  if (returns.length === 0) return [...wind];
  const timed: { readonly at: number; readonly event: GameEvent }[] = [
    ...wind.map((event) => ({ at: event.at, event })),
    ...returns,
  ];
  return timed.sort((x, y) => x.at - y.at).map((x) => x.event);
}

/** `advance` without the story check and the raids: income, glory, storms and wind events only. */
export function integrate(state: GameState, now: number): { state: GameState; events: readonly WindChanged[] } {
  const from = state.time.lastSeen;
  // A non-finite clock is invalid input: Infinity would never end the wind scan, NaN would poison lastSeen.
  if (!Number.isFinite(now) || now <= from) return { state, events: [] };
  const village = villageOf(state);
  const windmill = state.village.levels.windmill;
  const cuts = windBreakpoints(state.seed, from, now, village);
  const events: WindChanged[] = cuts.map((at) => ({
    type: 'WindChanged',
    at,
    from: windAt(state.seed, at - 1, village),
    to: windAt(state.seed, at, village),
  }));
  let ducats = Big.ZERO;
  let glory = Big.ZERO;
  let storms = 0;
  let t0 = from;
  for (const t1 of [...cuts, now]) {
    if (t1 > t0) {
      // The wind is constant on (t0, t1]: the modifiers at the segment's start hold for all of it.
      const mods = collectModifiers(state, t0);
      const sec = (t1 - t0) / MS_PER_SEC;
      ducats = ducats.add(farmIncomeRate(state, mods).mul(sec));
      glory = glory.add(gloryRate(state, mods).mul(sec));
      storms += stormsSurvivedDuring(state.seed, t0, t1, windmill, village);
    }
    t0 = t1;
  }
  return {
    state: {
      ...state,
      time: { ...state.time, lastSeen: now, maxSeen: Math.max(state.time.maxSeen, now) },
      currencies: {
        ...state.currencies,
        ducats: state.currencies.ducats.add(ducats),
        glory: state.currencies.glory.add(glory),
      },
      village: {
        ...state.village,
        lifetimeDucats: state.village.lifetimeDucats.add(ducats),
        mechanic: { ...state.village.mechanic, stormsSurvived: state.village.mechanic.stormsSurvived + storms },
      },
    },
    events,
  };
}
