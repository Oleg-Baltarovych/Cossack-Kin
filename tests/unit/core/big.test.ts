import { describe, expect, it } from 'vitest';
import { BIG_MAX_EXPONENT } from '../../../src/content/numbers.ts';
import { Big } from '../../../src/core/big.ts';

/** Relative closeness for logarithms of huge values (testing rules: never `toBe` on floats). */
const close = (a: number, b: number, rel = 1e-9): boolean => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

describe('Big (M1-01)', () => {
  it('adds, subtracts, multiplies, divides and raises across 1e3 … 1e300', () => {
    for (const e of [3, 30, 150, 300]) {
      const x = Big.fromString(`2e${String(e)}`) ?? Big.ZERO;
      expect(x.add(x).eq(x.mul(2))).toBe(true);
      expect(x.mul(3).sub(x).eq(x.mul(2))).toBe(true);
      expect(x.div(x).eq(Big.ONE)).toBe(true);
      expect(close(x.log10(), e + Math.log10(2))).toBe(true);
    }
    expect(Big.from(1.15).pow(100).gt(Big.from(1e6))).toBe(true);
    expect(close(Big.from(10).pow(400).log10(), 400)).toBe(true);
  });

  it('compares (lt/lte/gt/gte/eq/cmp) and picks min/max', () => {
    const a = Big.from(1e3);
    const b = Big.fromString('1e300') ?? Big.ZERO;
    expect(a.lt(b) && a.lte(b) && b.gt(a) && b.gte(a)).toBe(true);
    expect(a.cmp(b)).toBe(-1);
    expect(b.cmp(a)).toBe(1);
    expect(a.cmp(Big.from(1000))).toBe(0);
    expect(Big.max(a, b).eq(b) && Big.min(a, b).eq(a)).toBe(true);
    expect(a.gte(a) && a.lte(a)).toBe(true);
  });

  it('floors and converts back to a number where it fits', () => {
    expect(Big.from(12.7).floor().eq(Big.from(12))).toBe(true);
    expect(Big.from(1234.5).toNumber()).toBe(1234.5);
    expect(Big.ZERO.isZero()).toBe(true);
    expect(Big.ONE.isZero()).toBe(false);
  });

  it('is immutable: operations return new values', () => {
    const a = Big.from(5);
    a.add(Big.ONE);
    expect(a.eq(Big.from(5))).toBe(true);
  });

  it('round-trips through its string form (the save format)', () => {
    for (const s of ['0', '1', '1234.5', '-5', '0.001', '1e21', '1e300', '1e1000', '2.5e45']) {
      const big = Big.fromString(s);
      expect(big, s).not.toBeNull();
      expect(Big.fromString(big?.toString() ?? '')?.eq(big ?? Big.ZERO), s).toBe(true);
    }
  });

  it('fromString rejects anything that is not a plain finite decimal (untrusted save input)', () => {
    for (const s of [
      'NaN',
      '1e',
      'Infinity',
      '-Infinity',
      ' 1',
      '1 ',
      '',
      'abc',
      '1e9e15',
      '0x10',
      '1,5',
      '+1',
      '1.',
      '.5',
    ]) {
      expect(Big.fromString(s), JSON.stringify(s)).toBeNull();
    }
  });

  it('from(number) refuses non-finite numbers (a bug, not player input)', () => {
    expect(() => Big.from(Number.NaN)).toThrow();
    expect(() => Big.from(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('Big as the save gate (M1-01 review)', () => {
  const must = (s: string): Big => {
    const v = Big.fromString(s);
    if (!v) throw new Error(`fromString rejected ${s}`);
    return v;
  };

  it('gives exact results, not just self-consistent ones', () => {
    expect(Big.from(2).add(3).toNumber()).toBe(5);
    expect(Big.from(2).sub(3).toNumber()).toBe(-1);
    expect(close(Big.from(2).pow(10).toNumber(), 1024)).toBe(true); // pow goes through logs: float noise
    expect(Big.from(1).div(4).toNumber()).toBe(0.25);
    expect(Big.from(-1.5).floor().toNumber()).toBe(-2);
    expect(must('1e300').mul(must('1e300')).toString()).toBe('1e600');
  });

  it('keeps ZERO and ONE unchanged by operations', () => {
    Big.ZERO.add(5);
    Big.ONE.mul(7);
    expect(Big.ZERO.toNumber()).toBe(0);
    expect(Big.ONE.toNumber()).toBe(1);
  });

  it('round-trips to a stable string, including -0, tiny and odd inputs', () => {
    for (const s of ['-0', '1e-300', '0.0001e5', '007', '1e1000', '9.99e14']) {
      const once = must(s).toString();
      expect(Big.fromString(once)?.toString(), s).toBe(once);
    }
    expect(must('-0').toString()).toBe('0');
  });

  it('accepts up to 64 characters, rejects 65', () => {
    expect(Big.fromString('1'.repeat(64))).not.toBeNull();
    expect(Big.fromString('1'.repeat(65))).toBeNull();
  });

  it('rejects more malformed and out-of-range strings', () => {
    for (const s of ['1E5', 'ee5', '--1', '1e+', '1e5.5', '1\n', '١', `1e${String(BIG_MAX_EXPONENT * 10)}`]) {
      expect(Big.fromString(s), JSON.stringify(s)).toBeNull();
    }
    expect(Big.fromString(`1e${String(BIG_MAX_EXPONENT)}`)).not.toBeNull();
  });

  it('never holds NaN, Infinity or a value past the bound: such results throw (a bug, never a corrupt save)', () => {
    expect(() => Big.ONE.div(0)).toThrow(RangeError);
    expect(() => Big.ZERO.div(0)).toThrow(RangeError);
    expect(() => Big.from(-8).pow(0.5)).toThrow(RangeError);
    expect(() => must(`1e${String(BIG_MAX_EXPONENT)}`).mul(must('1e10'))).toThrow(RangeError);
  });

  it('serializes to its string in JSON (never the internal structure)', () => {
    const ducats = must('2.5e45');
    const json = JSON.stringify({ ducats });
    expect(json).toBe(`{"ducats":"${ducats.toString()}"}`);
    const back = (JSON.parse(json) as { ducats: string }).ducats;
    expect(Big.fromString(back)?.eq(ducats)).toBe(true);
  });
});
