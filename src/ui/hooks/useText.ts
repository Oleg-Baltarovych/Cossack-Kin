// Text and numbers in the player's language and number format (SPEC §11): the only way UI code turns a key or a
// Big into a string.
import { useMemo } from 'react';
import { Big } from '../../core/big.ts';
import type { Lang } from '../../core/state.ts';
import { formatBig, formatDuration, formatPrice, t, type Params } from '../../i18n/index.ts';
import { useGame } from './useGame.ts';

export interface Text {
  readonly lang: Lang;
  readonly t: (key: string, params?: Params) => string;
  /** Any amount for display: a Big, or a plain count/percent (wrapped in Big here so formatting stays one path). */
  readonly num: (value: Big | number) => string;
  /**
   * An amount on a button (plan M2-14): the player's format, compact (`formatPrice`), so a price fits one line of a
   * 360-px row in every language; the button's accessible name keeps the full `num` form.
   */
  readonly short: (value: Big) => string;
  /** A span of seconds for people («3 години 21 хвилина»). */
  readonly dur: (seconds: number) => string;
}

export function useText(): Text {
  const lang = useGame((s) => s.settings.lang);
  const format = useGame((s) => s.settings.numberFormat);
  return useMemo(
    () => ({
      lang,
      t: (key: string, params?: Params) => t(lang, key, params),
      num: (value: Big | number) => formatBig(typeof value === 'number' ? Big.from(value) : value, lang, format),
      short: (value: Big) => formatPrice(value, lang, format),
      dur: (seconds: number) => formatDuration(lang, seconds),
    }),
    [lang, format],
  );
}
