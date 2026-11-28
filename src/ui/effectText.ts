// Effect lines of the «Культура» cards (plan M4-12/M4-13, §0.1 П4): a share of a hero or a culture node «зараз →
// після» through the shared `effect.<kind>` keys, and the absolute number under it. Formatting only: every number comes
// from a core view (`heroesView`, `cultureView`).
import type { Big } from '../core/big.ts';
import type { EffectAmount, EffectPreview } from '../core/culture-selectors.ts';
import type { Text } from './hooks/useText.ts';

/** A share as shown: a percent (`effectPercent` already applied by the view) or a span of seconds. */
function shareText(text: Text, e: EffectPreview, v: number): string {
  return e.unit === 'percent' ? text.num(v) : text.dur(v);
}

/** «+2 % → +4 % сили війська»; at the cap only «+50 % сили війська». */
export function effectLine(text: Text, e: EffectPreview): string {
  return e.after === null
    ? text.t(e.key, { value: shareText(text, e, e.now) })
    : text.t(`${e.key}.change`, { now: shareText(text, e, e.now), after: shareText(text, e, e.after) });
}

/** An effect line around its delta (M4-16a: green only on the delta, never on the whole sentence). */
export interface EffectLineParts {
  readonly before: string;
  /** The value after the purchase with its sign and unit («+4 %»); null at the max (no delta). */
  readonly after: string | null;
  readonly rest: string;
}

const AFTER_MARK = '\u{E000}';

/** `effectLine` split around the `after` value, with its sign before it and a «%» after it (word order: the locale's). */
export function effectLineParts(text: Text, e: EffectPreview): EffectLineParts {
  if (e.after === null) return { before: effectLine(text, e), after: null, rest: '' };
  const line = text.t(`${e.key}.change`, { now: shareText(text, e, e.now), after: AFTER_MARK });
  const at = line.indexOf(AFTER_MARK);
  const head = line.slice(0, at);
  const tail = line.slice(at + AFTER_MARK.length);
  const sign = /\S*$/u.exec(head)?.[0] ?? '';
  const unit = /^\s?%/u.exec(tail)?.[0] ?? '';
  return {
    before: head.slice(0, head.length - sign.length),
    after: sign + shareText(text, e, e.after) + unit,
    rest: tail.slice(unit.length),
  };
}

const DURATION: ReadonlySet<EffectAmount['unit']> = new Set(['offlineCapSec', 'gloryCapSec', 'raidSec']);

/** The absolute line (П4): «Дохід: 1,2тис./с → 1,3тис./с»; at the max only the number now. */
export function amountLine(text: Text, a: EffectAmount): string {
  const f = (v: Big | number): string => (typeof v === 'number' && DURATION.has(a.unit) ? text.dur(v) : text.num(v));
  return a.after === null
    ? text.t(`ui.amount.${a.unit}`, { value: f(a.now) })
    : text.t(`ui.amount.${a.unit}.change`, { now: f(a.now), after: f(a.after) });
}

export const sameBig = (a: Big | null, b: Big | null): boolean => (a === null || b === null ? a === b : a.eq(b));

const sameValue = (a: Big | number | null, b: Big | number | null): boolean =>
  a === null || b === null || typeof a === 'number' || typeof b === 'number' ? a === b : a.eq(b);

const sameAmount = (a: EffectAmount | null, b: EffectAmount | null): boolean =>
  a === null || b === null ? a === b : a.unit === b.unit && sameValue(a.now, b.now) && sameValue(a.after, b.after);

/** Equal lines, absolute numbers included. */
export const sameEffects = (a: readonly EffectPreview[], b: readonly EffectPreview[]): boolean =>
  a.length === b.length &&
  a.every((e, i) => {
    const o = b[i];
    return (
      o !== undefined && e.kind === o.kind && e.now === o.now && e.after === o.after && sameAmount(e.amount, o.amount)
    );
  });
