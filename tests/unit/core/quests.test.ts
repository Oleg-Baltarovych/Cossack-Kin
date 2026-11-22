// «Наказ кошового» and chores (plan M2-23, SPEC §3.10, §3.9 «День»).
import { describe, expect, it } from 'vitest';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import { CHAIN, CHORES, QUEST_CHAIN, type ChoreDef, type QuestGoal } from '../../../src/content/quests.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { validateState } from '../../../src/core/state.ts';
import {
  chainQuest,
  choreQuest,
  dayAt,
  generatedGoal,
  generatedTarget,
  nextChore,
  questDay,
  questRef,
} from '../../../src/core/systems/quests.ts';
import { SICH_BUILDING_IDS } from '../../../src/content/sich.ts';

const T0 = 1_763_400_000_000; // 2025-11-17 17:20 UTC
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Money for anything; nothing built. */
function wealthy(seed = 5, now = T0): GameState {
  const s = createInitialState({ seed, now });
  return { ...s, currencies: { ...s.currencies, ducats: Big.from(1e30), glory: Big.from(1e30) } };
}

/** `state` with `goal` met (counted from `base` for a count goal) — set directly, like a played game would. */
function meet(state: GameState, goal: QuestGoal, base = 0): GameState {
  switch (goal.kind) {
    case 'building':
      return {
        ...state,
        village: {
          ...state.village,
          levels: { ...state.village.levels, [goal.id]: Math.max(state.village.levels[goal.id], goal.level) },
        },
      };
    case 'sich':
      return {
        ...state,
        village: {
          ...state.village,
          sichLevels: {
            ...state.village.sichLevels,
            [goal.id]: Math.max(state.village.sichLevels[goal.id], goal.level),
          },
        },
      };
    case 'count':
      return { ...state, stats: { ...state.stats, [goal.stat]: base + goal.n } };
  }
}

const claim = (s: GameState, kind: 'chain' | 'chore', now = s.time.lastSeen) =>
  applyAction(s, { type: 'claimQuest', kind }, now);

const of = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** Meets the active chain step and claims it. */
function claimChain(s: GameState): { state: GameState; events: readonly GameEvent[] } {
  const q = chainQuest(s);
  if (!q) throw new Error('no chain step');
  return claim(meet(s, q.goal, q.base), 'chain');
}

/** Meets the active chore and claims it at `now`. */
function claimChore(s: GameState, now = s.time.lastSeen): { state: GameState; events: readonly GameEvent[] } {
  const q = choreQuest(s);
  return claim(meet(s, q.goal, q.base), 'chore', now);
}

