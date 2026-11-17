import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { formatBig, t } from '../../../src/i18n/index.ts';

const big = (s: string): Big => Big.fromString(s) ?? Big.ZERO;

describe('t(): keys, params, plurals (M1-16, SPEC §11)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('looks up a key per language', () => {
    expect(t('uk', 'building.field.name')).toBe('Пшеничне поле');
    expect(t('en', 'building.field.name')).toBe('Wheat field');
  });

  it('Ukrainian plurals follow CLDR one/few/many: 1 година, 2 години, 5 годин, 11 годин, 21 година', () => {
    expect([1, 2, 5, 11, 21, 22, 25, 111].map((n) => t('uk', 'time.hours', { count: n }))).toEqual([
      '1 година',
      '2 години',
      '5 годин',
      '11 годин',
      '21 година',
      '22 години',
      '25 годин',
      '111 годин',
    ]);
    expect([1, 2, 5].map((n) => t('en', 'time.hours', { count: n }))).toEqual(['1 hour', '2 hours', '5 hours']);
  });

  it('a missing key returns the key itself and warns (dev builds)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(t('uk', 'no.such.key')).toBe('no.such.key');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('fills {params} and leaves unknown placeholders visible', () => {
    expect(t('en', 'time.hours', { count: 3 })).toBe('3 hours');
    expect(t('uk', 'return.away', { time: '2 години' })).toBe('Тебе не було 2 години');
  });
});

describe('formatBig (M1-16, SPEC §11)', () => {
  it('small numbers as they are (up to 3 significant digits after the point while < 10)', () => {
    expect(formatBig(Big.from(0), 'uk', 'words')).toBe('0');
    expect(formatBig(Big.from(9.5), 'en', 'short')).toBe('9.5');
    expect(formatBig(Big.from(9.5), 'uk', 'words')).toBe('9,5');
    expect(formatBig(Big.from(999), 'uk', 'words')).toBe('999');
    expect(formatBig(Big.from(999.4), 'en', 'short')).toBe('999');
  });

  it('thousands and up: words in uk (тис., млн, …), K/M/B in short and in en', () => {
    expect(formatBig(Big.from(1500), 'uk', 'words')).toBe('1,5 тис.');
    expect(formatBig(Big.from(1500), 'en', 'words')).toBe('1.5K');
    expect(formatBig(Big.from(1500), 'uk', 'short')).toBe('1,5K');
    expect(formatBig(Big.from(15_200), 'en', 'short')).toBe('15.2K');
    expect(formatBig(Big.from(152_000), 'en', 'short')).toBe('152K');
    expect(formatBig(Big.from(2.5e6), 'uk', 'words')).toBe('2,5 млн');
    expect(formatBig(big('1e15'), 'uk', 'words')).toBe('1 квдрлн');
    expect(formatBig(big('1e15'), 'en', 'short')).toBe('1Qa');
  });

  it('rounds into the next tier instead of printing 1000K', () => {
    expect(formatBig(Big.from(999_999), 'en', 'short')).toBe('1M');
    expect(formatBig(Big.from(999_999), 'uk', 'words')).toBe('1 млн');
    expect(formatBig(Big.from(999.7), 'en', 'short')).toBe('1K');
    expect(formatBig(Big.from(999.7), 'uk', 'words')).toBe('1 тис.');
  });

  it('past the named tiers: scientific, for any size Big can hold', () => {
    expect(formatBig(big('1e308'), 'en', 'short')).toBe('1e308');
    expect(formatBig(big('2.5e308'), 'uk', 'words')).toBe('2,5e308');
    expect(formatBig(big('1e1000'), 'en', 'words')).toBe('1e1000');
    expect(formatBig(big('4.567e1000'), 'en', 'short')).toBe('4.57e1000');
  });
});
