// The bot's culture and hero policy (plan M4-09, SPEC §12.3): after the raids and before the Sich it buys the node rank
// or hero level of the best payback in «glory minutes», measured on the real core (the state after the real action);
// the chain step and the chore that ask for a rank / a level are followed at once, as a guided player would.
import { describe, expect, it } from 'vitest';
import { CULTURE_NODES, type CultureNodeId } from '../../../src/content/culture.ts';
import { HEROES } from '../../../src/content/heroes.ts';
import { BUY_MODES } from '../../../src/content/economy.ts';
import { CALENDAR_LAND1 } from '../../../src/content/pacing.ts';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { CHAIN_STEP_IDS, type ChainStepId, type ChoreId } from '../../../src/content/quests.ts';
import { applyAction, type Action } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { culturePrice, heroPrice } from '../../../src/core/systems/culture.ts';
import { chainQuest, choreQuest } from '../../../src/core/systems/quests.ts';
import {
  cultureCandidates,
  cultureChoice,
  PAYBACK_HORIZON_MIN,
  paybackMinutes,
} from '../../../tools/lib/balance/culture-policy.ts';
import { calendarSessions, renderReport, evaluate } from '../../../tools/lib/balance/report.ts';
import { simulate } from '../../../tools/lib/balance/sim.ts';

const T0 = 1_763_400_000_000;
/** Every beat seen (rules/testing.md): a hero is the one the state stores; no beat fires inside a test. */
const ALL_SEEN: GameState['story']['seen'] = [...STORY_BEAT_IDS];

/** Glory for any first rank or first hero level (×2), from content: a retune of prices does not break the fixtures. */
const PURSE =
  2 *
  Math.max(
    ...CULTURE_NODES.map((n) => culturePrice(n, 0, 1).toNumber()),
    ...HEROES.map((h) => heroPrice(h, 1, 1).toNumber()),
  );
/** Glory far past any single price (the top rank of the dearest node × 1000). */
const LOTS = 1000 * Math.max(...CULTURE_NODES.map((n) => culturePrice(n, n.maxRank - 1, 1).toNumber()));

/** A mid game: the farm and the Sich built up, «Музика» open (tavern), `glory` in the purse, the chain on `step`. */
function mid({
  step = 'khortytsia.treasury1',
  glory = LOTS,
  heroes = {},
  culture = {},
}: {
  step?: ChainStepId;
  glory?: number;
  heroes?: GameState['heroes'];
  culture?: GameState['culture'];
} = {}): GameState {
  const s = createInitialState({ seed: 3, now: T0 });
  const levels = Object.fromEntries(Object.keys(s.village.levels).map((id) => [id, 15])) as typeof s.village.levels;
  return {
    ...s,
    currencies: { ...s.currencies, glory: Big.from(glory) },
    village: { ...s.village, levels, sichLevels: { ...s.village.sichLevels, kurins: 12, maidan: 12 } },
    army: { ...s.army, infantry: 20 },
    heroes,
    culture,
    story: { seen: ALL_SEEN },
    quests: { ...s.quests, chain: { kind: 'listed', index: CHAIN_STEP_IDS.indexOf(step), base: 0 } },
  };
}

const onChore = (s: GameState, id: ChoreId): GameState => ({
  ...s,
  quests: { ...s.quests, chores: { ...s.quests.chores, active: id, base: 0 } },
});

/**
 * `s` with an army big enough that some candidate pays back within the horizon: doubled until one does (derived through
 * the policy's own measure, so it holds whatever the prices are).
 */
function paying(
  s: GameState,
  ok: (x: GameState) => boolean = (x) => cultureCandidates(x).some((a) => paybackMinutes(x, a) <= PAYBACK_HORIZON_MIN),
): GameState {
  for (let infantry = Math.max(1, s.army.infantry); infantry < 1e9; infantry *= 2) {
    const x: GameState = { ...s, army: { ...s.army, infantry } };
    if (ok(x)) return x;
  }
  throw new Error('no army makes the purchase pay back');
}

const refused = (s: GameState, a: Action): boolean =>
  applyAction(s, a, s.time.lastSeen).events.some((e) => e.type === 'ActionRejected');