describe('«Наказ кошового»: the chain in order (M2-23)', () => {
  it('a new game starts on the first step, not done', () => {
    const q = chainQuest(createInitialState({ seed: 1, now: T0 }));
    expect(q).toMatchObject({ id: QUEST_CHAIN[0]?.id, done: false, progress: 0 });
  });

  it('goes through every listed step in content order, each claimed once with its reward', () => {
    let s = wealthy();
    const claimed: string[] = [];
    for (let i = 0; i < QUEST_CHAIN.length; i++) {
      const r = claimChain(s);
      const c = of(r.events, 'QuestClaimed');
      expect(c).toHaveLength(1);
      expect(c[0]?.kind).toBe('chain');
      expect(c[0]?.granted).not.toBeNull();
      claimed.push(c[0]?.id ?? '');
      s = r.state;
    }
    expect(claimed).toEqual(QUEST_CHAIN.map((q) => q.id));
  });

  it('a step is completed by an action: QuestCompleted once, then the claim grants the reward', () => {
    // Little money and glory, so the reward is visible in the sum (1e30 + 300 is 1e30).
    const w = wealthy();
    const s = { ...w, currencies: { ...w.currencies, ducats: Big.from(1000), glory: Big.ZERO } };
    const bought = applyAction(s, { type: 'buyBuilding', id: 'field', mode: 1 }, T0);
    expect(of(bought.events, 'QuestCompleted')).toEqual([
      { type: 'QuestCompleted', kind: 'chain', id: 'khortytsia.field1' },
    ]);
    const again = applyAction(bought.state, { type: 'buyBuilding', id: 'field', mode: 1 }, T0);
    expect(of(again.events, 'QuestCompleted')).toEqual([]);
    const r = claim(again.state, 'chain');
    const granted = of(r.events, 'QuestClaimed')[0]?.granted;
    // The first farm step pays glory (M2-27, SPEC §3.10).
    expect(QUEST_CHAIN[0]?.reward.kind).toBe('gloryMinutes');
    expect(granted?.currency).toBe('glory');
    if (granted?.currency !== 'glory') return;
    expect(r.state.currencies.glory.sub(again.state.currencies.glory).toNumber()).toBeCloseTo(
      granted.amount.toNumber(),
    );
    expect(chainQuest(r.state)?.id).toBe(QUEST_CHAIN[1]?.id);
  });

  it('a count step counts from its start: hires before it do not count', () => {
    let s = wealthy();
    const hireAt = QUEST_CHAIN.findIndex((q) => q.goal.kind === 'count');
    // Hire many before the step is reached.
    s = { ...s, army: { infantry: 50 }, stats: { ...s.stats, hires: 50 } };
    for (let i = 0; i < hireAt; i++) s = claimChain(s).state;
    const q = chainQuest(s);
    expect(q?.goal.kind).toBe('count');
    expect(q).toMatchObject({ base: 50, progress: 0, done: false });
  });

  it('a step already met when it becomes active is completed at once (claim → QuestCompleted)', () => {
    const first = QUEST_CHAIN[0];
    const second = QUEST_CHAIN[1];
    if (!first || !second) throw new Error('chain');
    const s = meet(meet(wealthy(), first.goal), second.goal);
    const r = claim(s, 'chain');
    expect(of(r.events, 'QuestCompleted')).toEqual([{ type: 'QuestCompleted', kind: 'chain', id: second.id }]);
  });

  it('after the list: a generated step to the nearest building to its next milestone, fixed while it runs', () => {
    // Every listed goal is met by these levels; the apiary (72 → 75) is nearest to a milestone.
    const levels = Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, 60])) as GameState['village']['levels'];
    const w = wealthy();
    let s: GameState = {
      ...w,
      village: {
        ...w.village,
        levels: { ...levels, apiary: 72 },
        sichLevels: {
          ...w.village.sichLevels,
          kurins: 30,
          maidan: 30,
          walls: 30,
          treasury: 30,
          church: 30,
          special: 30,
        },
      },
    };
    for (let i = 0; i < QUEST_CHAIN.length; i++) s = claimChain(s).state;
    const g = chainQuest(s);
    expect(g).toMatchObject({ id: 'chain.generated', done: false, titleKey: CHAIN.generated.titleKey });
    expect(g?.goal).toEqual({ kind: 'building', id: 'apiary', level: 75 });
    expect(g?.reward).toEqual(CHAIN.generated.reward.building);
    // The goal stays put while another building gets nearer.
    const moved = applyAction(s, { type: 'buyBuilding', id: 'field', mode: 10 }, s.time.lastSeen).state;
    expect(moved.village.levels.field).toBe(70);
    expect(chainQuest(moved)?.goal).toEqual({ kind: 'building', id: 'apiary', level: 75 });
    // Done → claimed → the next generated step from the levels of that moment: the field, 70 → 75.
    const next = claim(meet(moved, { kind: 'building', id: 'apiary', level: 75 }), 'chain');
    expect(of(next.events, 'QuestClaimed')[0]).toMatchObject({ kind: 'chain', id: 'chain.generated' });
    expect(chainQuest(next.state)?.goal).toEqual({ kind: 'building', id: 'field', level: 75 });
  });

  it('a Sich building can be the nearest; its reward is glory', () => {
    let s = wealthy();
    const levels = Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, 60])) as GameState['village']['levels'];
    s = {
      ...s,
      village: {
        ...s.village,
        levels,
        sichLevels: {
          ...s.village.sichLevels,
          kurins: 30,
          maidan: 49,
          walls: 30,
          treasury: 30,
          church: 30,
          special: 30,
        },
      },
    };
    for (let i = 0; i < QUEST_CHAIN.length; i++) s = claimChain(s).state;
    expect(chainQuest(s)?.goal).toEqual({ kind: 'sich', id: 'maidan', level: 50 });
    expect(chainQuest(s)?.reward).toEqual(CHAIN.generated.reward.sich);
  });
});

