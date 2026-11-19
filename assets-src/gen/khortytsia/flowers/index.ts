// Квітник — a flower clump against a wall or a fence (plan M2-10, ART-BIBLE §6 «тин і квіти»; art-director: ~16×6,
// 2–3 stem heights, a darker base): `a` чорнобривці (2×2 orange heads with a dark centre), `b` poppies (2×2 red with a
// black centre) and a few blue cornflowers. Ramps: grass, gold / crimson, cloth, ink. 18×9, pivot at the base centre;
// contact shadow.
import { compose, contactShadow } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 18;
const H = 9;
const GROUND = 7;

type Head = 'marigold' | 'poppy' | 'cornflower';

/** A stem `h` px tall at x and its head on top. */
function flower(p: Plot, x: number, h: number, head: Head): void {
  for (let k = 1; k < h; k++) p.set(x, GROUND - k, 'grass', 3);
  const y = GROUND - h - 1;
  if (head === 'cornflower') {
    p.set(x, y + 1, 'cloth', 3);
    p.set(x + 1, y + 1, 'cloth', 2);
    return;
  }
  const ramp = head === 'marigold' ? 'gold' : 'crimson';
  const [lit, mid] = head === 'marigold' ? [3, 2] : [5, 4];
  p.set(x, y, ramp, lit);
  p.set(x + 1, y, ramp, mid);
  p.set(x, y + 1, ramp, mid);
  // The dark centre: the poppy's black eye, the marigold's brown heart.
  if (head === 'poppy') p.set(x + 1, y + 1, 'ink', 0);
  else p.set(x + 1, y + 1, 'gold', 0);
}

/** [x, stem height, head] — three stem heights per clump. */
const BEDS: Readonly<Record<'a' | 'b', readonly (readonly [number, number, Head])[]>> = {
  a: [
    [2, 3, 'marigold'],
    [5, 5, 'marigold'],
    [8, 4, 'marigold'],
    [11, 5, 'marigold'],
    [14, 3, 'marigold'],
  ],
  b: [
    [2, 4, 'poppy'],
    [4, 2, 'cornflower'],
    [6, 5, 'poppy'],
    [9, 3, 'cornflower'],
    [11, 4, 'poppy'],
    [14, 5, 'poppy'],
    [15, 2, 'cornflower'],
  ],
};

const flowers: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'flowers',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: ['a', 'b'],
  layers: ['shadow'],
  anchor: { x: 9 / W, y: (GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const p = new Plot();
    // The darker leafy base, then the stems and heads.
    for (let x = 1; x <= 16; x++) {
      p.set(x, GROUND, 'grass', 1);
      if (x % 2 === 0 || x % 5 === 0) p.set(x, GROUND - 1, 'grass', x < 6 ? 3 : 2);
    }
    for (const [x, h, head] of BEDS[variant === 'a' ? 'a' : 'b']) flower(p, x, h, head);
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
    if (layers.shadow) contactShadow(layers.shadow, { x0: 1, x1: 17, groundY: GROUND, height: 3 });
  },
};

export default flowers;
