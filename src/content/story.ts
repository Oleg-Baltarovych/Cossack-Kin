// Story beats of the lands (SPEC §2.5; plan §0 «Віхи», M2-22, Q7, Q14). A beat is a short historical scene — a title,
// 1–3 sentences and a portrait from the sprites the game already has — that fires once, when its monotone trigger
// first holds (checked by the core after every `advance` and action, so offline too). Land 1 in M2 has only the
// beats whose triggers exist in this build: «Рада на майдані» brings the otaman (M4-04, save v5), «Вниз за
// пороги» (bloom → resettling) comes with M5. Texts: i18n `story.<land>.<beat>.title|text`, sources in
// docs/content-sources.md. Reward sizes: гіпотеза, kept small — 10/15/30 min pushed Майдан 10 to S2 and the session
// actions over 15 (pnpm balance, M2-22); kept in M2-27 (the retune slowed the economy instead, plan R4).
import type { HeroId } from './heroes.ts';
import type { Reward } from './rewards.ts';
import type { SichBuildingId } from './sich.ts';
import type { FarmBuildingId } from './villages/khortytsia.ts';

export const STORY_BEAT_IDS = [
  'khortytsia.shore',
  'khortytsia.messenger',
  'khortytsia.council',
  'khortytsia.pokrova',
] as const;
export type StoryBeatId = (typeof STORY_BEAT_IDS)[number];

/** Who looks out of the beat's frame (Q14: an existing sprite ×2; 48×48 portraits are M9). */
export type PortraitId = 'kobzar' | 'messenger' | 'otaman';

/** The largest sprite frame a portrait box holds (atlas px); the box is twice that (plan M2-25). Cosmetic. */
export const PORTRAIT_MAX_PX = { w: 32, h: 36 } as const;

/** A monotone condition: once it holds, it holds for good (levels and counters only grow within a land). */
export type StoryTrigger =
  | { readonly kind: 'start' }
  | { readonly kind: 'building'; readonly id: FarmBuildingId; readonly level: number }
  | { readonly kind: 'sich'; readonly id: SichBuildingId; readonly level: number }
  /** Cossacks hired in this land, all told (`stats.hires`). */
  | { readonly kind: 'hired'; readonly count: number }
  /** Storms the windmill weathered (`village.mechanic.stormsSurvived`). */
  | { readonly kind: 'storms'; readonly count: number }
  | { readonly kind: 'bloom' };

/**
 * What a beat gives when it fires: a reward in minutes or pysanky (shared with quests), or a hero (M4, ADR 013: he
 * arrives at level 1, event `HeroJoined`; `checkStory`). Culture branches open by a derived
 * condition, not by a reward (culture.ts).
 */
export type StoryReward = Reward | { readonly kind: 'unlock'; readonly hero: HeroId };

export interface StoryBeat {
  readonly id: StoryBeatId;
  readonly land: 'khortytsia';
  readonly trigger: StoryTrigger;
  readonly portrait: PortraitId;
  readonly reward: StoryReward | null;
  readonly titleKey: string;
  readonly textKey: string;
}

/** In the order of the discovery calendar (SPEC §2.4); several beats due at once fire in this order. */
export const STORY_BEATS: readonly StoryBeat[] = [
  {
    id: 'khortytsia.shore',
    land: 'khortytsia',
    trigger: { kind: 'start' },
    portrait: 'kobzar',
    reward: null,
    titleKey: 'story.khortytsia.shore.title',
    textKey: 'story.khortytsia.shore.text',
  },
  {
    id: 'khortytsia.messenger',
    land: 'khortytsia',
    trigger: { kind: 'hired', count: 3 },
    portrait: 'messenger',
    reward: { kind: 'gloryMinutes', minutes: 5 },
    titleKey: 'story.khortytsia.messenger.title',
    textKey: 'story.khortytsia.messenger.text',
  },
  {
    id: 'khortytsia.council',
    land: 'khortytsia',
    trigger: { kind: 'sich', id: 'maidan', level: 10 },
    portrait: 'otaman',
    // Q16 (plan M4): the otaman himself is the reward (the 2 min of glory before M4-04 are gone).
    reward: { kind: 'unlock', hero: 'otaman' },
    titleKey: 'story.khortytsia.council.title',
    textKey: 'story.khortytsia.council.text',
  },
  {
    id: 'khortytsia.pokrova',
    land: 'khortytsia',
    // «Церква відкрита» = the church stands (level 1); it can be bought once every farm building is at 25.
    trigger: { kind: 'sich', id: 'church', level: 1 },
    portrait: 'kobzar',
    reward: { kind: 'gloryMinutes', minutes: 3 },
    titleKey: 'story.khortytsia.pokrova.title',
    textKey: 'story.khortytsia.pokrova.text',
  },
];