describe('chores (M2-23)', () => {
  it('rotate with hash32: the same seed gives the same order, another seed another; no chore twice in a row', () => {
    const order = (seed: number): string[] => {
      let prev: ChoreDef | null = null;
      const out: string[] = [];
      for (let n = 0; n < 40; n++) {
        prev = nextChore(seed, n, prev?.id ?? null);
        out.push(prev.id);
      }
      return out;
    };
    expect(order(1)).toEqual(order(1));
    expect(order(1)).not.toEqual(order(2));
    for (const seq of [order(1), order(2), order(3)])
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    // Over many picks every chore of the pool comes up.
    const seen = new Set<string>();
    for (let n = 0; n < 400; n++) seen.add(nextChore(7, n, null).id);
    expect([...seen].sort()).toEqual(CHORES.pool.map((c) => c.id).sort());
  });

  it('`requires` drops chores whose system is not in the build (the raid is M3)', () => {
    const raid: ChoreDef = {
      id: 'chore.taps50',
      goal: { kind: 'count', stat: 'taps', n: 1 },
      reward: { kind: 'incomeMinutes', minutes: 1 },
      requires: 'raids',
      titleKey: 'x',
    };
    const pool: readonly ChoreDef[] = [raid, ...CHORES.pool.slice(1)];
    const picks = (systems: readonly ('raids' | 'storks')[]): ChoreDef[] =>
      Array.from({ length: 300 }, (_, n) => nextChore(3, n, null, pool, systems));
    expect(picks([]).some((c) => c === raid)).toBe(false);
    expect(picks(['raids']).some((c) => c === raid)).toBe(true);
  });

  it('after a claim the next chore is active at once, counted from that moment', () => {
    const s = wealthy();
    const first = choreQuest(s);
    const r = claimChore(s);
    const second = choreQuest(r.state);
    expect(second.id).not.toBe(first.id);
    expect(second.done).toBe(false);
    expect(second.progress).toBe(0);
    expect(r.state.quests.chores.n).toBe(1);
  });

  it('the 11th chore of a day gives no reward; the counter still runs; the next day pays again', () => {
    let s = wealthy();
    const grants: (string | null)[] = [];
    for (let i = 0; i < CHORES.maxClaimsPerDay + 1; i++) {
      const before = s.currencies;
      const r = claimChore(s);
      const c = of(r.events, 'QuestClaimed')[0];
      expect(c?.kind).toBe('chore');
      grants.push(c?.granted ? c.granted.currency : null);
      if (i === CHORES.maxClaimsPerDay) {
        expect(r.state.currencies.ducats.eq(before.ducats)).toBe(true);
        expect(r.state.currencies.glory.eq(before.glory)).toBe(true);
      }
      s = r.state;
    }
    expect(grants.slice(0, CHORES.maxClaimsPerDay).every((g) => g !== null)).toBe(true);
    expect(grants[CHORES.maxClaimsPerDay]).toBeNull();
    expect(s.quests.chores.claims).toBe(CHORES.maxClaimsPerDay + 1);
    expect(s.quests.chores.n).toBe(CHORES.maxClaimsPerDay + 1);
    const tomorrow = claimChore(s, T0 + DAY);
    expect(of(tomorrow.events, 'QuestClaimed')[0]?.granted).not.toBeNull();
    expect(tomorrow.state.quests.chores.claims).toBe(1);
  });

  it('the day does not change when the clock is set back (SPEC §3.9): no fresh rewards', () => {
    let s = wealthy();
    for (let i = 0; i < CHORES.maxClaimsPerDay; i++) s = claimChore(s).state;
    // The clock goes back two days, then a day: maxSeen holds, so the day is the same one.
    for (const back of [T0 - 2 * DAY, T0 - DAY, T0 - 1]) {
      const r = claimChore(s, back);
      expect(of(r.events, 'QuestClaimed')[0]?.granted).toBeNull();
      expect(questDay(r.state)).toBe(questDay(s));
      s = r.state;
    }
  });

  it('the day is the local one: tzOffsetMin moves midnight', () => {
    // 2025-11-17 23:30 UTC: still the 17th in UTC, already the 18th in Kyiv (UTC+2).
    const late = Date.UTC(2025, 10, 17, 23, 30);
    const utc = createInitialState({ seed: 1, now: late });
    const kyiv = { ...utc, settings: { ...utc.settings, tzOffsetMin: 120 } };
    expect(questDay(kyiv)).toBe(questDay(utc) + 1);
    expect(questDay(utc)).toBe(Math.floor(late / DAY));
  });

  it('a time zone moved west never takes the day back (claims of today stay counted)', () => {
    let s = { ...wealthy(), settings: { ...wealthy().settings, tzOffsetMin: 840 } };
    for (let i = 0; i < CHORES.maxClaimsPerDay; i++) s = claimChore(s).state;
    s = { ...s, settings: { ...s.settings, tzOffsetMin: -720 } };
    expect(of(claimChore(s).events, 'QuestClaimed')[0]?.granted).toBeNull();
  });
});

