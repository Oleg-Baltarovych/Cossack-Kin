import { describe, expect, it } from 'vitest';
import { sheetReducer, snapSheet, tabOfBuilding, type SheetHeights } from '../../../src/ui/sheet.ts';

const H: SheetHeights = { collapsed: 50, half: 250, full: 750 };
const CFG = { flickPxPerMs: 0.5 };

describe('bottom sheet states (M2-13)', () => {
  it('the toggle button walks collapsed → half → full → collapsed', () => {
    expect(sheetReducer('collapsed', { type: 'toggle' })).toBe('half');
    expect(sheetReducer('half', { type: 'toggle' })).toBe('full');
    expect(sheetReducer('full', { type: 'toggle' })).toBe('collapsed');
  });

  it('Esc collapses from half and full', () => {
    expect(sheetReducer('full', { type: 'escape' })).toBe('collapsed');
    expect(sheetReducer('half', { type: 'escape' })).toBe('collapsed');
    expect(sheetReducer('collapsed', { type: 'escape' })).toBe('collapsed');
  });

  it('opening (a tab while collapsed, a tapped building) shows at least half; full stays full', () => {
    expect(sheetReducer('collapsed', { type: 'open' })).toBe('half');
    expect(sheetReducer('half', { type: 'open' })).toBe('half');
    expect(sheetReducer('full', { type: 'open' })).toBe('full');
  });

  it('a release snaps to the drag result', () => {
    expect(sheetReducer('half', { type: 'release', height: 700, velocity: 0, heights: H }, CFG)).toBe('full');
  });
});

describe('snapSheet: where a released drag settles', () => {
  it('a slow release snaps to the nearest height', () => {
    expect(snapSheet(140, 0, H, CFG)).toBe('collapsed');
    expect(snapSheet(160, 0.2, H, CFG)).toBe('half');
    expect(snapSheet(480, -0.4, H, CFG)).toBe('half');
    expect(snapSheet(520, 0, H, CFG)).toBe('full');
  });

  it('a flick (|v| ≥ threshold) goes to the next height in its direction, however short the drag', () => {
    // velocity > 0: the finger moves down, the sheet closes.
    expect(snapSheet(240, 0.5, H, CFG)).toBe('collapsed');
    expect(snapSheet(260, -0.6, H, CFG)).toBe('full');
    expect(snapSheet(700, 1, H, CFG)).toBe('half');
    expect(snapSheet(60, -2, H, CFG)).toBe('half');
  });

  it('a flick past the ends stays at the end', () => {
    expect(snapSheet(40, 3, H, CFG)).toBe('collapsed');
    expect(snapSheet(760, -3, H, CFG)).toBe('full');
  });
});

describe('tabOfBuilding', () => {
  it('farm and suburb buildings are in the farm list, Sich ones in the Sich list', () => {
    expect(tabOfBuilding('windmill')).toBe('farm');
    expect(tabOfBuilding('smithy')).toBe('farm');
    expect(tabOfBuilding('kurins')).toBe('sich');
    expect(tabOfBuilding('special')).toBe('sich');
  });
});
