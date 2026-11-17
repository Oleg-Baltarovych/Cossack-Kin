// i18n (SPEC §11; plan §0, M1-16): no library. Strings live in locales/{uk,en}.json under keys like
// `building.field.name`; a plural key holds CLDR forms ({ one, few, many, other }) picked by Intl.PluralRules — never by
// gluing words by hand. `{name}` placeholders are filled from params. A missing key renders as the key itself (and
// warns in dev/test builds) so a gap is visible, never a crash.
import { Big } from '../core/big.ts';
import type { Lang, NumberFormat } from '../core/state.ts';
import en from './locales/en.json';
import uk from './locales/uk.json';

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { readonly other: string };
type Entry = string | PluralForms;
type Table = Readonly<Record<string, Entry>>;

const TABLES: Readonly<Record<Lang, Table>> = { uk, en };
const plurals = new Map<Lang, Intl.PluralRules>();
const pluralRules = (lang: Lang): Intl.PluralRules => {
  let r = plurals.get(lang);
  if (!r) {
    r = new Intl.PluralRules(lang);
    plurals.set(lang, r);
  }
  return r;
};

export type Params = Readonly<Record<string, string | number>>;

const fill = (text: string, params: Params): string =>
  text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    return v === undefined ? whole : String(v);
  });

/** The text of `key` in `lang`; a plural key picks its form by `params.count`. */
export function t(lang: Lang, key: string, params: Params = {}): string {
  const entry = TABLES[lang][key];
  if (entry === undefined) {
    if (__CK_DEBUG__) console.warn('i18n: missing key %s (%s)', key, lang);
    return key;
  }
  if (typeof entry === 'string') return fill(entry, params);
  const count = typeof params['count'] === 'number' ? params['count'] : 0;
  return fill(entry[pluralRules(lang).select(count)] ?? entry.other, params);
}

// --- numbers ---------------------------------------------------------------------------------------------------

/** Suffixes per power of 1000 (1e3, 1e6, …). `words` in uk: Ukrainian short-scale abbreviations; otherwise K/M/B… */
const SUFFIXES: Readonly<Record<'ukWords' | 'short', readonly string[]>> = {
  ukWords: ['тис.', 'млн', 'млрд', 'трлн', 'квдрлн', 'квнтлн', 'скстлн', 'сптлн', 'октлн', 'нонлн', 'дцлн'],
  short: ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'],
};

/** `v` (1 ≤ v < 1000, or < 1 for tiny values) with 3 significant digits, trailing zeros trimmed. */
function mantissa(v: number, decimal: string): string {
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const s = v.toFixed(digits);
  const trimmed = digits > 0 ? s.replace(/\.?0+$/, '') : s;
  return trimmed.replace('.', decimal);
}

/**
 * A Big for display (SPEC §11): below 1000 as is; then a suffix per power of 1000 (`words` in uk: тис./млн/млрд…;
 * `short` and en: K/M/B…); past the last suffix scientific (`2.5e308`). 3 significant digits; uk uses a decimal comma
 * and a space before a word suffix.
 */
export function formatBig(value: Big, lang: Lang, format: NumberFormat): string {
  const decimal = lang === 'uk' ? ',' : '.';
  if (value.lt(0)) return `-${formatBig(value.mul(-1), lang, format)}`;
  if (value.lt(1000)) {
    const small = mantissa(value.toNumber(), decimal);
    // 999.6 rounds to "1000": show it as the first thousand instead.
    return small !== '1000' ? small : formatBig(Big.from(1000), lang, format);
  }
  const words = format === 'words' && lang === 'uk';
  const suffixes = words ? SUFFIXES.ukWords : SUFFIXES.short;
  let exp = Math.floor(value.log10());
  let tier = Math.floor(exp / 3);
  let v = 10 ** (value.log10() - tier * 3);
  // 999.999K must read 1M, not 1000K.
  if (Number(v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)) >= 1000) {
    tier += 1;
    v /= 1000;
  }
  if (tier <= suffixes.length) {
    const suffix = suffixes[tier - 1] ?? '';
    return `${mantissa(v, decimal)}${words ? ' ' : ''}${suffix}`;
  }
  exp = Math.floor(value.log10());
  const m = 10 ** (value.log10() - exp);
  const m2 = Number(m.toFixed(2)) >= 10 ? 1 : m;
  const e = Number(m.toFixed(2)) >= 10 ? exp + 1 : exp;
  return `${mantissa(m2, decimal)}e${String(e)}`;
}
