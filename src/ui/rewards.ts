// Rewards in words (plan M2-25): what a quest or a story beat gives, and what it came to — plural forms from the
// locale, numbers through the player's format, never glued by hand. Shared by the quest strip and the story window.
import type { Reward } from '../content/rewards.ts';
import type { Granted } from '../core/systems/reward.ts';
import type { Text } from './hooks/useText.ts';
import type { IconId } from './icons.ts';

/** The icon of a reward's currency (always beside its words). */
export const REWARD_ICON: Readonly<Record<Reward['kind'], IconId>> = {
  incomeMinutes: 'ducat',
  gloryMinutes: 'glory',
  pysanky: 'pysanka',
};

/** «5 хвилин доходу», «3 minutes of glory», «2 писанки». */
export function rewardText(text: Text, r: Reward): string {
  return text.t(`reward.${r.kind}`, { count: r.kind === 'pysanky' ? r.n : r.minutes });
}

/** What a reward came to: «+120 дук.», «+25 слави», «+2 писанки». */
export function grantedText(text: Text, g: Granted): string {
  return g.currency === 'pysanky'
    ? text.t('granted.pysanky', { count: g.amount })
    : text.t(`granted.${g.currency}`, { value: text.num(g.amount) });
}
