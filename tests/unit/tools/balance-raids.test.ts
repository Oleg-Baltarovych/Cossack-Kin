// The bot raids (plan M3-08, SPEC §12.3): real startRaid / claimRaid / claimAllRaids, best offer by expected value,
// «Ще раз» and «Забрати все», raid starts and claims counted as actions, the raid novelties and report lines.
import { describe, expect, it } from 'vitest';
import { PACING } from '../../../src/content/pacing.ts';
import { RAID_TIER_IDS, RAIDS, tierRank, type RaidTierId } from '../../../src/content/raids.ts';
import { pityThreshold, RELICS } from '../../../src/content/relics.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import { tick } from '../../../src/core/offline.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { previewRaid, raidTier } from '../../../src/core/systems/raids.ts';
import { calendarSessions, evaluate, renderReport } from '../../../tools/lib/balance/report.ts';
import { bestRaid, DEFAULT_EPOCH, sessionStarts, simulate, type SimResult } from '../../../tools/lib/balance/sim.ts';

const SEC = 1000;
const HOUR = 3600 * SEC;
const T0 = DEFAULT_EPOCH + PACING.sessionStartHours[0] * HOUR;

// Tiers and times from content, so a retune does not silently change what a test means.
const [SCOUT_ID] = RAID_TIER_IDS;
const SCOUT = raidTier(SCOUT_ID);
/** The shortest tier that moves the pity, and the tier after it. */
const PITY = raidTier(RELICS.pityMinTier);
const NEXT = raidTier(RAID_TIER_IDS[tierRank(PITY.id) + 1] ?? PITY.id);
/** An army at the pity tier's P: a sure success there, too weak to start the next tier. */
const AT_PITY = PITY.power;
/** S2's start, in seconds since the run began at T0. */
const S2_SEC = ((sessionStarts(DEFAULT_EPOCH, 1)[1] ?? 0) - T0) / SEC;

it('the content fits these tests: the scouting is back inside a session, the pity tier after it, P steps up', () => {
  expect(SCOUT.durationSec % PACING.tapEverySec).toBe(0);
  expect(SCOUT.durationSec).toBeLessThan(PACING.sessionSec);
  expect(PITY.durationSec).toBeGreaterThan(PACING.sessionSec);
  expect(NEXT.id).not.toBe(PITY.id);
  expect(AT_PITY).toBeLessThan(RAIDS.minPowerShare * NEXT.power);
});

/** A game at `now` with `infantry` Cossacks, no ducats and the chain out of the way (its claims pay rewards). */
function army(infantry: number, now = T0): GameState {
  const s = createInitialState({ seed: 1, now });
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.ZERO },
    army: { infantry },
    stats: { ...s.stats, hires: infantry },
    quests: { ...s.quests, chain: { kind: 'done' } },
  };
}

function start(s: GameState, slot: number, tier: RaidTierId, at: number): GameState {
  const r = applyAction(s, { type: 'startRaid', slot, tier }, at);
  if (r.events.some((e) => e.type === 'ActionRejected')) throw new Error(`cannot start ${tier} in ${String(slot)}`);
  return r.state;
}

