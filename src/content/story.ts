// Story beats of the lands (SPEC §2.5; plan §0 «Віхи», M2-22, Q7, Q14). A beat is a short historical scene — a title,
// 1–3 sentences and a portrait from the sprites the game already has — that fires once, when its monotone trigger
// first holds (checked by the core after every `advance` and action, so offline too). Land 1 in M2 has only the
// beats whose triggers exist in this build: «Рада на майдані» rewards glory until the hero comes (M4), «Вниз за
// пороги» (bloom → resettling) comes with M5. Texts: i18n `story.<land>.<beat>.title|text`, sources in
// docs/content-sources.md. Reward sizes: гіпотеза, kept small — 10/15/30 min pushed Майдан 10 to S2 and the session
// actions over 15 (pnpm balance, M2-22); M2-27 retunes them with the chain and chores (plan R4).
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

export interface StoryBeat {
  readonly id: StoryBeatId;
  readonly land: 'khortytsia';
  readonly trigger: StoryTrigger;
  readonly portrait: PortraitId;
  readonly reward: Reward | null;
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
    reward: { kind: 'gloryMinutes', minutes: 2 },
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
