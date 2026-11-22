// Plot outlines (M2-29): which sprites make a building's ring and which cut it (render/fx/outline.ts `outlineSets`).
import { describe, expect, it } from 'vitest';
import { outlineSets, type Box, type OutlineItem } from '../../../src/render/fx/outline.ts';
import type { PlotBuilding } from '../../../src/content/villages/khortytsia.layout.ts';

const item = (id: string, building: PlotBuilding | null, z: number, box: Box, visible = true): OutlineItem<string> => ({
  item: id,
  building,
  z,
  visible,
  box: () => box,
});

describe('outlineSets', () => {
  const house = item('house', 'potter', 100, { x0: 10, y0: 10, x1: 40, y1: 50 });
  const fence = item('fence', 'potter', 102, { x0: 45, y0: 40, x1: 70, y1: 52 });
  it('rings every shown sprite of the building; hidden ones and other buildings are not part of it', () => {
    const items = [
      house,
      fence,
      item('old', 'potter', 100, house.box(), false),
      item('mill', 'windmill', 50, house.box()),
    ];
    expect(outlineSets(items, 'potter').parts).toEqual(['house', 'fence']);
  });

  it('cuts the ring with what is drawn in front and touches it (1-px ring included), never with what stands behind', () => {
    const items = [
      house,
      fence,
      item('person-front', null, 120, { x0: 30, y0: 30, x1: 38, y1: 54 }),
      item('just-touching', null, 120, { x0: 70, y0: 52, x1: 80, y1: 60 }),
      item('far-front', null, 120, { x0: 200, y0: 30, x1: 210, y1: 54 }),
      item('tree-behind', null, 90, { x0: 0, y0: 0, x1: 60, y1: 40 }),
      item('hidden-front', null, 120, { x0: 30, y0: 30, x1: 38, y1: 54 }, false),
    ];
    expect(outlineSets(items, 'potter').occluders).toEqual(['person-front', 'just-touching']);
  });

  it('nothing to outline while the building shows nothing', () => {
    expect(outlineSets([item('x', null, 1, house.box())], 'potter')).toEqual({ parts: [], occluders: [] });
  });
});
