// A beat whose trigger comes true partway through an absence (M2-22 review): land 1 has no storms beat yet, so the
// content gets a synthetic one — «one more storm weathered» with an income reward (the windmill's wind matters).
// Online steps and one offline advance must fire it once, with the same reward, whatever the wind at that moment.
import { describe, expect, it, vi } from 'vitest';
import type { StoryBeat, StoryBeatId } from '../../../src/content/story.ts';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { FARM_BUILDING_IDS, KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { tick } from '../../../src/core/offline.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { stormStarts, windAt } from '../../../src/core/systems/village-mechanics/wind.ts';

// A synthetic id outside the content union: it only lives in this file's mocked content (hoisted with vi.mock).
const { STORM_BEAT, STORMS_BEFORE } = vi.hoisted(() => ({
  STORM_BEAT: 'khortytsia.storm-test' as StoryBeatId,
  STORMS_BEFORE: 2,
}));

vi.mock('../../../src/content/story.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/content/story.ts')>();
  const storm: StoryBeat = {
    id: STORM_BEAT,
    land: 'khortytsia',
    trigger: { kind: 'storms', count: STORMS_BEFORE + 1 },
    portrait: 'kobzar',
    reward: { kind: 'incomeMinutes', minutes: 10 },
    titleKey: 'story.test.title',
    textKey: 'story.test.text',
  };
  return { ...real, STORY_BEATS: [...real.STORY_BEATS, storm] };
});

const T0 = 1_763_400_000_000;
const SEC = 1000;
const HOUR = 3600 * SEC;
const END = T0 + 8 * HOUR;

/** A seed whose first storm in the window starts well inside it (not at T0). */
function seedWithStorm(): { seed: number; at: number } {
  for (let seed = 1; seed < 500; seed++) {
    const at = stormStarts(seed, T0, END)[0];
    if (at !== undefined && at > T0 + HOUR && at < END - HOUR) return { seed, at };
  }
  throw new Error('no seed with a storm inside the window');
}

/** One storm short of the beat, windmill high enough to weather storms, every real beat already seen. */
function oneStormShort(seed: number): GameState {
  const s = createInitialState({ seed, now: T0 });
  const levels = Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, 30])) as GameState['village']['levels'];
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(1000) },
    village: {
      ...s.village,
      levels: { ...levels, windmill: KHORTYTSIA.bloomGoal.windmillLevel },
      mechanic: { kind: 'wind', stormsSurvived: STORMS_BEFORE },
    },
    story: { seen: [...STORY_BEAT_IDS] },
  };
}

type Reached = Extract<GameEvent, { type: 'StoryBeatReached' }>;
const reached = (events: readonly GameEvent[]): Reached[] =>
  events.filter((e): e is Reached => e.type === 'StoryBeatReached');
const summary = (events: readonly GameEvent[]): unknown[] =>
  reached(events).map((e) => ({
    id: e.id,
    currency: e.granted?.currency,
    amount: e.granted && typeof e.granted.amount !== 'number' ? e.granted.amount.toString() : e.granted?.amount,
  }));

describe('a trigger that comes true during an absence (M2-22 review)', () => {
  const { seed, at } = seedWithStorm();

  it('the beat is not due at the start, and fires at the storm in both online and offline play', () => {
    const s = oneStormShort(seed);
    expect(reached(advance(s, at - 1).events)).toEqual([]);

    const offline = advance(s, END);
    let online = s;
    const events: GameEvent[] = [];
    let firedAt: number | null = null;
    for (let t = T0 + 5 * SEC; t <= END; t += 5 * SEC) {
      const r = advance(online, t);
      if (reached(r.events).length > 0) firedAt = t;
      events.push(...r.events);
      online = r.state;
    }
    // Online it fires at the first step after the storm began; offline at the end of the window — the same reward.
    expect(firedAt).not.toBeNull();
    expect(firedAt).toBeGreaterThanOrEqual(at);
    expect(firedAt).toBeLessThan(at + 5 * SEC);
    expect(summary(offline.events)).toHaveLength(1);
    expect(summary(events)).toEqual(summary(offline.events));
    expect(online.story.seen).toEqual(offline.state.story.seen);
    expect(online.time.lastSeen).toBe(END);
    expect(offline.state.time.lastSeen).toBe(END);
  });

  it('through tick: 1 s ticks and one return after 8 h (applyOffline) give the same beat and reward', () => {
    const s = oneStormShort(seed);
    const back = tick(s, END);
    let online = s;
    const events: GameEvent[] = [];
    for (let t = T0 + SEC; t <= END; t += SEC) {
      const r = tick(online, t);
      events.push(...r.events);
      online = r.state;
    }
    expect(summary(back.events)).toHaveLength(1);
    expect(summary(events)).toEqual(summary(back.events));
  });

  it('the reward is the same whether it is granted in the storm or later in another wind', () => {
    const s = oneStormShort(seed);
    // Advance to a moment in the storm, and to a later moment without one: the beat fires once in each run.
    expect(windAt(seed, at)).toBe('storm');
    let later = at + HOUR;
    while (windAt(seed, later) === 'storm') later += 60 * SEC;
    const inStorm = summary(advance(s, at).events);
    const afterStorm = summary(advance(s, later).events);
    expect(inStorm).toHaveLength(1);
    expect(inStorm).toEqual(afterStorm);
  });
});
