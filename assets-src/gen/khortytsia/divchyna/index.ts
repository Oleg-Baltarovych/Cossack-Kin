// Дівчина — a girl in a вінок with ribbons, 16×24, facing right (plan ART-15, ART-BIBLE §7). The woman's paper doll
// (selianka: сорочка, крайка, плахта, чобітки, the same idle/walk tables) with her own head: bare hair under a
// flower wreath (вінок: crimson and gold flowers, green leaves), a braid (коса) down the back and long ribbons
// (стрічки) hanging from the wreath — the girl's silhouette mark, and her secondary motion: they hang in idle and
// stream back on the walk. Variants are palette swaps.
import { compose, contactShadow } from '../../lib/passes.ts';
import { checkMask, paintDoll, type Mask, type Outfit, type Stamp } from '../../lib/doll.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { IDLE, SELIANKA_GROUND, TORSO_AT, WALK, WOMAN_BASE, WOMAN_H, WOMAN_W, womanStamps } from '../selianka/index.ts';

/**
 * Head under the wreath: flowers (hat = crimson, accent = gold) with leaves (belt = green) along the crown, hair over
 * the brow and ear (no kerchief), face 3/4 right.
 */
const HEAD: Mask = ['aCrCaCr.', 'CrcacrCr', 'hHHhhhj.', 'hhSSsss.', 'hhsjsjs.', 'hjssssS.', '.jzsssz.', '...zz...'];

/** Коса: down the back edge of the shirt from the nape (hair, a lit px every other row), tied with a green bow. */
const BRAID: Mask = ['h', 'H', 'h', 'H', 'h', 'H', 'h', 'r'];
const BRAID_AT = { x: 3, y: 8 } as const;

/** Корсетка (belt slot): a sleeveless vest over the blouse — back panel and front edges, the chest left white. */
const VEST: Mask = ['.Rr...t..', 'RRr...tt.', 'Rrr...ttt', 'Rrrr..ttt'];

/**
 * Ribbons: two 1-px strands (accent and hat colours) with a 1-px gap the outline fills — the group is 3 px wide —
 * rooted at the back of the wreath under its top row and hanging along the braid to the waist (art-director ART-15).
 */
const STRANDS: readonly { readonly ch: string; readonly len: number; readonly col: number }[] = [
  { ch: 'a', len: 9, col: 0 },
  { ch: 'c', len: 10, col: 2 },
];
/** Rows at the end of a strand that fan back on the walk; the roots above them never move. */
const FAN_ROWS = 4;
/**
 * Ribbon mask: strand i hangs straight, its last FAN_ROWS rows leaning back (left) up to `fans[i]` px at the tip, so
 * on the walk the two tips separate into colour ends while the roots stay put.
 */
function ribbons(fans: readonly number[]): Mask {
  const reach = Math.max(...STRANDS.map((s) => s.len));
  const spread = Math.max(0, ...fans);
  const rows: string[][] = Array.from({ length: reach }, () => Array<string>(3 + spread).fill('.'));
  STRANDS.forEach((s, i) => {
    for (let k = 0; k < s.len; k++) {
      const t = Math.max(0, k - (s.len - 1 - FAN_ROWS)) / FAN_ROWS;
      const row = rows[k];
      if (row) row[s.col + spread - Math.round(t * (fans[i] ?? 0))] = k === s.len - 1 ? s.ch.toUpperCase() : s.ch;
    }
  });
  return rows.map((r) => r.join(''));
}
/** Idle (hang), idle breath (hang), walk passing (body up), walk contact. */
const RIBBONS: readonly Mask[] = [ribbons([0, 0]), ribbons([0, 0]), ribbons([1, 2]), ribbons([2, 3])];
/** Right edge of the ribbon mask (the right strand): just behind the hair, beside the braid. */
const RIBBON_RIGHT = 2;
/** One row under the wreath's top: nothing rises above or beside it. */
const RIBBON_Y = 3;
/** The sprite is 8 px wider than the woman's (room for the streaming ribbons); every stamp shifts right by this. */
const PAD = 4;
const W = WOMAN_W + 2 * PAD;

for (const m of [HEAD, BRAID, VEST, ...RIBBONS]) checkMask(m, 'divchyna');

/**
 * a: green плахта and корсетка, crimson and gold flowers; b: crimson плахта with gold stripes, a wreath of
 * cornflowers (волошки, blue) and gold, darker hair — no woman shares her skirt (art-director ART-15).
 */
export const DIVCHYNA_OUTFITS: Readonly<Record<string, Outfit>> = {
  a: {
    ...WOMAN_BASE,
    hair: { ramp: 'wood', tones: [1, 2, 3, 4] },
    belt: { ramp: 'grass', tones: [1, 2, 3, 4] },
    hat: { ramp: 'crimson', tones: [1, 2, 3, 4] },
    lower: { ramp: 'grass', tones: [1, 2, 3, 4] },
    accent: { ramp: 'gold', tones: [1, 2, 3, 4] },
  },
  b: {
    ...WOMAN_BASE,
    hair: { ramp: 'wood', tones: [0, 1, 2, 3] },
    belt: { ramp: 'grass', tones: [1, 2, 3, 4] },
    hat: { ramp: 'cloth', tones: [1, 2, 3, 3] },
    lower: { ramp: 'crimson', tones: [1, 2, 3, 4] },
    accent: { ramp: 'gold', tones: [1, 2, 3, 4] },
  },
};

const divchyna: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'divchyna',
  size: { w: W, h: WOMAN_H },
  frames: { idle: IDLE.length, walk: WALK.length },
  variants: Object.keys(DIVCHYNA_OUTFITS),
  layers: ['shadow'],
  anchor: { x: 0.5, y: (SELIANKA_GROUND + 1) / WOMAN_H },
  generate(_rng, { variant, anim, frame, buffer, layers, rampSize }) {
    const outfit = DIVCHYNA_OUTFITS[variant ?? 'a'];
    const pose = (anim === 'walk' ? WALK : IDLE)[frame];
    if (!outfit || !pose) throw new Error(`divchyna: no outfit/pose for ${String(variant)} ${anim} ${String(frame)}`);
    const ribbon = RIBBONS[anim === 'walk' ? (pose.bob < 0 ? 2 : 3) : pose.breath < 0 ? 1 : 0] ?? RIBBONS[0] ?? [];
    const front: Stamp[] = [
      { mask: VEST, x: TORSO_AT.x, y: TORSO_AT.y },
      { mask: BRAID, x: BRAID_AT.x, y: BRAID_AT.y },
    ];
    const plot = new Plot();
    const stamps = womanStamps(pose, HEAD, [], front).map((st) => ({ ...st, x: st.x + PAD }));
    paintDoll(plot, outfit, stamps);
    // Ribbons: their own part without an outline — the outline's lit side is a lighter step of the same ramp, so an
    // outlined 1-px strand reads as a 3-px band (art-director ART-15). They ride with the head, behind the body.
    const ribbonPlot = new Plot();
    const x = PAD + RIBBON_RIGHT + 1 - (ribbon[0]?.length ?? 0);
    paintDoll(ribbonPlot, outfit, [{ mask: ribbon, x, y: RIBBON_Y + pose.bob + pose.breath }]);
    compose(buffer, [ribbonPlot.part(1, 2), plot.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2, parts: [1] },
      selective: { lit: 'lighter' },
    });
    const shadow = layers.shadow;
    if (shadow) contactShadow(shadow, { x0: PAD + 3, x1: PAD + 13, groundY: SELIANKA_GROUND, height: 3 });
  },
};

export default divchyna;
