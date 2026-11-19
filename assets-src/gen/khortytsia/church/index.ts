// Церква Покрови — the Sich's wooden church (plan ART-12, ART-BIBLE §6: Cossack baroque, wooden, pear domes with
// ґонт, gold crosses): a three-part church — бабинець, нава, вівтар as three log frames in a row — each frame rising in
// tiers (заломи): a ґонт skirt roof (піддашшя), an octagonal plank drum with a lit slit, and on the centre a second
// skirt and drum; each crowned by a pear dome (big bulb, waist, маківка) and a gold cross. The centre top is the
// tallest, with a lantern and маківка — the Sich's highest silhouette. A plank door under a gable in the middle.
// 96×152, pivot at the base. `paintChurch` also draws tiers II–IV (`pokrova`, plan M2-09) from a `ChurchLook`.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { drum, goldCross, lanternTop, pearDome, skirtRoof, type DomeSkin } from '../../lib/recipes-church.ts';
import { logWall, opening } from '../../lib/recipes-sich.ts';
import type { GeneratorParams, SpriteGenerator } from '../../lib/types.ts';

const W = 96;
const H = 152;
export const CHURCH_GROUND = 149;

interface Frame {
  readonly cx: number;
  readonly w: number;
  readonly wallTop: number;
}

/** Later tiers of the church (plan M2-09, `pokrova`); the empty look is tier I. */
export interface ChurchLook {
  /** Опасання: a low ґонт gallery roof on posts round the base of the walls (the side windows move up above it). */
  readonly gallery?: boolean;
  /** Sheathing of the side domes and of the main dome. */
  readonly sideDomes?: DomeSkin;
  readonly mainDome?: DomeSkin;
  /** Gilt маківки on the side domes. */
  readonly makivky?: boolean;
  /** The lantern's rows and its cupola's skin. */
  readonly lanternRows?: number;
  readonly lantern?: DomeSkin;
  /** Extra cross height (px) on every cross. */
  readonly crossLift?: number;
}

/** Where the church stands in the canvas: the tier-I layout shifted by (`ox`, `oy`); the shadow ends at `shadowX1`. */
export interface ChurchPlace {
  readonly ox: number;
  readonly oy: number;
  readonly shadowX1: number;
}

/** Draws the church (base, `@emissive`, `@shadow`) into the frame's buffers. */
export function paintChurch(
  { buffer, layers, rampSize }: Pick<GeneratorParams, 'buffer' | 'layers' | 'rampSize'>,
  look: ChurchLook,
  { ox, oy, shadowX1 }: ChurchPlace,
): void {
  const ground = CHURCH_GROUND + oy;
  const sideL: Frame = { cx: 17 + ox, w: 22, wallTop: 126 + oy };
  const nave: Frame = { cx: 48 + ox, w: 40, wallTop: 121 + oy };
  const sideR: Frame = { cx: 79 + ox, w: 22, wallTop: 126 + oy };
  const walls = new Plot();
  const glow = new Plot();
  for (const [i, f] of [sideL, nave, sideR].entries()) {
    const x = Math.round(f.cx - f.w / 2);
    logWall(walls, {
      seed: `church:${String(i)}`,
      x,
      y: f.wallTop,
      w: f.w,
      h: ground + 1 - f.wallTop,
      ends: true,
    });
  }
  // Side windows (lit at night) and the door in the nave.
  const winY = look.gallery ? 2 : 7;
  opening(walls, glow, { x: sideL.cx - 2, y: sideL.wallTop + winY, w: 4, h: 6 }, 1);
  opening(walls, glow, { x: sideR.cx - 2, y: sideR.wallTop + winY, w: 4, h: 6 }, 1);
  for (let y = nave.wallTop + 10; y <= ground; y++) {
    for (let x = nave.cx - 4; x < nave.cx + 4; x++) {
      const frame = x === nave.cx - 4 || x === nave.cx + 3 || y === nave.wallTop + 10;
      const gap = (x - nave.cx) % 3 === 0;
      walls.set(x, y, 'wood', frame ? 1 : gap ? 2 : x < nave.cx ? 4 : 3);
    }
  }
  // A small gable over the door.
  for (let k = 0; k < 4; k++) {
    for (let x = nave.cx - 6 + k; x < nave.cx + 6 - k; x++)
      walls.set(x, nave.wallTop + 9 - k, 'wood', x < nave.cx ? 4 : 2);
  }

  const tops = new Plot();
  const lift = look.crossLift ?? 0;
  // Side tops: skirt, drum, skirt, dome, (маківка), cross.
  for (const [i, f] of [sideL, sideR].entries()) {
    skirtRoof(tops, f.cx, f.wallTop - 6, 6, f.w + 8);
    drum(tops, glow, { cx: f.cx, top: f.wallTop - 20, w: 14, h: 14, window: true });
    skirtRoof(tops, f.cx, f.wallTop - 24, 4, 20);
    let tip = pearDome(tops, f.cx, f.wallTop - 24, 18, 15, 11 + i, look.sideDomes);
    if (look.makivky) tip = pearDome(tops, f.cx, tip + 1, 5, 6, 13 + i, 'gilt');
    goldCross(tops, f.cx, tip - 10 - lift, 9 + lift);
    // Gilt tier (IV): one warm specular px on each cross top in the night mask.
    if (look.mainDome === 'gilt') glow.set(f.cx, tip - 11 - lift, 'gold', 5);
  }
  // Centre top: two tiers, the tallest dome.
  skirtRoof(tops, nave.cx, nave.wallTop - 8, 8, nave.w + 8);
  drum(tops, glow, { cx: nave.cx, top: nave.wallTop - 34, w: 26, h: 26, window: true, twin: true });
  skirtRoof(tops, nave.cx, nave.wallTop - 40, 6, 32);
  drum(tops, glow, { cx: nave.cx, top: nave.wallTop - 60, w: 18, h: 20 });
  // The main dome 1–2 px wider than its drum each side, then the lantern and the маківка (the Ukrainian top).
  const domeTip = pearDome(tops, nave.cx, nave.wallTop - 60, 22, 20, 7, look.mainDome);
  const tip = lanternTop(tops, nave.cx, domeTip + 1, 9, look.lanternRows, look.lantern);
  goldCross(tops, nave.cx, tip - 12 - lift, 11 + lift);
  if (look.mainDome === 'gilt') {
    // One warm specular px on the gilt dome's lit shoulder and on the cross top (night mask, art-director M2-09).
    glow.set(nave.cx - 6, nave.wallTop - 60 - 9, 'gold', 5);
    glow.set(nave.cx, tip - 13 - lift, 'gold', 5);
  }
  if (look.gallery) gallery(tops, ground, sideL, nave, sideR);

  compose(buffer, [walls.part(1, 1, glow), tops.part(2, 2, glow)], rampSize, {
    light: false,
    occlusion: false,
    outline: { mode: 'outer', parts: [2] },
    selective: { lit: 'vanish' },
    ...(layers.emissive ? { emissive: layers.emissive } : {}),
  });
  if (layers.shadow) castShadow(layers.shadow, { x0: nave.cx, x1: shadowX1, groundY: ground });
}

