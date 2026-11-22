// @vitest-environment jsdom
// The HUD counter roll (plan M2-26, SPEC §6.7): a new amount rolls from the one shown in COUNTER.lerpMs, a change
// mid-roll goes on from where the roll is, «менше руху» shows it at once, and nothing is left scheduled after the roll
// or an unmount. Fake timers drive requestAnimationFrame and performance.now together.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTER } from '../../../src/content/juice.ts';
import { Big } from '../../../src/core/big.ts';
import { formatBig, shownValue } from '../../../src/i18n/index.ts';
import { useCounter } from '../../../src/ui/hooks/useCounter.ts';

const format = (v: Big): string => formatBig(v, 'en', 'short');

function Counter({ value }: { readonly value: number | Big }) {
  const ref = useCounter<HTMLOutputElement>(typeof value === 'number' ? Big.from(value) : value, format);
  return <output aria-label="ducats" ref={ref} />;
}

const shown = (): number => Number(screen.getByRole('status', { name: 'ducats' }).textContent);
const step = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset['motion'];
});

describe('useCounter (M2-26)', () => {
  it('shows the first amount at once (no roll up from zero)', () => {
    render(<Counter value={500} />);
    expect(shown()).toBe(500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new amount rolls over COUNTER.lerpMs: in between half-way, exact at the end, nothing left scheduled', () => {
    const { rerender } = render(<Counter value={100} />);
    rerender(<Counter value={200} />);
    expect(shown()).toBe(100);
    step(COUNTER.lerpMs / 2);
    expect(shown()).toBeGreaterThan(100);
    expect(shown()).toBeLessThan(200);
    step(COUNTER.lerpMs / 2 + 20);
    expect(shown()).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rolls down as well as up (a purchase)', () => {
    const { rerender } = render(<Counter value={900} />);
    rerender(<Counter value={300} />);
    step(COUNTER.lerpMs / 2);
    expect(shown()).toBeLessThan(900);
    expect(shown()).toBeGreaterThan(300);
    step(COUNTER.lerpMs);
    expect(shown()).toBe(300);
  });

  it('a change mid-roll goes on from the amount shown: never a jump back, done lerpMs after the last change', () => {
    const { rerender } = render(<Counter value={0} />);
    rerender(<Counter value={100} />);
    step(COUNTER.lerpMs / 2);
    const mid = shown();
    rerender(<Counter value={200} />);
    expect(shown()).toBe(mid);
    step(16);
    expect(shown()).toBeGreaterThanOrEqual(mid);
    step(COUNTER.lerpMs / 2 - 16);
    expect(shown()).toBeLessThan(200);
    step(COUNTER.lerpMs / 2 + 20);
    expect(shown()).toBe(200);
  });

  it('the same amount again schedules nothing', () => {
    const { rerender } = render(<Counter value={42} />);
    rerender(<Counter value={42} />);
    expect(vi.getTimerCount()).toBe(0);
    expect(shown()).toBe(42);
  });

  it('«менше руху»: the new amount at once, no frame scheduled', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    const { rerender } = render(<Counter value={100} />);
    rerender(<Counter value={250} />);
    expect(shown()).toBe(250);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an amount past the Number range is shown at once', () => {
    const { rerender } = render(<Counter value={100} />);
    rerender(<Counter value={Big.from(10).pow(400)} />);
    expect(screen.getByRole('status', { name: 'ducats' }).textContent).toBe(format(Big.from(10).pow(400)));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unmounted mid-roll: its animation frame is cancelled', () => {
    const { rerender, unmount } = render(<Counter value={100} />);
    rerender(<Counter value={200} />);
    step(50);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('shownValue (M2-26)', () => {
  it('two amounts with the same shown value format the same, and a different one formats differently', () => {
    for (const [a, b] of [
      [1.234, 1.2349],
      [12.31, 12.34],
      [123.4, 123.2],
      [12_340, 12_349],
      [1_234_000, 1_234_400],
    ] as const) {
      expect(shownValue(a)).toBe(shownValue(b));
      expect(format(Big.from(a))).toBe(format(Big.from(b)));
    }
    for (const [a, b] of [
      [1.23, 1.24],
      [12_300, 12_400],
    ] as const) {
      expect(shownValue(a)).not.toBe(shownValue(b));
      expect(format(Big.from(a))).not.toBe(format(Big.from(b)));
    }
  });
});

describe('shownValue never drifts from formatBig (M2-26 review)', () => {
  it('adjacent samples 0.01…1e12 read the same exactly when their shown values are equal', () => {
    // 0.16 % apart: finer than the shown step in most decades, so both «same» and «different» pairs are met.
    const N = 20_000;
    const samples: number[] = [];
    for (let i = 0; i <= N; i += 1) samples.push(10 ** (-2 + (14 * i) / N));
    // The rounding edges: hundredths → tenths, tenths → whole, 999.5 → 1K, 999.95K → 1M, and their neighbours.
    for (const edge of [9.995, 99.95, 999.5, 999_950, 999_500_000])
      samples.push(edge, edge - 1e-9 * edge, edge + 1e-9 * edge);
    samples.sort((a, b) => a - b);
    let same = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1] ?? 0;
      const b = samples[i] ?? 0;
      const sameText = format(Big.from(a)) === format(Big.from(b));
      if (sameText) same += 1;
      if ((shownValue(a) === shownValue(b)) !== sameText) expect({ a, b, sameText }).toBeNull();
    }
    expect(same).toBeGreaterThan(1000);
    expect(same).toBeLessThan(samples.length - 1000);
  });
});
