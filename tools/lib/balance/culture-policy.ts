// The bot's culture and hero policy (plan M4-09, SPEC §12.3). After the raids and before the Sich the bot buys the
// culture rank or hero level that pays back soonest in «glory minutes»: the price over the glory a day of play brings,
// divided by the share by which the purchase grows that day — measured, never derived from the effect's numbers: the
// bot's day (two sessions online, two absences through the real `applyOffline`, a raid per slot per session at the
// best expected loot) is measured on the state now and on the state after the real action, both through the core.
//   payback (min) = price / (glory per minute of the day × (Δducats/ducats + Δglory/glory))
// Ducats are counted in purchasing power (÷ costMult), so «Дешевші будівлі» is worth its discount. What the bot's day
// does not use is worth nothing: the raid time (one raid per slot a session either way), the relic chance (relic
// value is not modelled) and the culture discount — the Характерник is bought only when a quest asks for a level.
// A purchase pays back within PAYBACK_HORIZON_MIN or waits; a chain step or chore asking for a rank / a level is
// followed at once (as `hireCount` follows «Найми першого козака»: a guided player does what is highlighted).
// The sim reviews culture at a session's first step — where the offline glory lands, ~all of it — and while a quest
// asks (`cultureAsked`), not on every 2-s step: a player opens the culture tab when there is glory to spend, and the
// review measures a day of play per candidate (two `applyOffline`s), too dear for every press.
import { CULTURE_NODES } from '../../../src/content/culture.ts';
import { BUY_MODES } from '../../../src/content/economy.ts';
import { HEROES, type HeroId } from '../../../src/content/heroes.ts';
import { PACING } from '../../../src/content/pacing.ts';
import { RAID_TIER_IDS, RAIDS } from '../../../src/content/raids.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import type { Big } from '../../../src/core/big.ts';
import { buyCount, type BuyMode } from '../../../src/core/economy.ts';
import { cultureNodeOpen, farmIncomeRate, heroLevel, steadyModifiers } from '../../../src/core/modifiers.ts';
import { applyOffline } from '../../../src/core/offline.ts';
import type { GameState } from '../../../src/core/state.ts';
import { gloryRate } from '../../../src/core/systems/army.ts';
import { CULTURE_PRICE_SCALE, culturePrereqMet, culturePrice, heroPrice } from '../../../src/core/systems/culture.ts';
import { chainQuest, choreQuest } from '../../../src/core/systems/quests.ts';
import { previewRaid, type RaidPreview } from '../../../src/core/systems/raids.ts';

const MS = 1000;
const HOUR_MS = 3600 * MS;
const DAY_HOURS = 24;
const MIN_PER_DAY = DAY_HOURS * 60;
const NONE: ReadonlySet<HeroId> = new Set();

/**
 * The bot buys a rank / a level unasked only when it pays back within this many minutes of play (wall time, absences
 * included): one day — a purchase that repays itself before the next day's sessions. Bot policy, tuned with
 * `pnpm balance` (M4-09; balance-designer).
 */
export const PAYBACK_HORIZON_MIN = MIN_PER_DAY;

/** The absences of the bot's day: from each session's end to the next session's start (pacing hours, wrapping). */
const ABSENCES_MS: readonly number[] = PACING.sessionStartHours.map((h, i, all) => {
  const next = all[(i + 1) % all.length] ?? h;
  const gapH = next > h ? next - h : next + DAY_HOURS - h;
  return gapH * HOUR_MS - PACING.sessionSec * MS;
});

/** Expected amount of `k` of a raid: chance × success + (1 − chance) × failure (the card's numbers). */
export function expectedLoot(p: RaidPreview, k: 'ducats' | 'glory'): number {
  return p.chance * p.success[k].toNumber() + (1 - p.chance) * p.failure[k].toNumber();
}

interface DayValue {
  /** In purchasing power: ducats ÷ costMult. */
  readonly ducats: number;
  readonly glory: number;
}

