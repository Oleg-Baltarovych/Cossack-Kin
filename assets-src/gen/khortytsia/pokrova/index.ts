// Церква Покрови, tiers II–IV (plan M2-09, ART-BIBLE §6: wooden Cossack baroque, pear domes with ґонт, gold
// crosses); tier I is the `church` frame. II an опасання — a low ґонт gallery roof on posts wrapped round the base,
// the side windows moved up above it; III the domes sheathed in tin, gilt маківки on the side domes, a taller lantern
// with a gilt cupola; IV the main dome gilded (gold 1–5, the ґонт bands and the lit rim kept), every cross 3 px taller.
// The tier-I church drawn 8 px right and 16 px down in a 112×168 canvas, pivot at the base (x 56, row 166).
import { paintChurch, CHURCH_GROUND, GALLERY_REACH, type ChurchLook } from '../church/index.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 112;
const H = 168;
const OX = 8;
const OY = 16;
export const POKROVA_GROUND = CHURCH_GROUND + OY;

const T2: ChurchLook = { gallery: true };
const T3: ChurchLook = { ...T2, sideDomes: 'tin', mainDome: 'tin', makivky: true, lanternRows: 8, lantern: 'gilt' };
export const POKROVA_TIERS: Readonly<Record<string, ChurchLook>> = {
  t2: T2,
  t3: T3,
  t4: { ...T3, mainDome: 'gilt', crossLift: 3 },
};

const pokrova: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'pokrova',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(POKROVA_TIERS),
  layers: ['emissive', 'shadow'],
  anchor: { x: (48 + OX) / W, y: (POKROVA_GROUND + 1) / H },
  generate(_rng, params) {
    const look = POKROVA_TIERS[params.variant ?? 't2'] ?? T2;
    // The gallery's right eave ends 10 px past the right wall (x 90 in the tier-I layout).
    paintChurch(params, look, { ox: OX, oy: OY, shadowX1: 90 + GALLERY_REACH + OX });
  },
};

export default pokrova;
