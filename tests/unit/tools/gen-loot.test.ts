// Loot icons (plan M3-12): the chest closed and open and the relics, 16×16 in their own `loot` atlas, drawn like the
// UI icons (binary alpha, ≤ 16 colours and ≤ 4 ramps, a coloured outline); each relic has a silhouette in ink only with
// exactly its shape; the DOM's id list matches, and every relic of the content has its picture and silhouette.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import loot, { LOOT_ICONS } from '../../../assets-src/gen/loot/icon/index.ts';
import { ICON_FRAME } from '../../../assets-src/gen/ui/icon/index.ts';
import { loadPalette } from '../../../assets-src/gen/lib/palette.ts';
import { RELIC_IDS } from '../../../src/content/relics.ts';
import { LOOT_ICON_IDS } from '../../../src/ui/icons.ts';
import { renderGenerator } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';

const palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));

function frames() {
  const problems: string[] = [];
  const out = renderGenerator(loot, palette, problems);
  expect(problems).toEqual([]);
  return new Map(out.map((f) => [f.name.replace(/^loot-icon\.|\/idle\/00$/g, ''), f.image]));
}

describe('loot icons (M3-12)', () => {
  it('their own atlas, one 18×18 frame per id; the DOM knows the same ids; every relic has both pictures', () => {
    expect(loot.atlas).toBe('loot');
    expect([...LOOT_ICON_IDS]).toEqual([...LOOT_ICONS]);
    const fs = frames();
    expect([...fs.keys()]).toEqual([...LOOT_ICONS]);
    for (const img of fs.values()) expect([img.width, img.height]).toEqual([ICON_FRAME, ICON_FRAME]);
    for (const id of RELIC_IDS) expect([fs.has(id), fs.has(`${id}-unknown`)], id).toEqual([true, true]);
  });

  it('pictures: binary alpha, ≤ 16 colours, ≤ 4 ramps with ink; silhouettes: ink only, the same shape', () => {
    const fs = frames();
    for (const [id, img] of fs) {
      for (let i = 3; i < img.data.length; i += 4) expect([0, 255], id).toContain(img.data[i]);
      const s = colorStats(img, palette);
      expect(s.colors, id).toBeLessThanOrEqual(16);
      expect(s.ramps.length, id).toBeLessThanOrEqual(4);
      expect(s.ramps, id).toContain('ink');
    }
    for (const relic of RELIC_IDS) {
      const pic = fs.get(relic);
      const sil = fs.get(`${relic}-unknown`);
      if (!pic || !sil) throw new Error(relic);
      expect(colorStats(sil, palette).ramps).toEqual(['ink']);
      const alpha = (img: typeof pic) => img.data.filter((_, i) => i % 4 === 3).join();
      expect(alpha(sil), relic).toBe(alpha(pic));
    }
    // Every icon differs from the others.
    const keys = [...fs.values()].map((f) => Buffer.from(f.data).toString('base64'));
    expect(new Set(keys).size).toBe(fs.size);
  });
});
