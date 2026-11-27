// Stand-in beats for the heroes no story beat brings yet (the Кобзар and the Характерник come with M4-08). A test file
// that needs such a hero mocks the story content with them (vi.mock is hoisted, so the factory imports this module):
//   vi.mock('../../../src/content/story.ts', async (importOriginal) =>
//     (await import('./hero-beats.ts')).withHeroBeats(await importOriginal()));
// Each stand-in has an unreachable action trigger, so it never fires by itself: a test marks it seen (all of
// STORY_BEAT_IDS) and stores the hero's level, as a save after his beat would. Type-only imports: a value import of the
// story module here would load the mock from inside its own factory.
// TODO(M4-08): the real beats arrive; then this module and its mocks go.
import type { HeroId } from '../../../src/content/heroes.ts';
import type * as Story from '../../../src/content/story.ts';

type StoryModule = typeof Story;

/** The stand-in beat id of `hero` (outside the content union: it lives only in a mocked module). */
export const standInBeat = (hero: HeroId): Story.StoryBeatId => `khortytsia.${hero}-test` as Story.StoryBeatId;

/** `real` with one stand-in beat per hero that no beat of `real` brings, appended (ids and beats alike). */
export function withHeroBeats(real: StoryModule, heroes: readonly HeroId[] = ['kobzar', 'kharakternyk']): StoryModule {
  const brought = new Set(real.STORY_BEATS.flatMap((b) => (b.reward?.kind === 'unlock' ? [b.reward.hero] : [])));
  const missing = heroes.filter((h) => !brought.has(h));
  const beats: Story.StoryBeat[] = missing.map((hero) => ({
    id: standInBeat(hero),
    land: 'khortytsia',
    trigger: { kind: 'hired', count: Number.MAX_SAFE_INTEGER },
    portrait: 'kobzar',
    reward: { kind: 'unlock', hero },
    titleKey: 'story.test.title',
    textKey: 'story.test.text',
  }));
  return {
    ...real,
    // The content's id tuple is a literal type; a mocked module needs a longer one (test-only, never in src).
    STORY_BEAT_IDS: [...real.STORY_BEAT_IDS, ...beats.map((b) => b.id)] as unknown as StoryModule['STORY_BEAT_IDS'],
    STORY_BEATS: [...real.STORY_BEATS, ...beats],
  };
}
