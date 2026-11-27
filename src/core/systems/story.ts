// Story beats (SPEC §2.5; plan §0 «Віхи», M2-22). Triggers are monotone, so a beat is due from the first check at
// which its trigger holds and stays due until it fires: `advance` checks at its end and `applyAction` after an
// accepted action, which is what makes an 8 h absence fire the same beats with the same rewards as the online ticks
// (rewards use steady rates, reward.ts). A beat fires once: `story.seen` records it. The v1 → v2 migration marks the
// beats already due as seen silently (no event, no reward) through `dueBeats` on the raw save's facts; the debug
// presets of a played game do the same (ui/debug/gameDebug.ts).
import { STORY_BEATS, type StoryBeat, type StoryTrigger } from '../../content/story.ts';
import type { GameEvent } from '../events.ts';
import type { GameState, Stats } from '../state.ts';
import { bloomStatus, type BloomFacts } from './bloom.ts';
import { grantReward } from './reward.ts';

/** What a trigger reads: the land and the hire counter (narrow, so a raw v1 save can be checked too). */
export type StoryFacts = BloomFacts & { readonly stats: Pick<Stats, 'hires'> };

export function triggerMet(facts: StoryFacts, t: StoryTrigger): boolean {
  switch (t.kind) {
    case 'start':
      return true;
    case 'building':
      return facts.village.levels[t.id] >= t.level;
    case 'sich':
      return facts.village.sichLevels[t.id] >= t.level;
    case 'hired':
      return facts.stats.hires >= t.count;
    case 'storms':
      return facts.village.mechanic.stormsSurvived >= t.count;
    case 'bloom':
      return bloomStatus(facts).reached;
  }
}

/**
 * The beats that are due and not seen yet, in content order. One land so far: when land 2 comes (M5), filter by
 * `b.land === facts.village.id` here (the type makes that comparison constant today).
 */
export function dueBeats(facts: StoryFacts, seen: readonly string[]): StoryBeat[] {
  return STORY_BEATS.filter((b) => !seen.includes(b.id) && triggerMet(facts, b.trigger));
}

/**
 * Fires every due beat: marks it seen, grants its reward (a hero: `HeroJoined` after it), emits `StoryBeatReached`. Several beats due at one check (a
 * long absence, a migrated save) fire in content order (STORY_BEATS), not in the order their triggers came true.
 */
export function checkStory(state: GameState): { state: GameState; events: GameEvent[] } {
  const due = dueBeats(state, state.story.seen);
  if (due.length === 0) return { state, events: [] };
  let s = state;
  const events: GameEvent[] = [];
  for (const beat of due) {
    const r = beat.reward;
    const g = r !== null && r.kind !== 'unlock' ? grantReward(s, r) : null;
    s = g ? g.state : s;
    s = { ...s, story: { seen: [...s.story.seen, beat.id] } };
    events.push({ type: 'StoryBeatReached', id: beat.id, granted: g ? g.granted : null });
    // A hero beat brings its hero at level 1 for free (Q6, ADR 013). One already there (a crafted save, the beat unseen)
    // keeps his level and does not join again.
    if (r?.kind === 'unlock' && s.heroes[r.hero] === undefined) {
      s = { ...s, heroes: { ...s.heroes, [r.hero]: 1 } };
      events.push({ type: 'HeroJoined', id: r.hero });
    }
  }
  return { state: s, events };
}
