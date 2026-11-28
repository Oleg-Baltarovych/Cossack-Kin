// The green of a «Культура» effect line is its delta only (M4-16a, UI audit §4 p. 8): the line splits around `after`.
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import type { EffectPreview } from '../../../src/core/culture-selectors.ts';
import { formatBig, formatDuration, formatPrice, t } from '../../../src/i18n/index.ts';
import type { Text } from '../../../src/ui/hooks/useText.ts';
import { effectLine, effectLineParts } from '../../../src/ui/effectText.ts';

const textOf = (lang: 'uk' | 'en'): Text => ({
  lang,
  t: (key, params) => t(lang, key, params),
  num: (v) => formatBig(typeof v === 'number' ? Big.from(v) : v, lang, 'short'),
  short: (v) => formatPrice(v, lang, 'short'),
  dur: (s) => formatDuration(lang, s),
});

const power = (now: number, after: number | null): EffectPreview => ({
  kind: 'power',
  key: 'effect.power',
  unit: 'percent',
  now,
  after,
  amount: null,
});

describe('effectLineParts', () => {
  for (const lang of ['uk', 'en'] as const) {
    it(`${lang}: before + after + rest is the whole line, and after is the value after the purchase`, () => {
      const text = textOf(lang);
      const e = power(2, 4);
      const p = effectLineParts(text, e);
      expect(p.before + (p.after ?? '') + p.rest).toBe(effectLine(text, e));
      expect(p.after).toContain(text.num(4));
      expect(p.before).toContain(text.num(2));
    });
  }

  it('at the max there is no delta: the whole line, no green part', () => {
    const text = textOf('uk');
    const p = effectLineParts(text, power(50, null));
    expect(p).toEqual({ before: effectLine(text, power(50, null)), after: null, rest: '' });
  });
});