/** What one day of the bot's rhythm brings from `s` (its income, offline returns and raids), through the core. */
function dayValue(s: GameState): DayValue {
  const mods = steadyModifiers(s);
  const onlineSec = PACING.sessionSec * PACING.sessionsPerDay;
  let ducats = farmIncomeRate(s, mods).toNumber() * onlineSec;
  let glory = gloryRate(s, mods).toNumber() * onlineSec;
  for (const away of ABSENCES_MS) {
    const back = applyOffline(s, s.time.lastSeen + away).state.returnReport;
    ducats += back?.ducats.toNumber() ?? 0;
    glory += back?.glory.toNumber() ?? 0;
  }
  // The raid of the highest expected loot the power allows (bestRaid's measure, ducats and glory), each slot each session.
  const [scout] = RAID_TIER_IDS;
  const ref = previewRaid(s, scout).success;
  const refD = ref.ducats.toNumber();
  const refG = ref.glory.toNumber();
  let best: { d: number; g: number; v: number } = { d: 0, g: 0, v: -Infinity };
  for (const id of RAID_TIER_IDS) {
    const p = previewRaid(s, id);
    if (p.blocked !== null) continue;
    const d = expectedLoot(p, 'ducats');
    const g = expectedLoot(p, 'glory');
    const v = (refD > 0 ? d / refD : 0) + (refG > 0 ? g / refG : 0);
    if (v > best.v) best = { d, g, v };
  }
  const raids = RAIDS.slots * PACING.sessionsPerDay;
  ducats += best.d * raids;
  glory += best.g * raids;
  return { ducats: ducats / mods.costMult, glory };
}

/** Glory price of `a` (a culture rank or one hero level) on `s`; null when `a` is neither or at the max. */
function priceOf(s: GameState, a: Action): Big | null {
  if (a.type === 'buyCulture') {
    const node = CULTURE_NODES.find((n) => n.id === a.id);
    const rank = s.culture[a.id] ?? 0;
    return node && rank < node.maxRank ? culturePrice(node, rank, steadyModifiers(s).cultureCostMult) : null;
  }
  if (a.type === 'levelHero') {
    const hero = HEROES.find((h) => h.id === a.id);
    const level = heroLevel(a.id, s);
    return hero && level > 0 && level < hero.levelMax ? heroPrice(hero, level, 1) : null;
  }
  return null;
}

const relative = (after: number, now: number): number => (now > 0 ? after / now - 1 : 0);

/**
 * Minutes of the day's glory income in which `a` repays its price through what it adds to the day (Infinity: it adds
 * nothing the bot's day uses, or it cannot be bought). `a` must be affordable: it is applied for real at `s`'s time.
 */
export function paybackMinutes(s: GameState, a: Action, now: DayValue = dayValue(s)): number {
  const price = priceOf(s, a);
  if (!price || now.glory <= 0) return Infinity;
  const r = applyAction(s, a, s.time.lastSeen);
  if (r.events.some((e) => e.type === 'ActionRejected')) return Infinity;
  // The price is paid back from the day, not out of the purse: measure the after-state with the purse as before.
  const after = dayValue({ ...r.state, currencies: s.currencies });
  const gain = relative(after.ducats, now.ducats) + relative(after.glory, now.glory);
  return gain > 0 ? price.toNumber() / ((now.glory / MIN_PER_DAY) * gain) : Infinity;
}

/**
 * Every rank / level the bot could buy now: open, prerequisites held, a rank left, and paid for (×1 levels); a hero in
 * `pressed` (levelled already in this session's review) is left out.
 */
