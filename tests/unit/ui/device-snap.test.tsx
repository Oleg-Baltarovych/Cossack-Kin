// @vitest-environment jsdom
// useDeviceSnap settles where the box settles (M3 open item 3): the sheet's height tween moves the quest icon without
// resizing the icon's parent, so a snap measured mid-tween stayed on whatever frame it caught — 412@3.5 landed on one
// of several translates run to run. The snap must follow every ancestor's resize and end on the settled position only.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeviceSnap } from '../../../src/ui/hooks/useDeviceSnap.ts';
import { deviceSnap } from '../../../src/ui/pixelSnap.ts';

const DPR = 3.5;

/** A ResizeObserver stand-in: `resize(el)` calls back only the observers that observe `el` (like the browser). */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  private readonly cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
    FakeObserver.all.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
  }
  unobserve(el: Element): void {
    this.targets.delete(el);
  }
  disconnect(): void {
    this.targets.clear();
  }
  static resize(el: Element): void {
    for (const o of FakeObserver.all) if (o.targets.has(el)) o.cb();
  }
}

/** The box's layout position (css px) before its own translate; the rect adds the translate like a browser does. */
let layout = { left: 0, top: 0 };
const translateOf = (el: HTMLElement): readonly [number, number] => {
  const [x = '0', y = '0'] = el.style.translate.split(' ');
  return [parseFloat(x) || 0, parseFloat(y) || 0];
};

function Snapped() {
  const ref = useDeviceSnap([]);
  return (
    <div data-testid="sheet">
      <div>
        <span data-testid="parent">
          <span ref={ref} data-testid="icon" />
        </span>
      </div>
    </div>
  );
}

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeObserver);
  vi.stubGlobal('devicePixelRatio', DPR);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const [dx, dy] = translateOf(this);
    return DOMRect.fromRect({ x: layout.left + dx, y: layout.top + dy, width: 18, height: 18 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useDeviceSnap', () => {
  it('snaps the settled position after an ancestor tween, whatever frames it measured on the way', () => {
    layout = { left: 12.4, top: 688.921875 };
    const { getByTestId } = render(<Snapped />);
    const icon = getByTestId('icon');
    const sheet = getByTestId('sheet');
    // The sheet grows 274.5 → 275 css px over a few frames (bottom-anchored: the icon rises); the parent keeps its size.
    for (const top of [688.71875, 688.6539916992188, 688.4218994140625]) {
      layout = { left: 12.4, top };
      FakeObserver.resize(sheet);
    }
    const [dx, dy] = translateOf(icon);
    expect(dx).toBeCloseTo(deviceSnap(12.4, DPR), 9);
    expect(dy).toBeCloseTo(deviceSnap(688.4218994140625, DPR), 9);
    // On whole device px.
    const top = (688.4218994140625 + dy) * DPR;
    expect(Math.abs(top - Math.round(top))).toBeLessThan(1e-6);
  });

  it('gives the same translate for the same layout, from any history', () => {
    const settle = (path: readonly number[]): readonly [number, number] => {
      layout = { left: 30.1, top: path[0] ?? 0 };
      const { getByTestId, unmount } = render(<Snapped />);
      for (const top of path.slice(1)) {
        layout = { left: 30.1, top };
        FakeObserver.resize(getByTestId('sheet'));
      }
      const t = translateOf(getByTestId('icon'));
      unmount();
      return t;
    };
    const a = settle([700, 688.4218994140625]);
    const b = settle([688.921875, 688.78125, 688.5, 688.4218994140625]);
    expect(a[0]).toBeCloseTo(b[0], 12);
    expect(a[1]).toBeCloseTo(b[1], 12);
  });
});
