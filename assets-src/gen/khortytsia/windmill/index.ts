// Козловий вітряк — a post mill (plan ART-13, ART-BIBLE §6 "вітряк (козлового типу)"): a plank cabin under a gable
// plank roof standing on a trestle (козли: a central post on a cross-base, two diagonal struts), a ladder up to the
// back door and the long tail pole (водило) the miller turns the mill into the wind with. The sails are a separate
// animated sprite (`windmill-sails`, 8 frames) hung on the hub. 56×96, pivot at the base; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { IndexBuffer } from '../../lib/buffer.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 56;
const H = 96;
export const WINDMILL_GROUND = 94;
/** Closer to a cube than a tower (a narrow tall cabin read as a water tower). */
const CABIN = { x: 12, w: 36, top: 36, bottom: 66 };
/** Hub (sail axle) position in the sprite: on the cabin's front, under the gable. */
export const WINDMILL_HUB = { x: 30, y: 42 };

/** A post mill's frame in its canvas (tier I below; the M2-07 tiers scale it). */
export interface MillGeometry {
  /** Centre column: the post, the ridge and the hub. */
  readonly cx: number;
  readonly ground: number;
  readonly cabin: { readonly w: number; readonly top: number; readonly bottom: number };
  readonly roofH: number;
}

const TIER1: MillGeometry = { cx: 30, ground: WINDMILL_GROUND, cabin: CABIN, roofH: 16 };

/** Hub (axle end) of a mill: under the gable, 6 rows below the cabin top. */
export const millHub = (g: MillGeometry): { x: number; y: number } => ({ x: g.cx, y: g.cabin.top + 6 });

/**
 * Paints the mill — ladder and tail pole, trestle, plank cabin with a window and the back door, gable plank roof,
 * hub boss — into `p`. Tier I (`TIER1`) is the M-ART frame; the write order is that frame's.
 */
export function paintMill(p: Plot, g: MillGeometry): void {
  const { cx, ground } = g;
  const cabinX = cx - g.cabin.w / 2;
  const { top, bottom, w } = g.cabin;
  // Ladder and tail pole (водило) at the back: drawn first, so the trestle post overlaps them; the ladder one ramp
  // darker (wood 1 rails, wood 2 rungs), the водило 2 px wide (wood 2 with a wood 4 top px).
  for (let k = 0; k < ground - bottom - 6; k++) {
    const x = cabinX + 12 - Math.floor(k * 0.35);
    const y = bottom + k;
    p.set(x, y, 'wood', 1);
    p.set(x + 4, y, 'wood', 1);
    if (k % 3 === 0) for (let r = 1; r < 4; r++) p.set(x + r, y, 'wood', 2);
  }
  for (let k = 0; k < 34; k++) {
    const x = cabinX + 4 - Math.floor(k * 0.5);
    const y = bottom + k;
    if (y >= ground) break;
    p.set(x, y, 'wood', 4);
    p.set(x, y + 1, 'wood', 2);
    p.set(x + 1, y + 1, 'wood', 2);
  }
  // Trestle: the cross-base beam on the ground, the central post, two diagonal struts.
  for (let x = cx - 16; x < cx + 16; x++) {
    p.set(x, ground - 1, 'wood', 3);
    p.set(x, ground, 'wood', 1);
  }
  for (let y = bottom; y < ground - 1; y++) {
    p.set(cx - 1, y, 'wood', 4);
    p.set(cx, y, 'wood', 3);
    p.set(cx + 1, y, 'wood', 1);
  }
  for (let k = 0; k < 20; k++) {
    const y = ground - 2 - k;
    p.set(cx - 14 + Math.floor(k * 0.65), y, 'wood', 4);
    p.set(cx - 13 + Math.floor(k * 0.65), y, 'wood', 2);
    p.set(cx + 13 - Math.floor(k * 0.65), y, 'wood', 2);
    p.set(cx + 14 - Math.floor(k * 0.65), y, 'wood', 1);
  }
  // Cabin: vertical boards with 1-px seams, lit left third, shaded right; a dark plank skirt at the bottom.
  for (let y = top; y < bottom; y++) {
    for (let x = cabinX; x < cabinX + w; x++) {
      const u = (x - cabinX) / (w - 1);
      const seam = (x - cabinX) % 4 === 3;
      let shade = u < 0.3 ? 4 : u > 0.75 ? 2 : 3;
      if (seam) shade -= 1;
      if (y >= bottom - 3) shade = Math.max(1, shade - 1);
      if (x === cabinX) shade = 6; // sun-side rim, like the khatas
      p.set(x, y, 'wood', shade);
    }
  }
  // A small window under the hub and a plank door at the back (left side).
  for (let y = top + 12; y < top + 16; y++) for (let x = cx + 8; x < cx + 11; x++) p.set(x, y, 'ink', 2);
  for (let y = bottom - 12; y < bottom - 1; y++) for (let x = cabinX + 3; x < cabinX + 7; x++) p.set(x, y, 'wood', 1);
  // Gable plank roof: from the eaves (1 px overhang) up to a ridge; lit left slope, dark right, a ridge board.
  const roofTop = top - g.roofH;
  for (let y = roofTop; y < top; y++) {
    const r = y - roofTop;
    const half = Math.round(2 + (r * (w / 2 + 1)) / g.roofH);
    for (let x = cx - half; x < cx + half; x++) {
      const left = x < cx;
      const board = (y + (left ? x : -x)) % 3 === 0;
      // A 1-px wood 6 rim along the sun-side (left) gable edge.
      const rim = left && x === cx - half;
      p.set(x, y, 'wood', rim ? 6 : left ? (board ? 5 : 4) : board ? 1 : 2);
    }
  }
  for (let x = cx - 2; x < cx + 2; x++) p.set(x, roofTop - 1, 'wood', 3);
  // Hub boss (the axle end), under the sails.
  const hub = millHub(g);
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    p.set(hub.x + dx - 1, hub.y + dy - 1, 'wood', 1);
  }
}

/** The mill's cast shadow from the post to past the cabin's right side. */
export function millShadow(layer: IndexBuffer, g: MillGeometry): void {
  castShadow(layer, { x0: g.cx, x1: g.cx + g.cabin.w / 2 - 1, groundY: g.ground });
}

const windmill: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'windmill',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 30 / W, y: (WINDMILL_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    paintMill(p, TIER1);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) millShadow(layers.shadow, TIER1);
  },
};

export default windmill;