describe('claimQuest only for a finished quest (M2-23)', () => {
  it('an unfinished chain step or chore is refused: with no time passed the state object is the same (a refusal leaves the advanced state unchanged), ActionRejected notDone', () => {
    const s = wealthy();
    for (const kind of ['chain', 'chore'] as const) {
      const r = claim(s, kind);
      expect(r.state).toBe(s);
      expect(r.events).toEqual([{ type: 'ActionRejected', action: 'claimQuest', reason: 'notDone' }]);
    }
  });

  it('a claimed step cannot be claimed twice', () => {
    const r = claimChain(wealthy());
    const again = claim(r.state, 'chain');
    expect(again.state).toBe(r.state);
    expect(of(again.events, 'ActionRejected')).toHaveLength(1);
  });

  it('a chore half done is not done', () => {
    const s = wealthy();
    const q = choreQuest(s);
    const half = { ...s, stats: { ...s.stats, [q.goal.stat]: q.base + q.goal.n / 2 } };
    expect(claim(half, 'chore').state).toBe(half);
  });
});

/** Every building of the land at `farm` / every Sich building at `sich`. */
function landAt(s: GameState, farm: number, sich: number): GameState {
  const levels = Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, farm])) as GameState['village']['levels'];
  const sichLevels = Object.fromEntries(
    SICH_BUILDING_IDS.map((id) => [id, sich]),
  ) as GameState['village']['sichLevels'];
  return { ...s, village: { ...s.village, levels, sichLevels } };
}

