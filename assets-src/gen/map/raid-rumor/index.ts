// Чутка (plan M3-10, §0.1 П2): the badge M3-11 sets beside the flag of the offer that carries the day's rumour — a
// gold eight-ray glint (the tier flash's star language, ART-BIBLE §9) round a pale centre, in a 1-px ink outline.
// 11×11; pivot = the centre px's top-left corner (whole px, anchors test).
import { Glyph } from '../../lib/glyph.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const RUMOR_SIZE = 11;
const C = 5;

const raidRumor: SpriteGenerator = {
  atlas: 'map',
  id: 'raid-rumor',
  size: { w: RUMOR_SIZE, h: RUMOR_SIZE },
  frames: { idle: 1 },
  anchor: { x: C / RUMOR_SIZE, y: C / RUMOR_SIZE },
  generate(_rng, { buffer }) {
    const g = new Glyph();
    g.set(C, C, 'gold', 5);
    // Orthogonal rays 4 px (bright at the root, darker to the tip), diagonals 2 px.
    const ortho = [4, 4, 3, 2] as const;
    ortho.forEach((s, i) => {
      g.set(C + i + 1, C, 'gold', s);
      g.set(C - i - 1, C, 'gold', s);
      g.set(C, C + i + 1, 'gold', s);
      g.set(C, C - i - 1, 'gold', s);
    });
    const diag = [4, 2] as const;
    diag.forEach((s, i) => {
      g.set(C + i + 1, C + i + 1, 'gold', s);
      g.set(C - i - 1, C - i - 1, 'gold', s);
      g.set(C + i + 1, C - i - 1, 'gold', s);
      g.set(C - i - 1, C + i + 1, 'gold', s);
    });
    // The lit top-left rays one step brighter.
    g.set(C - 1, C, 'gold', 5);
    g.set(C, C - 1, 'gold', 5);
    g.draw(buffer);
  },
};

export default raidRumor;
