import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { formatBig, formatDuration, romanTier, t } from '../../../src/i18n/index.ts';
import enTable from '../../../src/i18n/locales/en.json';
import ukTable from '../../../src/i18n/locales/uk.json';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { LANGS } from '../../../src/core/state.ts';

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
    expect(t('uk', 'return.away', { time: '2 години' })).toBe('Час відсутності: 2 години');
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

describe('keys built at run time exist in both languages (M1-17 review)', () => {
  const tables = { uk: ukTable, en: enTable } as const;
  const dynamic = [
    ...(['ducats', 'glory', 'max', 'kharch'] as const).map((r) => `ui.block.${r}`),
    ...KHORTYTSIA.wind.levels.map((l) => l.nameKey),
    ...LANGS.map((l) => `lang.${l}`),
    ...['farm', 'sich', 'more'].map((tab) => `ui.tab.${tab}`),
    'ui.unlock.farmAll',
    'ui.unlock.land',
    'ui.price.none',
    ...KHORTYTSIA.buildings.flatMap((b) => [b.nameKey, b.descKey]),
    ...SICH_BUILDINGS.flatMap((b) => [b.nameKey, b.descKey]),
    KHORTYTSIA.sichSpecial.nameKey,
    KHORTYTSIA.sichSpecial.descKey,
  ];

  it('every dynamic key is present in uk and en', () => {
    for (const [lang, table] of Object.entries(tables)) {
      expect(
        dynamic.filter((k) => !(k in table)),
        lang,
      ).toEqual([]);
    }
  });

  it('uk and en have the same key set', () => {
    expect(Object.keys(enTable).sort()).toEqual(Object.keys(ukTable).sort());
  });
});

describe('formatDuration (M1-18)', () => {
  it('minutes under an hour, with plurals', () => {
    expect(formatDuration('uk', 60)).toBe('1 хвилина');
    expect(formatDuration('uk', 120)).toBe('2 хвилини');
    expect(formatDuration('uk', 5 * 60 + 59)).toBe('5 хвилин');
    expect(formatDuration('en', 60)).toBe('1 minute');
  });

  it('hours and minutes; whole hours alone', () => {
    expect(formatDuration('uk', 3 * 3600 + 21 * 60)).toBe('3 години 21 хвилина');
    expect(formatDuration('uk', 8 * 3600)).toBe('8 годин');
    expect(formatDuration('en', 2 * 3600 + 60)).toBe('2 hours 1 minute');
  });

  it('days and hours past a day (minutes dropped)', () => {
    expect(formatDuration('uk', 86400 * 2 + 3600 * 5 + 59 * 60)).toBe('2 дні 5 годин');
    expect(formatDuration('uk', 86400 * 11)).toBe('11 днів');
    expect(formatDuration('en', 86400)).toBe('1 day');
  });

  it('under a minute and nonsense input read as 0 minutes', () => {
    expect(formatDuration('uk', 0)).toBe('0 хвилин');
    expect(formatDuration('uk', 59)).toBe('0 хвилин');
    expect(formatDuration('en', Number.NaN)).toBe('0 minutes');
  });
});

describe('tier banner (M2-12)', () => {
  it('tiers are Roman numerals I–VI; the banner text takes the name and the numeral as params in both languages', () => {
    expect([1, 2, 3, 4, 5, 6].map(romanTier)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
    expect(t('uk', 'ui.tier.reached', { name: 'Пасіка', tier: romanTier(2) })).toBe('Пасіка — тір II');
    expect(t('en', 'ui.tier.reached', { name: 'Apiary', tier: romanTier(5) })).toBe('Apiary — tier V');
  });
});
