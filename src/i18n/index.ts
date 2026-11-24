// i18n (SPEC §11; plan §0, M1-16): no library. Strings live in locales/{uk,en}.json under keys like
// `building.field.name`; a plural key holds CLDR forms ({ one, few, many, other }) picked by Intl.PluralRules — never by
// gluing words by hand. `{name}` placeholders are filled from params. A missing key renders as the key itself (and
// warns in dev/test builds) so a gap is visible, never a crash.
import { Big } from '../core/big.ts';
import { dayAt } from '../core/systems/quests.ts';
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

// --- durations -------------------------------------------------------------------------------------------------

const SEC_PER_MIN = 60;
const SEC_PER_HOUR = 3600;
const SEC_PER_DAY = 86_400;

/**
 * An absence for people (SPEC §3.8): the two largest units, each with its own plural — «3 години 21 хвилина»,
 * «2 дні 5 годин», «8 годин»; under an hour minutes only. Seconds are dropped.
 */
export function formatDuration(lang: Lang, seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const days = Math.floor(s / SEC_PER_DAY);
  const hours = Math.floor((s % SEC_PER_DAY) / SEC_PER_HOUR);
  const minutes = Math.floor((s % SEC_PER_HOUR) / SEC_PER_MIN);
  const unit = (key: string, count: number): string => t(lang, key, { count });
  const pair = (big: string, small: string): string => t(lang, 'time.pair', { big, small });
  if (days > 0) return hours > 0 ? pair(unit('time.days', days), unit('time.hours', hours)) : unit('time.days', days);
  if (hours > 0)
    return minutes > 0 ? pair(unit('time.hours', hours), unit('time.minutes', minutes)) : unit('time.hours', hours);
  return unit('time.minutes', minutes);
}

/**
 * A raid's time left on the road (plan M3-09, §0.1 П10): seconds only in the last minute («45 секунд»), past it the
 * two largest units of `formatDuration` with the minutes rounded up — a card never says «1 хвилина» for 1:59 left.
 */
export function formatCountdown(lang: Lang, seconds: number): string {
  const s = countdownShown(seconds);
  return s <= SEC_PER_MIN ? t(lang, 'time.seconds', { count: s }) : formatDuration(lang, s);
}

/**
 * The seconds `formatCountdown` reads out for `seconds` left: whole seconds in the last minute, else rounded up to the
 * minute — equal results read the same, so a card can re-render only when this changes (once a minute, then each second).
 */
export function countdownShown(seconds: number): number {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  return s <= SEC_PER_MIN ? s : Math.ceil(s / SEC_PER_MIN) * SEC_PER_MIN;
}

const MS_PER_MIN = SEC_PER_MIN * 1000;
const MS_PER_DAY = SEC_PER_DAY * 1000;
/** uk «об» before a vowel: of the 24 hours only 11 is said with one («об одинадцятій»). */
const UK_VOWEL_HOURS: readonly number[] = [11];
export const NBSP = String.fromCharCode(0xa0);
const MIN_PER_HOUR = 60;
/** Every clock reading is of `ms + offset` in UTC: the game's own zone (`settings.tzOffsetMin`), not the device's. */
const UTC = 'UTC';
const formats = new Map<string, Intl.DateTimeFormat>();

function format(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify([locale, options]);
  let f = formats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: UTC });
    formats.set(key, f);
  }
  return f;
}

/**
 * When a raid will be back, on the game's clock (§0.1 П10; UI only — core never reads a clock): «Повернуться о
 * 21:40», «Повернуться завтра о 06:10», further away (a clock set back) with the date. The day is the core's `dayAt`
 * at `tzOffsetMin` — the day the quests and the raid board count — so «завтра» always agrees with them; a return
 * already past (`now` after `returnAt`) reads as today. 24-hour in uk, 12-hour in en (its narrow space before AM/PM —
 * not in the pixel font — becomes a no-break space).
 */