describe('review fixes (M2-23)', () => {
  it('every building at max: no generated goal, the chain is done, chainQuest is null and a chain claim notDone', () => {
    let s = landAt(wealthy(), 100, 50);
    expect(generatedGoal(s)).toBeNull();
    for (let i = 0; i < QUEST_CHAIN.length; i++) s = claimChain(s).state;
    expect(s.quests.chain).toEqual({ kind: 'done' });
    expect(chainQuest(s)).toBeNull();
    const r = claim(s, 'chain');
    expect(r.state).toBe(s);
    expect(of(r.events, 'ActionRejected')[0]?.reason).toBe('notDone');
  });

  it('a locked Sich building is never the nearest (the church before farm 25, the foundry before land 5)', () => {
    // The church and the foundry stand at 0 (gap 1 to tier I) but are locked: the farm (20 → 25) wins.
    const locked = landAt(wealthy(), 20, 10);
    const lockedSich = {
      ...locked,
      village: { ...locked.village, sichLevels: { ...locked.village.sichLevels, church: 0, cannonry: 0 } },
    };
    expect(generatedGoal(lockedSich)).toEqual({ kind: 'building', id: 'field', level: 25 });
    // Farm at 30 opens the church: now it is nearest (0 → 1); the foundry stays locked.
    const open = landAt(wealthy(), 30, 10);
    const openSich = {
      ...open,
      village: { ...open.village, sichLevels: { ...open.village.sichLevels, church: 0, cannonry: 0 } },
    };
    expect(generatedGoal(openSich)).toEqual({ kind: 'sich', id: 'church', level: 1 });
  });

  it('the pysanky steps pay exactly their pysanky, once (fair 2, church 3)', () => {
    let s = wealthy();
    const paid = new Map<string, number>();
    for (let i = 0; i < QUEST_CHAIN.length; i++) {
      const before = s.currencies.pysanky;
      const r = claimChain(s);
      const id = of(r.events, 'QuestClaimed')[0]?.id ?? '';
      paid.set(id, (paid.get(id) ?? 0) + r.state.currencies.pysanky - before);
      s = r.state;
    }
    expect(paid.get('khortytsia.fair1')).toBe(2);
    expect(paid.get('khortytsia.church1')).toBe(3);
    const others = [...paid].filter(([id]) => id !== 'khortytsia.fair1' && id !== 'khortytsia.church1');
    expect(others.every(([, n]) => n === 0)).toBe(true);
  });

  it('the chain index only moves forward, one step per claim; a crafted earlier index is accepted (SPEC §9.5)', () => {
    let s = wealthy();
    const seen: number[] = [];
    for (let i = 0; i < QUEST_CHAIN.length - 1; i++) {
      s = claimChain(s).state;
      const c = s.quests.chain;
      seen.push(c.kind === 'listed' ? c.index : -1);
    }
    expect(seen).toEqual(Array.from({ length: QUEST_CHAIN.length - 1 }, (_, i) => i + 1));
    // An exported save edited back to step 0 loads (export is trusted, checksum is no anti-cheat).
    const back = { ...s, quests: { ...s.quests, chain: { kind: 'listed' as const, index: 0, base: 0 } } };
    expect(validateState(JSON.parse(JSON.stringify(back))).ok).toBe(true);
  });

  it('an action that finishes the active chore emits QuestCompleted for it; the claim then QuestClaimed', () => {
    const seed = Array.from({ length: 200 }, (_, i) => i).find(
      (x) => nextChore(x, 0, null).goal.stat === 'levelsBought',
    );
    if (seed === undefined) throw new Error('no seed with a levels chore first');
    const s = wealthy(seed);
    const id = choreQuest(s).id;
    const r = applyAction(s, { type: 'buyBuilding', id: 'garden', mode: 25 }, T0);
    expect(of(r.events, 'QuestCompleted')).toContainEqual({ type: 'QuestCompleted', kind: 'chore', id });
    const c = claim(r.state, 'chore');
    expect(of(c.events, 'QuestClaimed')[0]).toMatchObject({ kind: 'chore', id });
  });

  it('time-zone swings −720 → +840 → −720 while time runs: the day never goes back; rewards ≤ 10 per day reached', () => {
    let s: GameState = { ...wealthy(), settings: { ...wealthy().settings, tzOffsetMin: -720 } };
    const zones = [-720, 840, -720, 840, -720];
    let rewarded = 0;
    let lastDay = s.quests.chores.day;
    let now = T0;
    for (const tz of zones) {
      s = applyAction(s, { type: 'setSettings', tzOffsetMin: tz }, now).state;
      for (let i = 0; i < CHORES.maxClaimsPerDay + 2; i++) {
        const r = claimChore(s, now);
        if (of(r.events, 'QuestClaimed')[0]?.granted) rewarded++;
        expect(r.state.quests.chores.day).toBeGreaterThanOrEqual(lastDay);
        lastDay = r.state.quests.chores.day;
        s = r.state;
      }
      now += 8 * HOUR;
    }
    // Days the chores can have seen: from the westernmost day of the start to the easternmost of the end.
    const days = dayAt(s.time.maxSeen, 840) - dayAt(T0, -720) + 1;
    expect(rewarded).toBeLessThanOrEqual(CHORES.maxClaimsPerDay * days);
    // Back to the west at the end: no new day came from it.
    expect(s.quests.chores.day).toBe(lastDay);
  });
});

describe('questRef: one stable name per quest (M2-27: the balance log and the strip share the generated rule)', () => {
  it('a listed step and a chore are their ids; a generated step names its building and level', () => {
    const s = wealthy();
    const listed = chainQuest(s);
    if (!listed) throw new Error('no chain step');
    expect(questRef(listed)).toBe(QUEST_CHAIN[0]?.id);
    expect(generatedTarget(listed)).toBeNull();
    expect(questRef(choreQuest(s))).toBe(s.quests.chores.active);
    const gen = chainQuest({
      ...s,
      quests: { ...s.quests, chain: { kind: 'generated', goal: { kind: 'building', id: 'field', level: 75 } } },
    });
    if (!gen) throw new Error('no generated step');
    expect(generatedTarget(gen)).toEqual({ kind: 'building', id: 'field', level: 75 });
    expect(questRef(gen)).toBe('generated:field@75');
  });
});
