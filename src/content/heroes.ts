// Heroes (SPEC §3.5 «Модель M4»; plan M4 §3, Q4–Q6; ADR 013). A hero arrives through a story beat whose reward is
// `{ kind: 'unlock'; hero }` (story.ts — the beat is the single link, the hero does not name it back) at level 1 for
// free; further levels cost glory, `base × growth^level` (level = the current one; core, M4-05), up to `levelMax`.
// Effects are linear in the level: `perRank` × level, no jumps (Q6). Heroes carry over resettling (§3.6). Ids are
// saved (`heroes`, save v5): append only, never rename. Costs and effect sizes: гіпотеза for M4-09; hero prices across
// lands come with M5. Facts: docs/content-sources.md.

import type { RankedEffect } from './effects.ts';

export const HERO_IDS = ['otaman', 'kobzar', 'kharakternyk'] as const;
export type HeroId = (typeof HERO_IDS)[number];

export interface HeroDef {
  readonly id: HeroId;
  /** M4: 25 for every hero (Q6). */
  readonly levelMax: number;
  /** Glory price of level 2 (the first one bought) is base × growth. */
  readonly base: number;
  readonly growth: number;
  /** Each level adds `perRank` to its field (effects.ts). */
  readonly effects: readonly RankedEffect[];
  readonly nameKey: string;
  /** Who he is, in a few words (also the glossary line for `en`, SPEC §11). */
  readonly titleKey: string;
  /** His own line on the card. */
  readonly phraseKey: string;
  /** A short fact (SPEC §16; source in docs/content-sources.md). */
  readonly factKey: string;
  /** «Прийде, коли…» on the locked card; `{n}` = the threshold of his beat's trigger. */
  readonly unlockKey: string;
}

const LEVEL_MAX = 25;
/** Price × growth per level, every hero (balance review M4-02: 1.15 let heroes max out in week 1). */
const GROWTH = 1.4;

export const HEROES: readonly HeroDef[] = [
  // «Рада на майдані» (Майдан 10), M4-04.
  hero('otaman', 900, GROWTH, [{ kind: 'power', perRank: 0.02 }]),
  // «Кобзар біля шинку» (шинок 10), M4-08.
  hero('kobzar', 1500, GROWTH, [
    { kind: 'cultureCost', perRank: 0.01 },
    { kind: 'glory', perRank: 0.025 },
  ]),
  // «Характерник на Січі» (raids won), M4-08. 1 % × 25 = the −25 % bound of the raid-time gate (content test).
  hero('kharakternyk', 3000, GROWTH, [
    { kind: 'raidTime', perRank: 0.01 },
    { kind: 'relicChance', perRank: 0.02 },
  ]),
];

function hero(id: HeroId, base: number, growth: number, effects: readonly RankedEffect[]): HeroDef {
  return {
    id,
    levelMax: LEVEL_MAX,
    base,
    growth,
    effects,
    nameKey: `hero.${id}.name`,
    titleKey: `hero.${id}.title`,
    phraseKey: `hero.${id}.phrase`,
    factKey: `hero.${id}.fact`,
    unlockKey: `hero.${id}.unlock`,
  };
}