export function formatReturnAt(lang: Lang, returnAt: number, now: number, tzOffsetMin: number): string {
  const local = returnAt + tzOffsetMin * MS_PER_MIN;
  const time =
    lang === 'uk'
      ? format('uk', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(local)
      : format('en', { hour: 'numeric', minute: '2-digit' }).format(local).replace(/\s/gu, NBSP);
  // The hour of the local time, by arithmetic (no Intl part to parse).
  const hour = Math.floor((((local % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / (MIN_PER_HOUR * MS_PER_MIN));
  const vowel = lang === 'uk' && UK_VOWEL_HOURS.includes(hour);
  const at = t(lang, vowel ? 'ui.raids.atVowel' : 'ui.raids.at', { time });
  const days = dayAt(returnAt, tzOffsetMin) - dayAt(now, tzOffsetMin);
  if (days <= 0) return t(lang, 'ui.raids.back', { at });
  if (days === 1) return t(lang, 'ui.raids.backTomorrow', { at });
  const date = format(lang, { day: 'numeric', month: 'long' }).format(local);
  return t(lang, 'ui.raids.backOn', { date, at });
}

// --- numbers ---------------------------------------------------------------------------------------------------

/** Suffixes per power of 1000 (1e3, 1e6, …). `words` in uk: Ukrainian short-scale abbreviations; otherwise K/M/B… */
const SUFFIXES: Readonly<Record<'ukWords' | 'short', readonly string[]>> = {
  ukWords: ['тис.', 'млн', 'млрд', 'трлн', 'квдрлн', 'квнтлн', 'скстлн', 'сптлн', 'октлн', 'нонлн', 'дцлн'],
  short: ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'],
};

/** Decimals a mantissa `v` (< 1000) keeps: 3 significant digits (hundredths below 10). Shared by display and roll. */
const digitsFor = (v: number): number => (v < 10 ? 2 : v < 100 ? 1 : 0);

/** `v` (1 ≤ v < 1000, or < 1 for tiny values) with 3 significant digits, trailing zeros trimmed. */
function mantissa(v: number, decimal: string): string {
  const digits = digitsFor(v);
  const s = v.toFixed(digits);
  const trimmed = digits > 0 ? s.replace(/\.?0+$/, '') : s;
  return trimmed.replace('.', decimal);
}

/** An amount ≥ 1000 (by its log10) as a power of 1000 and its mantissa, after the roll-over (999.999K reads 1M). */
function scaled(log10: number): { readonly tier: number; readonly m: number } {
  const tier = Math.floor(Math.floor(log10) / 3);
  const m = 10 ** (log10 - tier * 3);
  return Number(m.toFixed(digitsFor(m))) >= 1000 ? { tier: tier + 1, m: m / 1000 } : { tier, m };
}

/**
 * `v` (≥ 0) at the precision `formatBig` shows it, by the same rounding (`digitsFor`, `scaled`, `toFixed`): two amounts
 * with the same result read the same, and amounts that read differently differ (sweep test). The HUD counter
 * (ui/hooks/useCounter.ts) formats a rolling number only when this changes, so most frames of a roll allocate nothing.
 * Plain numbers only (the roll runs in Number range); past the last suffix it stays 3 significant digits, like the
 * scientific form.
 */
export function shownValue(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return v;
  if (v < 1000) return Math.min(Number(v.toFixed(digitsFor(v))), 1000);
  const { tier, m } = scaled(Math.log10(v));
  return Number(m.toFixed(digitsFor(m))) * 1000 ** tier;
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
  const { tier, m: v } = scaled(value.log10());
  if (tier <= suffixes.length) {
    const suffix = suffixes[tier - 1] ?? '';
    return `${mantissa(v, decimal)}${words ? ' ' : ''}${suffix}`;
  }
  const exp = Math.floor(value.log10());
  const m = 10 ** (value.log10() - exp);
  const m2 = Number(m.toFixed(2)) >= 10 ? 1 : m;
  const e = Number(m.toFixed(2)) >= 10 ? exp + 1 : exp;
  return `${mantissa(m2, decimal)}e${String(e)}`;
}

/** Most characters a button price may take: icon + this many Press Start 2P glyphs fit a 360-px row (plan M2-14). */
export const PRICE_MAX_CHARS = 8;

/**
 * A price on a button (plan M2-14): the player's own format, compact — uk words without the space («1,23млрд»), K/M/B…
 * otherwise — so the HUD and the buttons read alike. A form longer than PRICE_MAX_CHARS (the long uk words past
 * трлн, a long exponent) falls back to the K/M/B letters, then to the mantissa without decimals: always one line.
 */
export function formatPrice(value: Big, lang: Lang, format: NumberFormat): string {
  const own = formatBig(value, lang, format).replace(' ', '');
  if (own.length <= PRICE_MAX_CHARS) return own;
  const letters = formatBig(value, lang, 'short');
  if (letters.length <= PRICE_MAX_CHARS) return letters;
  return letters.replace(/[.,]\d+/, '');
}

// --- tiers -------------------------------------------------------------------------------------------------------

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;

/** A building's visual tier as shown to the player (plan M2-12): Roman I–VI, the same in every language. */
export function romanTier(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}
