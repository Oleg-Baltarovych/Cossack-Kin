import { describe, expect, it } from 'vitest';
import type { Plot } from '../../../src/content/villages/khortytsia.layout.ts';
import { plotVariants, visualTiers, type PlotVariants, type VisualTiers } from '../../../src/core/selectors.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { plotAt, plotSpan, type PlotTarget } from '../../../src/render/plotHit.ts';

/** A solid box target (every px opaque) unless `hole` says otherwise. */
function box(
  o: { plot?: Plot; left: number; top: number; width: number; height: number; z: number },
  hole: (lx: number, ly: number) => boolean = () => false,
): PlotTarget {
  return { ...o, plot: o.plot, opaque: (lx, ly) => !hole(lx, ly) };
}

// Builders from a real fresh state (every building at tier 0, the seed's variants), overridden per test.
const FRESH = createInitialState({ seed: 1, now: 0 });
const tiers = (over: Partial<VisualTiers> = {}): VisualTiers => ({ ...visualTiers(FRESH), ...over });
const variants = (over: Partial<PlotVariants>): PlotVariants => ({ ...plotVariants(FRESH), ...over });

const MILL: Plot = { building: 'windmill', from: 1 };
const FIELD: Plot = { building: 'field', from: 1 };
const EMPTY_FIELD: Plot = { building: 'field', from: 0, until: 1 };

describe('plotAt (M2-13: which building a world tap hit)', () => {
  it('maps a world px inside a shown building to its id, outside to null', () => {
    const targets = [box({ plot: MILL, left: 100, top: 50, width: 20, height: 30, z: 80 })];
    const scene = { tiers: tiers({ windmill: 1 }), variants: null };
    expect(plotAt(targets, { x: 110, y: 60 }, scene)).toBe('windmill');
    expect(plotAt(targets, { x: 100, y: 50 }, scene)).toBe('windmill');
    expect(plotAt(targets, { x: 120, y: 60 }, scene)).toBeNull();
    expect(plotAt(targets, { x: 99, y: 60 }, scene)).toBeNull();
  });

  it('ignores transparent px of the frame (the padded box is not the building)', () => {
    const targets = [box({ plot: MILL, left: 0, top: 0, width: 10, height: 10, z: 10 }, (lx) => lx < 5)];
    const scene = { tiers: tiers({ windmill: 1 }), variants: null };
    expect(plotAt(targets, { x: 2, y: 5 }, scene)).toBeNull();
    expect(plotAt(targets, { x: 7, y: 5 }, scene)).toBe('windmill');
  });

  it('only sees the building at its current tier (a hidden tier is not hit)', () => {
    const targets = [
      box({ plot: FIELD, left: 0, top: 0, width: 10, height: 10, z: 10 }),
      box({ plot: EMPTY_FIELD, left: 20, top: 0, width: 10, height: 10, z: 10 }),
    ];
    expect(plotAt(targets, { x: 5, y: 5 }, { tiers: tiers({ field: 0 }), variants: null })).toBeNull();
    // The empty plot stands at tier 0: tapping it opens the field's row too.
    expect(plotAt(targets, { x: 25, y: 5 }, { tiers: tiers({ field: 0 }), variants: null })).toBe('field');
    expect(plotAt(targets, { x: 5, y: 5 }, { tiers: tiers({ field: 2 }), variants: null })).toBe('field');
    expect(plotAt(targets, { x: 25, y: 5 }, { tiers: tiers({ field: 2 }), variants: null })).toBeNull();
  });

  it('the front-most target wins: a plain prop in front (a tree) hides the building behind it', () => {
    const mill = box({ plot: MILL, left: 0, top: 0, width: 20, height: 20, z: 20 });
    const tree = box({ left: 5, top: 5, width: 5, height: 5, z: 30 });
    const field = box({ plot: FIELD, left: 15, top: 10, width: 10, height: 10, z: 25 });
    const scene = { tiers: tiers({ windmill: 1, field: 1 }), variants: null };
    // Order in the list does not matter, only z (then the later one, as Pixi's stable sort draws it).
    for (const targets of [
      [mill, tree, field],
      [field, tree, mill],
    ]) {
      expect(plotAt(targets, { x: 6, y: 6 }, scene)).toBeNull();
      expect(plotAt(targets, { x: 16, y: 12 }, scene)).toBe('field');
      expect(plotAt(targets, { x: 2, y: 2 }, scene)).toBe('windmill');
    }
    const a = box({ plot: MILL, left: 0, top: 0, width: 10, height: 10, z: 10 });
    const b = box({ plot: FIELD, left: 0, top: 0, width: 10, height: 10, z: 10 });
    expect(plotAt([a, b], { x: 1, y: 1 }, scene)).toBe('field');
    expect(plotAt([b, a], { x: 1, y: 1 }, scene)).toBe('windmill');
  });

  it('within `slop` px a near miss still hits the closest building; an exact hit always wins', () => {
    const mill = box({ plot: MILL, left: 10, top: 10, width: 10, height: 10, z: 20 });
    const field = box({ plot: FIELD, left: 23, top: 10, width: 10, height: 10, z: 20 });
    const scene = { tiers: tiers({ windmill: 1, field: 1 }), variants: null };
    expect(plotAt([mill, field], { x: 8, y: 12 }, scene, 2)).toBe('windmill');
    expect(plotAt([mill, field], { x: 7, y: 12 }, scene, 2)).toBeNull();
    // 1 px from the mill, 2 px from the field.
    expect(plotAt([mill, field], { x: 21, y: 12 }, scene, 2)).toBe('windmill');
    expect(plotAt([mill, field], { x: 22, y: 12 }, scene, 2)).toBe('field');
    expect(plotAt([mill, field], { x: 8, y: 12 }, scene)).toBeNull();
  });

  it('a variant add-on counts for its building only while the seed picks it', () => {
    const kennel = box({
      plot: { building: 'potter', from: 1, variant: 1 },
      left: 0,
      top: 0,
      width: 5,
      height: 5,
      z: 5,
    });
    const shown = { tiers: tiers({ potter: 1 }), variants: variants({ potter: 1 }) };
    const other = { tiers: tiers({ potter: 1 }), variants: variants({ potter: 0 }) };
    expect(plotAt([kennel], { x: 1, y: 1 }, shown)).toBe('potter');
    expect(plotAt([kennel], { x: 1, y: 1 }, other)).toBeNull();
  });
});

describe('plotSpan (M2-13: the rows a revealed building takes)', () => {
  it('top of its highest shown part to its lowest ground row; null when nothing of it is drawn', () => {
    const scene = { tiers: tiers({ windmill: 2, field: 1 }), variants: null };
    const targets = [
      box({ plot: MILL, left: 0, top: 40, width: 10, height: 30, z: 66 }),
      box({ plot: { building: 'windmill', from: 2 }, left: 0, top: 20, width: 10, height: 10, z: 64.5 }),
      box({ plot: { building: 'windmill', from: 3 }, left: 0, top: 5, width: 10, height: 10, z: 70 }),
      box({ plot: FIELD, left: 0, top: 0, width: 10, height: 100, z: 99 }),
    ];
    expect(plotSpan(targets, 'windmill', scene)).toEqual({ top: 20, bottom: 66 });
    expect(plotSpan(targets, 'garden', scene)).toBeNull();
    expect(plotSpan(targets, 'windmill', { tiers: tiers({ windmill: 0 }), variants: null })).toBeNull();
  });
});
