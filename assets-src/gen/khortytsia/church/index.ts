// Церква Покрови — the Sich's wooden church (plan ART-12, ART-BIBLE §6: Cossack baroque, wooden, pear domes with
// ґонт, gold crosses): a three-part church — бабинець, нава, вівтар as three log frames in a row — each frame rising in
// tiers (заломи): a ґонт skirt roof (піддашшя), an octagonal plank drum with a lit slit, and on the centre a second
// skirt and drum; each crowned by a pear dome (big bulb, waist, маківка) and a gold cross. The centre top is the
// tallest, with a lantern and маківка — the Sich's highest silhouette. A plank door under a gable in the middle.
// 96×152, pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { drum, goldCross, lanternTop, pearDome, skirtRoof } from '../../lib/recipes-church.ts';
import { logWall, opening } from '../../lib/recipes-sich.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 96;
const H = 152;
export const CHURCH_GROUND = 149;

interface Frame {
  readonly cx: number;
  readonly w: number;
  readonly wallTop: number;
}
const SIDE_L: Frame = { cx: 17, w: 22, wallTop: 126 };
const NAVE: Frame = { cx: 48, w: 40, wallTop: 121 };
const SIDE_R: Frame = { cx: 79, w: 22, wallTop: 126 };

const church: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'church',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: 0.5, y: (CHURCH_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const walls = new Plot();
    const glow = new Plot();
    for (const [i, f] of [SIDE_L, NAVE, SIDE_R].entries()) {
      const x = Math.round(f.cx - f.w / 2);
      logWall(walls, {
        seed: `church:${String(i)}`,
        x,
        y: f.wallTop,
        w: f.w,
        h: CHURCH_GROUND + 1 - f.wallTop,
        ends: true,
      });
    }
    // Side windows (lit at night) and the door in the nave.
    opening(walls, glow, { x: SIDE_L.cx - 2, y: SIDE_L.wallTop + 7, w: 4, h: 6 }, 1);
    opening(walls, glow, { x: SIDE_R.cx - 2, y: SIDE_R.wallTop + 7, w: 4, h: 6 }, 1);
    for (let y = NAVE.wallTop + 10; y <= CHURCH_GROUND; y++) {
      for (let x = NAVE.cx - 4; x < NAVE.cx + 4; x++) {
        const frame = x === NAVE.cx - 4 || x === NAVE.cx + 3 || y === NAVE.wallTop + 10;
        const gap = (x - NAVE.cx) % 3 === 0;
        walls.set(x, y, 'wood', frame ? 1 : gap ? 2 : x < NAVE.cx ? 4 : 3);
      }
    }
    // A small gable over the door.
    for (let k = 0; k < 4; k++) {
      for (let x = NAVE.cx - 6 + k; x < NAVE.cx + 6 - k; x++)
        walls.set(x, NAVE.wallTop + 9 - k, 'wood', x < NAVE.cx ? 4 : 2);
    }

    const tops = new Plot();
    // Side tops: skirt, drum, skirt, dome, cross.
    for (const [i, f] of [SIDE_L, SIDE_R].entries()) {
      skirtRoof(tops, f.cx, f.wallTop - 6, 6, f.w + 8);
      drum(tops, glow, { cx: f.cx, top: f.wallTop - 20, w: 14, h: 14, window: true });
      skirtRoof(tops, f.cx, f.wallTop - 24, 4, 20);
      const tip = pearDome(tops, f.cx, f.wallTop - 24, 18, 15, 11 + i);
      goldCross(tops, f.cx, tip - 10, 9);
    }
    // Centre top: two tiers, the tallest dome.
    skirtRoof(tops, NAVE.cx, NAVE.wallTop - 8, 8, NAVE.w + 8);
    drum(tops, glow, { cx: NAVE.cx, top: NAVE.wallTop - 34, w: 26, h: 26, window: true, twin: true });
    skirtRoof(tops, NAVE.cx, NAVE.wallTop - 40, 6, 32);
    drum(tops, glow, { cx: NAVE.cx, top: NAVE.wallTop - 60, w: 18, h: 20 });
    // The main dome 1–2 px wider than its drum each side, then the lantern and the маківка (the Ukrainian top).
    const domeTip = pearDome(tops, NAVE.cx, NAVE.wallTop - 60, 22, 20, 7);
    const tip = lanternTop(tops, NAVE.cx, domeTip + 1, 9);
    goldCross(tops, NAVE.cx, tip - 12, 11);

    compose(buffer, [walls.part(1, 1, glow), tops.part(2, 2, glow)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [2] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: NAVE.cx, x1: W - 6, groundY: CHURCH_GROUND });
  },
};

export default church;