/** How far the опасання reaches past the side walls (px). */
export const GALLERY_REACH = 10;

/**
 * Опасання: one continuous ґонт band, 6 rows, its eave 7 rows over the ground, reaching `GALLERY_REACH` px past the
 * side walls and sloping in by 5 px at both ends; lit from the left (wood 6 rim on the left top row, wood 4/5 →
 * 3/4 → 2/3 to the right), a dark eave row; open at the door. 2-px posts (lit left, shaded right) under it, a plank
 * floor and a rail in the open bays past the walls, a dark row under the eave on the logs.
 */
function gallery(tops: Plot, ground: number, left: Frame, nave: Frame, right: Frame): void {
  const eave = ground - 7;
  const wallL = Math.round(left.cx - left.w / 2);
  const wallR = Math.round(right.cx + right.w / 2);
  const x0 = wallL - GALLERY_REACH;
  const x1 = wallR + GALLERY_REACH;
  const door = (x: number): boolean => x >= nave.cx - 6 && x < nave.cx + 6;
  for (let r = 0; r < 6; r++) {
    const inset = 5 - r;
    for (let x = x0 + inset; x < x1 - inset; x++) {
      if (door(x)) continue;
      const u = (x - x0) / (x1 - x0);
      const shingle = (x + (r % 2) * 2) % 4 === 0;
      let shade = u < 0.45 ? (shingle ? 5 : 4) : u < 0.75 ? (shingle ? 4 : 3) : shingle ? 3 : 2;
      if (r === 5) shade = u < 0.45 ? 2 : 1;
      else if ((r === 0 && u < 0.45) || x === x0 + inset) shade = 6;
      tops.set(x, eave - 5 + r, 'wood', shade);
    }
  }
  for (let x = x0; x < x1; x++) {
    if (door(x)) continue;
    if (x >= wallL && x < wallR) {
      tops.set(x, eave + 1, 'wood', 1);
      continue;
    }
    tops.set(x, ground, 'wood', 1);
    tops.set(x, ground - 1, 'wood', x < nave.cx ? 4 : 2);
    tops.set(x, eave + 3, 'wood', x < nave.cx ? 3 : 2);
  }
  const posts = [x0 + 1, wallL + 5, left.cx + 6, nave.cx - 8, nave.cx + 6, right.cx - 7, wallR - 7, x1 - 3];
  for (const px of posts) {
    for (let y = eave + 1; y <= ground; y++) {
      tops.set(px, y, 'wood', 4);
      tops.set(px + 1, y, 'wood', 1);
    }
  }
}

const church: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'church',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: 0.5, y: (CHURCH_GROUND + 1) / H },
  generate(_rng, params) {
    paintChurch(params, {}, { ox: 0, oy: 0, shadowX1: W - 6 });
  },
};

export default church;
