// M2-30: every debug preset is a state a real game can reach — the HUD of a preset must never show what play cannot
// («Козаки 40/37»). Each invariant below is one the core keeps in play (actions, advance, offline, claims).
import { describe, expect, it } from 'vitest';
import { TIER_LEVELS, START } from '../../../src/content/economy.ts';
import { QUEST_CHAIN, type QuestGoal } from '../../../src/content/quests.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { STORY_BEATS } from '../../../src/content/story.ts';
import { maxCossacks, sichUnlocked } from '../../../src/core/modifiers.ts';
import { validateState, type GameState } from '../../../src/core/state.ts';
import { questDay } from '../../../src/core/systems/quests.ts';
import { dueBeats, triggerMet } from '../../../src/core/systems/story.ts';
import { FROZEN_NOW, PRESETS, presetState, type Preset } from '../../../src/ui/debug/gameDebug.ts';

const sum = (r: Readonly<Record<string, number>>): number => Object.values(r).reduce((a, b) => a + b, 0);

const levelOf = (s: GameState, g: Exclude<QuestGoal, { kind: 'count' }>): number =>
  g.kind === 'building' ? s.village.levels[g.id] : s.village.sichLevels[g.id];

/** Every preset, `tiers` at each of its tiers. */
type Case = readonly [name: string, state: GameState];
const CASES: readonly Case[] = PRESETS.flatMap((p: Preset): Case[] =>
  p === 'tiers'
    ? Array.from({ length: TIER_LEVELS.farm.length + 1 }, (_, n) => [
        `tiers@${String(n)}`,
        presetState(p, 1, FROZEN_NOW, n),
      ])
    : [[p, presetState(p, 1, FROZEN_NOW)]],
);

describe.each(CASES)('debug preset %s is a state play can reach (M2-30)', (name, s) => {
  it('passes the save validator unchanged', () => {
    const r = validateState(JSON.parse(JSON.stringify(s)));
    expect(r.ok ? null : r.error).toBeNull();
    if (r.ok) expect(JSON.stringify(r.state)).toBe(JSON.stringify(s));
  });

  it('keeps the army within the food: infantry ≤ maxCossacks, every Cossack hired', () => {
    expect(s.army.infantry).toBeLessThanOrEqual(maxCossacks(s));
    expect(s.stats.hires).toBeGreaterThanOrEqual(s.army.infantry);
  });

  it('has bought every level it has: no locked Sich building with a level, purchases cover the levels', () => {
    for (const b of SICH_BUILDINGS) {
      if (s.village.sichLevels[b.id] > 0) expect(sichUnlocked(b, s), `${name}: ${b.id} locked`).toBe(true);
    }
    const levels = sum(s.village.levels) + sum(s.village.sichLevels);
    const built = [...Object.values(s.village.levels), ...Object.values(s.village.sichLevels)].filter((l) => l > 0);
    expect(s.stats.levelsBought).toBeGreaterThanOrEqual(levels);
    // One purchase buys levels of one building: at least one per building standing, never more than the levels.
    expect(s.stats.purchases).toBeGreaterThanOrEqual(built.length);
    expect(s.stats.purchases).toBeLessThanOrEqual(s.stats.levelsBought);
  });

  it('earned its ducats: the purse never holds more than the start money plus all it ever earned', () => {
    expect(s.currencies.ducats.lte(s.village.lifetimeDucats.add(START.ducats))).toBe(true);
  });

  it('has fired every beat it reached and none it did not', () => {
    // A new game is the one state whose opening beat is still to fire (its first check fires it).
    if (name !== 'fresh') expect(dueBeats(s, s.story.seen).map((b) => b.id)).toEqual([]);
    for (const id of s.story.seen) {
      const beat = STORY_BEATS.find((b) => b.id === id);
      expect(beat && triggerMet(s, beat.trigger), `${name}: ${id}`).toBe(true);
    }
  });

  it('keeps every hero its beats brought, and only those (M4-11): a seen hero beat stores the hero', () => {
    const brought = STORY_BEATS.flatMap((b) =>
      b.reward?.kind === 'unlock' && s.story.seen.includes(b.id) ? [b.reward.hero] : [],
    );
    expect(Object.keys(s.heroes).sort()).toEqual([...brought].sort());
    for (const id of brought) expect(s.heroes[id], `${name}: ${id}`).toBeGreaterThanOrEqual(1);
  });

  it('stands on a quest step play can reach: the passed level steps are met, the chores of today', () => {
    const c = s.quests.chain;
    const passed = c.kind === 'listed' ? c.index : QUEST_CHAIN.length;
    for (const step of QUEST_CHAIN.slice(0, passed)) {
      if (step.goal.kind !== 'count')
        expect(levelOf(s, step.goal), `${name}: ${step.id}`).toBeGreaterThanOrEqual(step.goal.level);
    }
    if (c.kind === 'generated' && c.goal.kind === 'sich') {
      const b = SICH_BUILDINGS.find((x) => x.id === c.goal.id);
      expect(b && sichUnlocked(b, s)).toBe(true);
    }
    expect(s.quests.chores.day).toBeLessThanOrEqual(questDay(s));
  });
});

describe('debug presets keep their pictures (M2-30)', () => {
  it('mid has 6 Cossacks; showcase a host above the 16 the scene shows', () => {
    expect(presetState('mid', 1, FROZEN_NOW).army.infantry).toBe(6);
    expect(presetState('showcase', 1, FROZEN_NOW).army.infantry).toBeGreaterThanOrEqual(16);
  });
});

describe('state=raids (M3-09, M3-16 AC): one squad away, one back, one relic — on every seed', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'seed %i: squad 1 back from scouting, squad 2 on patrol, a relic',
    (seed) => {
      const s = presetState('raids', seed, FROZEN_NOW);
      const [a, b] = s.raids.slots;
      expect([a?.kind, b?.kind]).toEqual(['returned', 'running']);
      expect(a?.kind === 'returned' ? a.raid.tier : null).toBe('m5');
      expect(b?.kind === 'running' ? [b.raid.tier, b.raid.returnAt > FROZEN_NOW] : null).toEqual(['m30', true]);
      expect(s.relics).toHaveLength(1);
      expect(s.time.lastSeen).toBe(FROZEN_NOW);
    },
  );
});

describe('state=chests (M3-12): two squads back, one with a relic — the chest window’s screens', () => {
  it.each([1, 2, 3, 4, 5, 6])('seed %i: both back, squad 1 brings a relic no one found yet', (seed) => {
    const s = presetState('chests', seed, FROZEN_NOW);
    const [a, b] = s.raids.slots;
    expect([a?.kind, b?.kind]).toEqual(['returned', 'returned']);
    const relic = a?.kind === 'returned' ? a.raid.loot.relic : null;
    expect(relic).not.toBeNull();
    expect(s.relics).not.toContain(relic);
    expect(s.time.lastSeen).toBe(FROZEN_NOW);
  });
});
