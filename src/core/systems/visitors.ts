// Visitors' timetable (plan M2-21, SPEC §2.6): like the wind, time is cut into slots and each slot's visit is a pure
// function of (seed, slot index) through `hash32` — three streams under the content salt: whether the slot has a
// visit, who comes, and when inside the slot the visit begins. A visit lies wholly inside its slot, so visits never
// overlap. Nothing is stored and nothing in the economy reads it (M2 is cosmetic; render shows the visitor). M6 will
// add the tap buff here. Times are milliseconds (epoch), like `now` everywhere in the core.
import { VISITOR_IDS, VISITOR_SCHEDULE, type VisitorId } from '../../content/visitors.ts';
import { hash32, hashUnit } from '../rng.ts';

/** A visit: who, in which slot, from `start` (inclusive) to `end` (exclusive), ms. */
export interface Visit {
  readonly visitor: VisitorId;
  readonly slot: number;
  readonly start: number;
  readonly end: number;
}

const SLOT_MS = VISITOR_SCHEDULE.slotSec * 1000;
/** Hash streams per slot: has a visit, who, when. */
const STREAMS = 3;
const TOTAL_WEIGHT = VISITOR_IDS.reduce((s, id) => s + VISITOR_SCHEDULE.visitors[id].weight, 0);

/** The slot index time `t` falls in. */
export const visitSlot = (t: number): number => Math.floor(t / SLOT_MS);

const unit = (seed: number, slot: number, stream: number): number =>
  hashUnit(hash32(seed, VISITOR_SCHEDULE.salt), slot * STREAMS + stream);

function who(x: number): VisitorId {
  let left = x * TOTAL_WEIGHT;
  for (const id of VISITOR_IDS) {
    const w = VISITOR_SCHEDULE.visitors[id].weight;
    if (left < w) return id;
    left -= w;
  }
  // Float rounding can leave a hair above the last band: it belongs to the last visitor.
  return VISITOR_IDS[VISITOR_IDS.length - 1] ?? 'kobzar';
}

/** The visit of slot `slot` for `seed`, or null when the slot is quiet. */
export function visitOfSlot(seed: number, slot: number): Visit | null {
  if (unit(seed, slot, 0) >= VISITOR_SCHEDULE.chance) return null;
  const visitor = who(unit(seed, slot, 1));
  const durationS = VISITOR_SCHEDULE.visitors[visitor].durationS;
  const leadS = Math.floor(unit(seed, slot, 2) * (VISITOR_SCHEDULE.slotSec - durationS + 1));
  const start = slot * SLOT_MS + leadS * 1000;
  return { visitor, slot, start, end: start + durationS * 1000 };
}

/** Who is visiting at time `t` (ms), or null. */
export function visitorAt(seed: number, t: number): Visit | null {
  const v = visitOfSlot(seed, visitSlot(t));
  return v && t >= v.start && t < v.end ? v : null;
}