export function cultureCandidates(s: GameState, pressed: ReadonlySet<HeroId> = NONE): Action[] {
  const out: Action[] = [];
  const glory = s.currencies.glory;
  const cultureCostMult = steadyModifiers(s).cultureCostMult;
  for (const n of CULTURE_NODES) {
    const rank = s.culture[n.id] ?? 0;
    if (rank >= n.maxRank || !cultureNodeOpen(n, s) || !culturePrereqMet(n, s)) continue;
    if (glory.gte(culturePrice(n, rank, cultureCostMult))) out.push({ type: 'buyCulture', id: n.id });
  }
  for (const h of HEROES) {
    const level = heroLevel(h.id, s);
    if (!pressed.has(h.id) && level > 0 && level < h.levelMax && glory.gte(heroPrice(h, level, 1)))
      out.push({ type: 'levelHero', id: h.id, mode: 1 });
  }
  return out;
}

/** Whether an unfinished chain step or chore of `s` asks for a culture rank or a hero level. */
export function cultureAsked(s: GameState): boolean {
  const a = asked(s);
  return a.culture || a.heroes;
}

/** The culture / hero stats an unfinished chain step or chore of `s` counts. */
function asked(s: GameState): { readonly culture: boolean; readonly heroes: boolean } {
  const stats = new Set<string>();
  for (const q of [chainQuest(s), choreQuest(s)]) if (q && !q.done && q.goal.kind === 'count') stats.add(q.goal.stat);
  return { culture: stats.has('cultureRanks'), heroes: stats.has('heroLevels') };
}

export interface CultureChoice {
  readonly action: Action;
  readonly paybackMin: number;
}

/**
 * The rank / level the bot buys now, or null: the candidate of the lowest payback within the horizon; while a quest
 * asks for a rank (a level), the best of that kind whatever its payback. A hero is pressed at most once a session
 * (`pressed`: the sim's record of this session), with the picker (`heroPress`) — never a run of ×1 presses.
 */
export function cultureChoice(s: GameState, pressed: ReadonlySet<HeroId> = NONE): CultureChoice | null {
  const candidates = cultureCandidates(s, pressed);
  if (candidates.length === 0) return null;
  const now = dayValue(s);
  const ask = asked(s);
  let best: CultureChoice | null = null;
  let bestAsked: CultureChoice | null = null;
  for (const action of candidates) {
    const c = { action, paybackMin: paybackMinutes(s, action, now) };
    if (!best || c.paybackMin < best.paybackMin) best = c;
    const isAsked = action.type === 'buyCulture' ? ask.culture : ask.heroes;
    if (isAsked && (!bestAsked || c.paybackMin < bestAsked.paybackMin)) bestAsked = c;
  }
  if (best && best.paybackMin <= PAYBACK_HORIZON_MIN) return { ...best, action: heroPress(s, best.action) };
  return bestAsked;
}

/**
 * A hero is levelled with the picker (one press, one action — SPEC §12.3), as a player would: n = the levels in a row
 * that each pay back within the horizon and are paid for (each measured on the state after the ones before), pressed
 * as MAX when MAX buys exactly those n, else as the largest ×k of the picker with k ≤ n (the rest on the next presses).
 * A culture rank is one press each (no picker on a node).
 */
function heroPress(s: GameState, a: Action): Action {
  if (a.type !== 'levelHero') return a;
  const hero = HEROES.find((h) => h.id === a.id);
  if (!hero) return a;
  let n = 1;
  let cur = applyAction(s, a, s.time.lastSeen).state;
  for (;;) {
    const one: Action = { type: 'levelHero', id: a.id, mode: 1 };
    const price = priceOf(cur, one);
    if (!price || cur.currencies.glory.lt(price) || paybackMinutes(cur, one) > PAYBACK_HORIZON_MIN) break;
    cur = applyAction(cur, one, cur.time.lastSeen).state;
    n += 1;
  }
  const level = heroLevel(a.id, s);
  if (buyCount(hero, level, s.currencies.glory, CULTURE_PRICE_SCALE, hero.levelMax, 'max') === n)
    return { ...a, mode: 'max' };
  const k = [...BUY_MODES].reverse().find((m): m is Exclude<BuyMode, 'max'> => m !== 'max' && m <= n) ?? 1;
  return { ...a, mode: k };
}
