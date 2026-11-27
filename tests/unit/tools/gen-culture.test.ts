// Culture icons (plan M4-10): the 12 nodes and 2 branches of the culture tree, 16×16 in 18×18 frames in their own
// DOM-only `culture` atlas (the `ui` sheet does not grow, like `loot`); drawn like the UI icons (binary alpha, ≤ 16
// colours and ≤ 4 ramps, an ink outline). Every node and branch of the content has its frame, and the DOM knows the ids.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import culture, { CULTURE_ICONS } from '../../../assets-src/gen/culture/icon/index.ts';
import { ICON_FRAME } from '../../../assets-src/gen/ui/icon/index.ts';
import { loadPalette } from '../../../assets-src/gen/lib/palette.ts';
import { CULTURE_BRANCH_IDS, CULTURE_NODES } from '../../../src/content/culture.ts';
import { CULTURE_ICON, CULTURE_ICON_IDS, parseIconAtlas } from '../../../src/ui/icons.ts';
import { WORLD_ATLASES } from '../../../src/render/atlases.ts';
import { renderGenerator } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';

const palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));

function frames() {
  const problems: string[] = [];
  const out = renderGenerator(culture, palette, problems);
  expect(problems).toEqual([]);
  return new Map(out.map((f) => [f.name.replace(/^culture-icon\.|\/idle\/00$/g, ''), f.image]));
}

describe('culture icons (M4-10)', () => {
  it('a DOM-only atlas of their own, one 18×18 frame per id; the DOM knows the same ids', () => {
    expect(culture.atlas).toBe('culture');
    expect(WORLD_ATLASES as readonly string[]).not.toContain('culture');
    expect([...CULTURE_ICON_IDS]).toEqual([...CULTURE_ICONS]);
    const fs = frames();
    expect([...fs.keys()]).toEqual([...CULTURE_ICONS]);
    for (const img of fs.values()) expect([img.width, img.height]).toEqual([ICON_FRAME, ICON_FRAME]);
  });

  it('every culture node and branch of the content has its own frame', () => {
    const fs = frames();
    const ids = [...CULTURE_NODES.map((n) => n.id), ...CULTURE_BRANCH_IDS];
    for (const id of ids) expect(fs.has(CULTURE_ICON[id]), id).toBe(true);
    expect(new Set(ids.map((id) => CULTURE_ICON[id])).size).toBe(ids.length);
  });

  it('binary alpha, ≤ 16 colours, ≤ 4 ramps with ink; 16×16 art inside a clear 1-px margin; all different', () => {
    const fs = frames();
    for (const [id, img] of fs) {
      for (let i = 3; i < img.data.length; i += 4) expect([0, 255], id).toContain(img.data[i]);
      const s = colorStats(img, palette);
      expect(s.colors, id).toBeLessThanOrEqual(16);
      expect(s.ramps.length, id).toBeLessThanOrEqual(4);
      expect(s.ramps, id).toContain('ink');
      for (let y = 0; y < ICON_FRAME; y++)
        for (let x = 0; x < ICON_FRAME; x++)
          if (x === 0 || y === 0 || x === ICON_FRAME - 1 || y === ICON_FRAME - 1)
            expect(img.data[(y * ICON_FRAME + x) * 4 + 3], `${id} (${String(x)},${String(y)})`).toBe(0);
    }
    const keys = [...fs.values()].map((f) => Buffer.from(f.data).toString('base64'));
    expect(new Set(keys).size).toBe(fs.size);
  });

  it('the DOM reads the sheet by its own generator prefix', () => {
    const META = { image: 'culture.png', size: { w: 60, h: 60 } };
    const a = parseIconAtlas(
      {
        frames: {
          'culture-icon.music-dumy/idle/00': { frame: { x: 0, y: 0, w: 18, h: 18 } },
          'icon.music/idle/00': { frame: { x: 19, y: 0, w: 18, h: 18 } },
        },
        meta: META,
      },
      '/atlases/',
      CULTURE_ICON_IDS,
      'culture-icon',
    );
    expect([...a.frames.keys()]).toEqual(['music-dumy']);
    expect(a.missing).toContain('music');
  });
});
