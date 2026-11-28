// The green of a «Культура» effect line is its delta only (M4-16a, UI audit §4 p. 8): the line splits around `after`.
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import type { EffectPreview } from '../../../src/core/culture-selectors.ts';
import { formatBig, formatDuration, formatPrice, t } from '../../../src/i18n/index.ts';
import type { Text } from '../../../src/ui/hooks/useText.ts';
import { effectLine, effectLineParts, lastTwoTokens } from '../../../src/ui/effectText.ts';
import en from '../../../src/i18n/locales/en.json';
import uk from '../../../src/i18n/locales/uk.json';

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
      // The delta carries its sign and its unit; the parts around it keep neither.
      expect(p.after?.startsWith('+')).toBe(true);
      expect(p.after).toContain(text.num(4));
      expect(p.after).toMatch(/%$/u);
      expect(p.before).toContain(text.num(2));
      expect(p.before).not.toMatch(/\+$/u);
      expect(p.rest).not.toMatch(/^\s?%/u);
    });
  }

  it('a span of seconds: the delta is the signed duration, no percent', () => {
    const text = textOf('uk');
    const e: EffectPreview = {
      kind: 'offlineCapSec',
      key: 'effect.offlineCapSec',
      unit: 'seconds',
      now: 3600,
      after: 7200,
      amount: null,
    };
    const p = effectLineParts(text, e);
    expect(p.before + (p.after ?? '') + p.rest).toBe(effectLine(text, e));
    expect(p.after).toBe(`+${text.dur(7200)}`);
  });

  it('a change line without {after} (a careless locale): the whole line, nothing green', () => {
    const base = textOf('uk');
    const text: Text = { ...base, t: (key, params) => (key.endsWith('.change') ? 'без змін' : base.t(key, params)) };
    expect(effectLineParts(text, power(2, 4))).toEqual({
      before: effectLine(text, power(2, 4)),
      after: null,
      rest: '',
    });
  });

  it('every effect change line in uk and en has {now} and {after}', () => {
    for (const dict of [uk, en] as const) {
      const keys = Object.keys(dict).filter((k) => k.startsWith('effect.') && k.endsWith('.change'));
      expect(keys.length).toBeGreaterThan(5);
      for (const k of keys) {
        const line = (dict as Record<string, unknown>)[k];
        expect(line, k).toEqual(expect.stringContaining('{after}'));
        expect(line, k).toEqual(expect.stringContaining('{now}'));
      }
    }
  });

  it('the absolute change wraps whole: its last two words stay together', () => {
    expect(lastTwoTokens('сила 75,1 → 76,2')).toEqual(['сила 75,1 ', '→ 76,2']);
  });

  it('at the max there is no delta: the whole line, no green part', () => {
    const text = textOf('uk');
    const p = effectLineParts(text, power(50, null));
    expect(p).toEqual({ before: effectLine(text, power(50, null)), after: null, rest: '' });
  });
});