describe('bestRaid: the offer with the highest expected loot the army can start (SPEC §12.3)', () => {
  /** Expected loot in units of the 5-minute success (ducats and glory each), as the bot weighs it. */
  const ev = (s: GameState, tier: 'm5' | 'm30' | 'h1'): number => {
    const ref = previewRaid(s, 'm5').success;
    const p = previewRaid(s, tier);
    const cur = (k: 'ducats' | 'glory'): number =>
      (p.chance * p.success[k].toNumber() + (1 - p.chance) * p.failure[k].toNumber()) / ref[k].toNumber();
    return cur('ducats') + cur('glory');
  };

  it('one Cossack: only the scouting; none without an army', () => {
    expect(bestRaid(army(1), 0)).toBe('m5');
    expect(bestRaid(army(0), 0)).toBeNull();
  });

  it('a sure 30-min raid beats the scouting; a risky 1-h raid wins once its expected loot is higher', () => {
    // One Cossack = 1 power in a new game (powerMult 1). Below ½ P of the 1-h raid it cannot start.
    const p30 = raidTier('m30').power;
    const p1h = raidTier('h1').power;
    const below = army(Math.ceil(RAIDS.minPowerShare * p1h) - 1);
    expect(below.army.infantry).toBeGreaterThanOrEqual(p30);
    expect(bestRaid(below, 0)).toBe('m30');
    // At 60 % of P the 1-h raid is a gamble, but its expected loot is already the higher one.
    const risky = army(Math.ceil(0.6 * p1h));
    expect(previewRaid(risky, 'h1').chance).toBeLessThan(1);
    expect(ev(risky, 'h1')).toBeGreaterThan(ev(risky, 'm30'));
    expect(bestRaid(risky, 0)).toBe('h1');
  });

  it('a busy slot gets nothing', () => {
    expect(bestRaid(start(army(AT_PITY), 0, SCOUT.id, T0), 0)).toBeNull();
  });
});