describe('paybackMinutes: the purchase measured on the state after the real action', () => {
  it('an income node pays back in finite minutes; its next rank (dearer, the same share) pays back later', () => {
    const s = mid();
    const first = paybackMinutes(s, { type: 'buyCulture', id: 'music.dumy' });
    const after = applyAction(s, { type: 'buyCulture', id: 'music.dumy' }, s.time.lastSeen).state;
    const second = paybackMinutes(after, { type: 'buyCulture', id: 'music.dumy' });
    expect(Number.isFinite(first)).toBe(true);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it('more glory income now = a glory node is repaid in fewer minutes of it (price fixed)', () => {
    const weak = mid();
    const strong: GameState = { ...weak, army: { ...weak.army, infantry: 40 } };
    const a: Action = { type: 'buyCulture', id: 'music.maidan' };
    const withRoot = (s: GameState): GameState => ({ ...s, culture: { 'music.dumy': 1 } });
    expect(paybackMinutes(withRoot(strong), a)).toBeLessThan(paybackMinutes(withRoot(weak), a));
  });

  it('an effect the bot day does not use (the Характерник: raid time, relic chance) never pays back', () => {
    const s = mid({ heroes: { kharakternyk: 1 } });
    expect(paybackMinutes(s, { type: 'levelHero', id: 'kharakternyk', mode: 1 })).toBe(Infinity);
  });
});

describe('cultureChoice: the bot policy', () => {
  it('unasked: the affordable candidate of the lowest payback, and only within the horizon', () => {
    const s = paying(mid({ heroes: { otaman: 1 } }));
    const choice = cultureChoice(s);
    if (!choice) throw new Error('nothing chosen');
    const all = cultureCandidates(s).map((a) => paybackMinutes(s, a));
    expect(choice.paybackMin).toBe(Math.min(...all));
    expect(choice.paybackMin).toBeLessThanOrEqual(PAYBACK_HORIZON_MIN);
    expect(refused(s, choice.action)).toBe(false);
  });

  /** «Музика» closed (no tavern): the otaman is the only candidate; the army makes his level pay back. */
  const otamanOnly = (glory: number, ok?: (x: GameState) => boolean): GameState => {
    const base = mid({ heroes: { otaman: 1 }, glory });
    return paying({ ...base, village: { ...base.village, levels: { ...base.village.levels, tavern: 0 } } }, ok);
  };
  const ONE: Action = { type: 'levelHero', id: 'otaman', mode: 1 };
  const otaman = HEROES.find((h) => h.id === 'otaman');
  if (!otaman) throw new Error('no otaman');
  /** Levels of `n` ×1 presses from `s`, each paying back within the horizon (the policy's measure). */
  const allPay = (s: GameState, n: number): boolean => {
    let cur = s;
    for (let i = 0; i < n; i += 1) {
      if (refused(cur, ONE) || paybackMinutes(cur, ONE) > PAYBACK_HORIZON_MIN) return false;
      cur = applyAction(cur, ONE, cur.time.lastSeen).state;
    }
    return true;
  };

  it('a hero press is MAX when every level MAX buys pays back within the horizon', () => {
    // Glory for exactly two levels (from content): MAX buys two; the big army makes both pay back.
    const s = otamanOnly(heroPrice(otaman, 1, 2).toNumber() * 1.0001, (x) => allPay(x, 2));
    expect(cultureChoice(s)?.action).toEqual({ type: 'levelHero', id: 'otaman', mode: 'max' });
  });

  it('else the largest ×k of the picker whose every level pays back — never MAX past the horizon', () => {
    const s = otamanOnly(LOTS);
    const choice = cultureChoice(s);
    if (choice?.action.type !== 'levelHero') throw new Error('no hero press');
    const { mode } = choice.action;
    if (mode === 'max') throw new Error('MAX would buy levels past the horizon');
    expect(BUY_MODES).toContain(mode);
    expect(allPay(s, mode)).toBe(true);
    // The next step of the picker would buy a level that does not pay back.
    const steps: readonly number[] = BUY_MODES.filter((m) => m !== 'max');
    const bigger = steps.find((m) => m > mode);
    if (bigger !== undefined) expect(allPay(s, bigger)).toBe(false);
  });

  it('one press per hero per session review: a hero already pressed is not a candidate again', () => {
    const s = otamanOnly(LOTS);
    expect(cultureChoice(s)?.action.type).toBe('levelHero');
    expect(cultureChoice(s, new Set(['otaman']))).toBeNull();
    expect(cultureCandidates(s, new Set(['otaman']))).toEqual([]);
  });

  it('nothing affordable (no glory) → null; a candidate always passes the real action', () => {
    expect(cultureChoice(mid({ glory: 0, heroes: { otaman: 1 } }))).toBeNull();
    const s = mid({ glory: PURSE, heroes: { otaman: 1 } });
    for (const a of cultureCandidates(s)) expect(refused(s, a)).toBe(false);
  });

  it('`culture1` asks for a rank: bought even past the horizon, and the step is done', () => {
    // A poor glory income (no army): every payback is far past the horizon, yet the guided player learns the rank.
    const base = mid({ step: 'khortytsia.culture1', glory: PURSE });
    const s: GameState = { ...base, army: { ...base.army, infantry: 0 } };
    const choice = cultureChoice(s);
    expect(choice?.action.type).toBe('buyCulture');
    if (!choice) return;
    const after = applyAction(s, choice.action, s.time.lastSeen).state;
    expect(chainQuest(after)?.done).toBe(true);
  });

  it('«Вивчи ранг культури» / «Підвищ героя» chores: the asked kind is bought and the chore is done', () => {
    const poor = (s: GameState): GameState => ({ ...s, army: { ...s.army, infantry: 0 } });
    const c = poor(onChore(mid({ glory: PURSE }), 'chore.culture1'));
    const cc = cultureChoice(c);
    expect(cc?.action.type).toBe('buyCulture');
    if (cc) expect(choreQuest(applyAction(c, cc.action, c.time.lastSeen).state).done).toBe(true);
    const h = poor(onChore(mid({ glory: PURSE, heroes: { otaman: 1 } }), 'chore.hero1'));
    const hc = cultureChoice(h);
    expect(hc?.action.type).toBe('levelHero');
    if (hc) expect(choreQuest(applyAction(h, hc.action, h.time.lastSeen).state).done).toBe(true);
  });
});

describe('the bot plays culture and heroes (M4-09)', () => {
  const r = simulate({ seed: 1, days: 7 });
  const kinds = (k: string): string[] => r.novelties.filter((n) => n.kind === k).map((n) => n.ref);

  it('gets past `culture1` and the culture chores: the chain runs on, ranks and levels are bought', () => {
    expect(kinds('chainStep')).toContain('khortytsia.culture1');
    expect(kinds('chainStep')).toContain('khortytsia.treasury1');
    expect(r.final.stats.cultureRanks).toBeGreaterThan(0);
    expect(r.final.stats.heroLevels).toBeGreaterThan(0);
  });

  it('a session presses each hero at most once (a player uses the picker, not a run of ×1)', () => {
    for (const x of r.sessions) for (const n of Object.values(x.heroPresses)) expect(n).toBeLessThanOrEqual(1);
    expect(r.sessions.some((x) => Object.keys(x.heroPresses).length > 0)).toBe(true);
  });

  it('a chore asking for a culture rank is claimed and the rotation moves on', () => {
    const start = onChore(mid({ glory: PURSE }), 'chore.culture1');
    const played = simulate({ seed: 3, days: 1, initial: start });
    expect(choreQuest(played.final).id).not.toBe('chore.culture1');
    expect(played.sessions.reduce((a, s) => a + s.claims.chore, 0)).toBeGreaterThan(0);
  });

  it('novelties: each hero who joins, each branch that opens, the first rank of each node', () => {
    expect(kinds('heroJoined')).toContain('otaman');
    expect(kinds('cultureBranch')).toContain('music');
    const nodes = kinds('cultureNode');
    expect(nodes.length).toBe(new Set(nodes).size);
    for (const id of nodes) expect(CULTURE_NODES.some((n) => n.id === (id as CultureNodeId))).toBe(true);
    expect(r.final.culture[nodes[0] as CultureNodeId]).toBeGreaterThanOrEqual(1);
    // The otaman joins with «Рада на майдані», in the same session.
    const council = r.novelties.find((n) => n.kind === 'storyBeat' && n.ref === 'khortytsia.council');
    expect(r.novelties.find((n) => n.kind === 'heroJoined' && n.ref === 'otaman')?.session).toBe(council?.session);
  });

  it('the calendar has the M4 rows (heroes and branches), each measured', () => {
    const ids = ['hero-otaman', 'branch-music', 'hero-kobzar', 'branch-customs', 'hero-kharakternyk'];
    const rows = CALENDAR_LAND1.filter((c) => ids.includes(c.id));
    expect(rows.map((c) => c.id).sort()).toEqual([...ids].sort());
    const seen = calendarSessions(r, rows);
    expect(seen.slice(0, 2).every((x) => x !== null)).toBe(true);
  });

  it('glory spent on culture, heroes and the Sich is logged per day, within the glory the run earned', () => {
    const spent = r.dayLog.reduce(
      (a, d) => ({
        culture: a.culture + d.glorySpent.culture,
        heroes: a.heroes + d.glorySpent.heroes,
        sich: a.sich + d.glorySpent.sich,
      }),
      { culture: 0, heroes: 0, sich: 0 },
    );
    expect(spent.culture).toBeGreaterThan(0);
    expect(spent.heroes).toBeGreaterThan(0);
    expect(spent.sich).toBeGreaterThan(spent.culture);
    const report = renderReport([r], evaluate([r]));
    expect(report).toContain('### Glory spent');
    expect(report).toContain('### Modifiers by day');
    // One row per day in the modifiers table, the steady fields at the end of the day.
    const last = r.dayLog.at(-1);
    expect(last?.modifiers.incomeMult).toBeGreaterThan(1);
  });
});
