// Generator ids are unique (M3-12 review): `pnpm sprites:sheet <id>` writes reports/sprites/<id>.png and frame names
// start with the id, so two generators with one id would overwrite each other's sheet and blur which atlas a frame
// is in. The loader refuses a duplicate.
import { describe, expect, it } from 'vitest';
import { assertUniqueIds, loadGenerators } from '../../../tools/lib/sprites/load.ts';

const gen = (atlas: string, id: string) => ({ atlas, id });

describe('generator ids', () => {
  it('a duplicate id throws, naming it and both atlases; distinct ids pass', () => {
    expect(() => {
      assertUniqueIds([gen('ui', 'icon'), gen('loot', 'icon')]);
    }).toThrow(/icon.*ui.*loot/);
    expect(() => {
      assertUniqueIds([gen('ui', 'icon'), gen('loot', 'loot-icon')]);
    }).not.toThrow();
  });

  it('every generator in assets-src has its own id', async () => {
    const ids = (await loadGenerators()).map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