describe('the bot raids through the real actions (M3-08)', () => {
  it('a new game: the first raid is the scouting, right after the first Cossack, within the SPEC 3 minutes', () => {
    const r = simulate({ seed: 1, days: 1 });
    const hire = r.novelties.find((n) => n.kind === 'firstHire');
    const first = r.novelties.find((n) => n.kind === 'firstRaid');
    expect(first).toMatchObject({ session: 1 });
    expect(first?.t).toBe(r.firstRaidSec);
    expect(r.firstRaidSec ?? Infinity).toBeLessThanOrEqual(PACING.firstRaidMaxSec);
    expect(first?.t ?? -1).toBeGreaterThanOrEqual(hire?.t ?? Infinity);
    expect(r.novelties).toContainEqual(expect.objectContaining({ kind: 'raidTier', ref: 'm5', session: 1 }));
    // Q19: the scouting of one Cossack is a sure success.
    expect(r.raidClaims[0]).toMatchObject({ tier: 'm5', success: true });
    expect(r.final.stats.raidsSent).toBeGreaterThan(1);
  });

  it('claims a raid at the first step it is back and sends the best offer again; raid actions are counted apart', () => {
    // Slot 0 left at the session start with the scouting; the bot fills slot 1 with the best offer (the pity tier).
    const initial = start(army(AT_PITY), 0, SCOUT.id, T0);
    expect(bestRaid(initial, 1)).toBe(PITY.id);
    const r = simulate({ seed: 1, days: 1, taps: false, initial });
    expect(r.raidClaims[0]).toMatchObject({ session: 1, t: SCOUT.durationSec, slot: 0, tier: SCOUT.id, success: true });
    const s1 = r.sessions[0];
    expect(s1?.raids).toMatchObject({ starts: 2, claims: 1, again: 0, claimAll: 0 });
    // The pity-tier raids come back between sessions: claimed at the first step of S2.
    expect(r.raidClaims.slice(1, 3)).toEqual([
      expect.objectContaining({ session: 2, t: S2_SEC, slot: 0, tier: PITY.id }),
      expect.objectContaining({ session: 2, t: S2_SEC, slot: 1, tier: PITY.id }),
    ]);
    // Both back together: «Забрати все» (one tap, one action per slot, SPEC §12.3).
    expect(r.sessions[1]?.raids).toMatchObject({ claims: 2, claimAll: 1 });
  });

  it('«Ще раз» when the best offer is the tier that came back', () => {
    // One Cossack: only the scouting. Slot 0 left `lead` s before the session, slot 1 at its start — back one at a time.
    const lead = SCOUT.durationSec / 3;
    const early = start(army(1, T0 - lead * SEC), 0, SCOUT.id, T0 - lead * SEC);
    const initial = start(tick(early, T0).state, 1, SCOUT.id, T0);
    const r = simulate({ seed: 1, days: 1, taps: false, initial });
    expect(r.raidClaims.slice(0, 2)).toEqual([
      expect.objectContaining({ session: 1, t: SCOUT.durationSec - lead, slot: 0 }),
      expect.objectContaining({ session: 1, t: SCOUT.durationSec, slot: 1 }),
    ]);
    expect(r.sessions[0]?.raids).toMatchObject({ starts: 2, claims: 2, again: 2, claimAll: 0 });
  });

  it('in one step: claims before the purchases (its loot pays the hires), sends after them (post-hire bestRaid)', () => {
    // Slot 0 is back with loot that is the only money; slot 1 is out for long. With no ducats before the claim, a hire
    // at the first step means the claim came first; the hires lift the army past ½ P of the next tier, so the raid
    // sent after them is not the one the army could start before.
    const base = army(AT_PITY, T0 - SCOUT.durationSec * SEC);
    const cap = NEXT.power;
    const fed = { ...base, village: { ...base.village, sichLevels: { ...base.village.sichLevels, kurins: cap } } };
    const out = start(start(fed, 0, SCOUT.id, T0 - SCOUT.durationSec * SEC), 1, PITY.id, T0 - SCOUT.durationSec * SEC);
    const back = tick(out, T0).state;
    const slot0 = back.raids.slots[0];
    if (slot0?.kind !== 'returned') throw new Error('slot 0 should be back');
    const loot = { ...slot0.raid.loot, ducats: Big.from(1e12) };
    const initial: GameState = {
      ...back,
      currencies: { ...back.currencies, ducats: Big.ZERO },
      raids: {
        ...back.raids,
        slots: back.raids.slots.map((x, i) => (i === 0 ? { kind: 'returned', raid: { ...slot0.raid, loot } } : x)),
      },
    };
    const idle0: GameState = {
      ...initial,
      raids: { ...initial.raids, slots: [{ kind: 'idle' }, ...initial.raids.slots.slice(1)] },
    };
    const pre = bestRaid(idle0, 0);
    const post = bestRaid({ ...idle0, army: { infantry: cap } }, 0);
    expect(pre).toBe(PITY.id);
    expect(post).not.toBe(pre);
    const r = simulate({ seed: 1, days: 1, taps: false, initial });
    expect(r.raidClaims[0]).toMatchObject({ t: 0, slot: 0 });
    // Not «Ще раз»: the tier that came back is not the pre-hire best. The start of step 0 is the post-hire best.
    const sent = r.novelties.filter((n) => n.kind === 'raidTier' && n.t === 0).map((n) => n.ref);
    expect(sent).toContain(post);
    expect(sent).not.toContain(pre);
    expect(r.sessions[0]?.raids).toMatchObject({ claims: 1, starts: 1, again: 0 });
  });

  it('`actions` (the 5–15 corridor) counts the economy only, never raid starts and claims (owner 2026-11-24)', () => {
    // An army far past what the food feeds: no hire is ever possible, so every economy action is a purchase press.
    const initial = army(10_000);
    const r = simulate({ seed: 1, days: 1, initial });
    expect(r.final.stats.hires).toBe(initial.stats.hires);
    const presses = r.sessions.reduce((n, x) => n + x.actions, 0);
    // Culture ranks and hero levels are economy actions too (M4-09, SPEC §12.3), logged apart in `culture`.
    const culture = r.sessions.reduce((n, x) => n + x.culture, 0);
    expect(presses).toBe(r.final.stats.purchases - initial.stats.purchases + culture);
    expect(r.sessions.reduce((n, x) => n + x.raids.starts + x.raids.claims, 0)).toBeGreaterThan(0);
  });

  it('a relic is a novelty of the session it is claimed in, and the calendar sees the first one', () => {
    // The pity one short: the first qualifying success is certain to bring a relic (it comes back after S1).
    const base = army(AT_PITY);
    const initial = { ...base, raids: { ...base.raids, pity: pityThreshold(0) - 1 } };
    const r = simulate({ seed: 1, days: 1, taps: false, initial });
    const relic = r.novelties.find((n) => n.kind === 'firstRelic');
    expect(relic).toMatchObject({ session: 2, t: S2_SEC });
    expect(r.final.relics).toEqual([relic?.ref]);
    expect(r.raidClaims.find((c) => c.relic !== null)).toMatchObject({ session: 2, relic: relic?.ref });
    // An empty calendar ref is «the first of the kind», whichever relic it was.
    expect(calendarSessions(r, [{ id: 'x', kind: 'firstRelic', ref: '', sessions: { min: 2, max: 5 } }])).toEqual([2]);
  });

  it('the free slots stay busy: at the end of a session every open slot is out (or back unclaimed)', () => {
    const r = simulate({ seed: 2, days: 3 });
    const open = r.final.raids.slots.slice(0, RAIDS.slots);
    expect(open.every((x) => x.kind !== 'idle')).toBe(true);
  });
});

