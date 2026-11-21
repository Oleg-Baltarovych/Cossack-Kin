// Rewards of story beats and quests (SPEC §2.5, §3.10; plan §0 «Віхи», M2-22). Small and scale-free: «N minutes of
// income / glory» is N × 60 × the current rate (core/systems/reward.ts), so the same reward means the same in every
// land and at every stage; pysanky are a plain count. A floor per minute keeps a reward felt when the rate is ~0
// (a new game, the first Cossacks).

export type Reward =
  | { readonly kind: 'incomeMinutes'; readonly minutes: number }
  | { readonly kind: 'gloryMinutes'; readonly minutes: number }
  | { readonly kind: 'pysanky'; readonly n: number };

/**
 * The least a minute of reward is worth: `ducatsPerMinute` × the land's scale, `gloryPerMinute` × its glory scale
 * (scale-free like the reward itself). Гіпотеза (M2-27 tunes): a minute of a level-1 field ≈ 30 ducats; the first
 * kurins cost 50 glory: the 5-minute messenger reward right after the first Cossacks pays half of them.
 */
export const REWARD = {
  minPerMinute: { ducats: 10, glory: 5 },
} as const;
