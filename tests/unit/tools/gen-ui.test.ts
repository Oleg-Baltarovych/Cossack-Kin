// UI icons (plan M2-14): twelve 16×16 icons in their own `ui` atlas, binary alpha, within the props budget
// (≤ 16 colours, ≤ 4 ramps), wrapped in a coloured (never black) outline, each one distinct; the DOM's id list matches.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import icon, { ICON_SIZE, ICONS } from '../../../assets-src/gen/ui/icon/index.ts';
import { loadPalette } from '../../../assets-src/gen/lib/palette.ts';
import { ICON_IDS } from '../../../src/ui/icons.ts';
import { renderGenerator } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';

const palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));

function frames() {
  const problems: string[] = [];
  const out = renderGenerator(icon, palette, problems);
  expect(problems).toEqual([]);
  return out;
}

describe('UI icons (M2-14)', () => {
  it('one 16×16 frame per icon, in the ui atlas; the DOM knows the same ids', () => {
    expect(icon.atlas).toBe('ui');
    expect([...ICON_IDS]).toEqual([...ICONS]);
    const fs = frames();
    expect(fs.map((f) => f.name)).toEqual(ICONS.map((id) => `icon.${id}/idle/00`));
    for (const f of fs) expect([f.image.width, f.image.height]).toEqual([ICON_SIZE, ICON_SIZE]);
  });

  it('binary alpha, ≤ 16 colours and ≤ 4 ramps per icon, no pure black', () => {
    for (const f of frames()) {
      const d = f.image.data;
      let opaque = 0;
      for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
        const a = d[i * 4 + 3] ?? 0;
        expect([0, 255], f.name).toContain(a);
        if (a === 0) continue;
        opaque += 1;
        expect((d[i * 4] ?? 0) + (d[i * 4 + 1] ?? 0) + (d[i * 4 + 2] ?? 0), f.name).toBeGreaterThan(0);
      }
      // An icon fills a good part of its square: readable at 16 px.
      expect(opaque, f.name).toBeGreaterThan(ICON_SIZE * ICON_SIZE * 0.2);
      const s = colorStats(f.image, palette);
      expect(s.colors, f.name).toBeLessThanOrEqual(16);
      expect(s.ramps.length, f.name).toBeLessThanOrEqual(4);
      expect(s.ramps, f.name).toContain('ink');
    }
  });

  it('every icon differs from the others (the three winds included)', () => {
    const keys = frames().map((f) => Buffer.from(f.image.data).toString('base64'));
    expect(new Set(keys).size).toBe(ICONS.length);
  });
});
