// Big — scaling numbers of the economy (SPEC §3.1, §8; plan M1-01). An immutable wrapper over break_eternity.js:
// the only file allowed to import it (ESLint), so the library can be swapped and no raw `Decimal` leaks into state.
// Saves store `toString()`; `fromString` is the untrusted-input gate and accepts only a plain finite decimal
// (break_eternity's own parser is lenient: "1e" → 1, "abc" → 0, " 1" → 1). A Big never holds NaN, Infinity or a value
// past BIG_MAX_EXPONENT: such a result throws (a bug), so every value in state round-trips through a save.
import Decimal from 'break_eternity.js';
import { BIG_MAX_EXPONENT } from '../content/numbers.ts';

/** A plain finite decimal: optional minus, digits, optional fraction, optional exponent. No spaces, no '+'. */
const DECIMAL = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/;
/** Longest accepted string (a save field); anything longer is rejected before parsing. */
const MAX_LENGTH = 64;

export type BigLike = Big | number;

export class Big {
  static readonly ZERO = new Big(new Decimal(0));
  static readonly ONE = new Big(new Decimal(1));

  private readonly d: Decimal;

  // A plain field, not a parameter property: Node's type stripping runs the core (balance-sim) and accepts only
  // erasable TypeScript syntax.
  private constructor(d: Decimal) {
    if (!Big.valid(d)) throw new RangeError(`Big: out of range or not a number (${d.toString()})`);
    this.d = d;
  }

  /** Finite and within ±BIG_MAX_EXPONENT orders of magnitude (zero included). */
  private static valid(d: Decimal): boolean {
    if (!Number.isFinite(d.mag) || !Number.isFinite(d.layer) || Number.isNaN(d.sign)) return false;
    if (d.eq(0)) return true;
    return Math.abs(d.abs().log10().toNumber()) <= BIG_MAX_EXPONENT;
  }

  /** From a finite number (content constants, small counts). Non-finite input is a programming error: throws. */
  static from(value: BigLike): Big {
    if (value instanceof Big) return value;
    if (!Number.isFinite(value)) throw new RangeError(`Big.from: non-finite number ${String(value)}`);
    return new Big(new Decimal(value));
  }

  /** Parses a save/URL string; `null` unless it is a plain finite decimal (see DECIMAL). */
  static fromString(text: string): Big | null {
    if (text.length === 0 || text.length > MAX_LENGTH || !DECIMAL.test(text)) return null;
    const d = new Decimal(text);
    return Big.valid(d) ? new Big(d) : null;
  }

  static max(a: Big, b: Big): Big {
    return a.gte(b) ? a : b;
  }

  static min(a: Big, b: Big): Big {
    return a.lte(b) ? a : b;
  }

  add(other: BigLike): Big {
    return new Big(this.d.add(Big.from(other).d));
  }

  sub(other: BigLike): Big {
    return new Big(this.d.sub(Big.from(other).d));
  }

  mul(other: BigLike): Big {
    return new Big(this.d.mul(Big.from(other).d));
  }

  div(other: BigLike): Big {
    return new Big(this.d.div(Big.from(other).d));
  }

  pow(exponent: BigLike): Big {
    return new Big(this.d.pow(Big.from(exponent).d));
  }

  floor(): Big {
    return new Big(this.d.floor());
  }

  /** −1, 0 or 1. */
  cmp(other: BigLike): -1 | 0 | 1 {
    const c = this.d.cmp(Big.from(other).d);
    return c < 0 ? -1 : c > 0 ? 1 : 0;
  }

  eq(other: BigLike): boolean {
    return this.cmp(other) === 0;
  }

  lt(other: BigLike): boolean {
    return this.cmp(other) < 0;
  }

  lte(other: BigLike): boolean {
    return this.cmp(other) <= 0;
  }

  gt(other: BigLike): boolean {
    return this.cmp(other) > 0;
  }

  gte(other: BigLike): boolean {
    return this.cmp(other) >= 0;
  }

  isZero(): boolean {
    return this.d.eq(0);
  }

  /** log10 as a number (finite for every value the economy reaches; −Infinity for 0). */
  log10(): number {
    return this.d.log10().toNumber();
  }

  /** As a number; ±Infinity beyond ~1.8e308 (display and UI only, never for economy math). */
  toNumber(): number {
    return this.d.toNumber();
  }

  /** The save format; `Big.fromString(x.toString())` equals `x`. */
  toString(): string {
    return this.d.toString();
  }

  /** JSON carries the save string, never the internal structure. */
  toJSON(): string {
    return this.toString();
  }
}