describe('raid report lines (M3-08, SPEC §12.3)', () => {
  const r = simulate({ seed: 1, days: 4 });
  const checks = evaluate([r]);
  const find = (id: string) => checks.find((c) => c.id.startsWith(id));

  it('first raid and raid actions per session gated, the loot share reported only', () => {
    expect(find('firstRaidSec')).toMatchObject({ gate: true, target: `≤ ${String(PACING.firstRaidMaxSec)}` });
    expect(find('raidActions')).toMatchObject({ gate: true, target: `≤ ${String(PACING.raidActionsMax)}`, ok: true });
    expect(find('raidLootShare')).toMatchObject({ gate: false });
  });

  it('the action corridor counts the economy only; raid actions have their own gate from S2 (owner 2026-11-24)', () => {
    const [session] = r.sessions;
    if (!session) throw new Error('no session');
    const raids = (n: number) => ({ starts: n - Math.floor(n / 2), claims: Math.floor(n / 2), again: 0, claimAll: 0 });
    const fake = (perSession: readonly number[]): SimResult => ({
      ...r,
      bloomSec: null,
      bloomSession: null,
      sessions: perSession.map((n, i) => ({ ...session, index: i + 1, actions: 12, raids: raids(n) })),
    });
    const check = (x: SimResult, id: string) => evaluate([x]).find((c) => c.id.startsWith(id));
    // 12 economy actions + 4 raid actions a session: the corridor sees 12, the raid gate 4.
    expect(check(fake([6, 4, 4, 4]), 'sessionActions')).toMatchObject({ actual: '12', ok: true });
    expect(check(fake([6, 4, 4, 4]), 'raidActions')).toMatchObject({ actual: '4', ok: true, gate: true });
    // S1 is onboarding (6 there is fine); one session past the cap from S2 fails the gate.
    expect(check(fake([6, 4, PACING.raidActionsMax + 1, 4]), 'raidActions')).toMatchObject({ ok: false, gate: true });
  });

  it('per-day raids, loot share, success, pysanky and lootMult × incomeMult; each relic with its session', () => {
    expect(r.dayLog.length).toBe(4);
    for (const d of r.dayLog) {
      expect(d.raidDucats).toBeGreaterThanOrEqual(0);
      expect(d.raidDucats).toBeLessThanOrEqual(d.earnedDucats);
      expect(d.lootMult).toBeGreaterThanOrEqual(1);
      expect(d.incomeMult).toBeGreaterThanOrEqual(1);
    }
    const text = renderReport([r], checks);
    expect(text).toContain('### Raids');
    expect(text).toContain('lootMult × incomeMult');
    expect(text).toContain('| raid actions |');
  });
});
