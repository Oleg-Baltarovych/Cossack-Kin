// The loot icons 16×16 (plan M3-12): the raid's chest (closed and open) and the relics with their silhouettes for the
// «Скарбниця». Drawn like the UI icons (`../../ui/icon`: the same shapes, lighting and outline), but packed in their own
// `loot` atlas: growing the `ui` sheet changed how Chrome rasterised the HUD's top-row icons at dpr 3.5 (soft, not
// on the pixel grid — e2e hud.spec), so the HUD's sheet stays as it was. A relic's `<id>-unknown` is its own shape
// in ink only (no colour, no detail). Integer and + − × ÷ math only (types.ts determinism).
import type { RampName } from '../../lib/buffer.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { Icon, ICON_FRAME, ICON_MARGIN, ICON_SIZE } from '../../ui/icon/index.ts';

export const LOOT_ICONS = [
  'chest',
  'chest-open',
  'pernach',
  'porokhivnytsia',
  'pernach-unknown',
  'porokhivnytsia-unknown',
  // M4-06, appended (frames keep their atlas places): «Кобза діда» and its silhouette.
  'kobza',
  'kobza-unknown',
] as const;
export type LootIconId = (typeof LOOT_ICONS)[number];

/** A stroke 2 px wide along the segment (x0, y0)–(x1, y1) (px-centre distance ≤ `half`), shaded like any fill. */
function stroke(
  i: Icon,
  [x0, y0]: readonly [number, number],
  [x1, y1]: readonly [number, number],
  half: number,
  ramp: RampName,
  base: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  i.fill(
    (x, y) => {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      const ex = x - (x0 + t * dx);
      const ey = y - (y0 + t * dy);
      return ex * ex + ey * ey <= half * half;
    },
    ramp,
    base,
    { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(Math.abs(dx), Math.abs(dy)) / 2 },
  );
}

/** The chest's body (plan M3-12; the raid's result window): an oak box with two iron bands and a brass lock plate. */
function chestBody(i: Icon): void {
  i.rect(1, 8, 14, 14, 'wood', 3);
  // The bottom plank a step darker, so the box stands on its foot.
  for (let x = 1; x <= 14; x++) i.set(x, 14, 'wood', 1, { flat: true });
  for (const x of [3, 12]) for (let y = 8; y <= 14; y++) i.set(x, y, 'stone', 4, { flat: true });
}

/** Скриня: the closed chest — a rounded lid with the same bands, the lock plate across the seam. */
function chest(i: Icon): void {
  chestBody(i);
  i.fill(
    (x, y) => {
      const dx = (x - 8) / 7;
      const dy = (y - 7.5) / 5;
      return y <= 7.5 && dx * dx + dy * dy <= 1;
    },
    'wood',
    4,
    { cx: 8, cy: 5, r: 6 },
  );
  for (const x of [3, 12]) for (let y = 3; y <= 7; y++) if (i.has(x, y)) i.set(x, y, 'stone', 5, { flat: true });
  // The seam under the lid, then the brass plate with its keyhole.
  for (let x = 2; x <= 13; x++) i.set(x, 7, 'wood', 1, { flat: true });
  i.rect(6, 6, 9, 10, 'gold', 3);
  i.set(7, 8, 'ink', 1, { flat: true });
  i.set(8, 8, 'ink', 1, { flat: true });
  i.set(7, 9, 'ink', 2, { flat: true });
}

/** The chest opened: the lid thrown back behind, the box full of ducats heaped over its rim, one glint. */
function chestOpen(i: Icon): void {
  // The lid, seen from inside as it leans back on its hinges: a dark plank behind the heap, its ends on the box sides.
  i.rect(1, 3, 14, 6, 'wood', 1);
  for (const x of [3, 12]) for (let y = 3; y <= 6; y++) i.set(x, y, 'stone', 3, { flat: true });
  // The heap of coins over the rim.
  i.fill(
    (x, y) => {
      const dx = (x - 8) / 6.4;
      const dy = (y - 9) / 4.6;
      return y <= 9 && dx * dx + dy * dy <= 1;
    },
    'gold',
    3,
    { cx: 8, cy: 6, r: 5 },
  );
  for (const [x, y] of [
    [5, 7],
    [8, 6],
    [11, 7],
    [7, 8],
    [10, 8],
  ] as const)
    i.set(x, y, 'gold', 1, { flat: true });
  chestBody(i);
  // The box's rim, and the brass plate hanging open on the front.
  for (let x = 1; x <= 14; x++) i.set(x, 8, 'wood', 5, { flat: true });
  i.rect(6, 9, 9, 11, 'gold', 3);
  i.set(9, 5, 'gold', 5, { flat: true });
}

/**
 * Пернач: a flanged mace laid on the slant (never the upright gold булава of glory) — a steel head of feathers (пера)
 * on a dark wooden haft with an iron collar and a crimson tassel at its foot.
 */
function pernach(i: Icon): void {
  stroke(i, [2.5, 14.5], [9, 8], 0.9, 'wood', 2);
  // The head: a steel core with four flanges standing out across the haft's line.
  i.disc(11, 5, 2.6, 'stone', 4);
  for (const [a, b] of [
    [
      [9, 1.5],
      [13, 1.5],
    ],
    [
      [14.5, 3],
      [14.5, 7],
    ],
    [
      [7.5, 3.5],
      [7.5, 6.5],
    ],
    [
      [9.5, 8.5],
      [12.5, 8.5],
    ],
  ] as const)
    stroke(i, a, b, 0.7, 'stone', 5);
  // A dark core between the flanges, so each перо stands out at chip size.
  for (const [x, y] of [
    [9, 4],
    [9, 6],
    [13, 4],
    [13, 6],
    [10, 3],
    [12, 3],
    [10, 7],
    [12, 7],
  ] as const)
    if (i.has(x, y)) i.set(x, y, 'stone', 2, { flat: true });
  i.set(11, 5, 'stone', 6, { flat: true });
  // A dark iron collar under the head and the tassel at the foot (4 ramps: no brass here).
  i.rect(8, 8, 9, 9, 'stone', 2);
  i.set(1, 15, 'crimson', 3);
  i.set(2, 15, 'crimson', 2);
  i.set(1, 14, 'crimson', 3);
  i.set(2, 14, 'crimson', 3);
}

/**
 * Порохівниця: a powder horn — a bone-pale horn curving from its brass spout (left) to the wide end shut with a wooden
 * plug (right), two brass bands, and the leather strap a Cossack hung it on (4 ramps: the strap is wood).
 */
function porokhivnytsia(i: Icon): void {
  // The horn: its curve's low point near the wide end (right), the narrow spout rising on the left.
  const c = (x: number): number => 11 - 0.09 * (x - 12) * (x - 12);
  i.fill(
    (x, y) => {
      if (x < 1.5 || x > 14) return false;
      const half = 0.4 + (x - 1.5) * 0.3;
      return Math.abs(y - c(x)) <= half;
    },
    'thatch',
    3,
    { cx: 9, cy: 9, r: 6 },
  );
  // Bone shading: the lower edge a step darker; the plug in the wide end; the brass bands and spout.
  for (let x = 0; x < ICON_SIZE; x++) {
    let low = -1;
    for (let y = 0; y < ICON_SIZE; y++) if (i.has(x, y)) low = y;
    if (low >= 0) i.set(x, low, 'thatch', 2, { flat: true });
  }
  for (let y = 0; y < ICON_SIZE; y++) {
    if (i.has(14, y)) i.set(14, y, 'wood', 3);
    if (i.has(13, y)) i.set(13, y, 'wood', 4);
    for (const x of [5, 10]) if (i.has(x, y)) i.set(x, y, 'gold', 3, { flat: true });
  }
  i.set(1, 4, 'gold', 3);
  i.set(2, 4, 'gold', 3);
  // The leather strap from band to band, a shallow sag just above the horn.
  const top = (x: number): number => {
    for (let y = 0; y < ICON_SIZE; y++) if (i.has(x, y)) return y;
    return ICON_SIZE;
  };
  const a = top(5) - 2;
  const b = top(10) - 2;
  for (let x = 5; x <= 10; x++) {
    const y = Math.round(a + ((b - a) * (x - 5)) / 5) + (x > 5 && x < 10 ? 1 : 0);
    if (!i.has(x, y)) i.set(x, y, 'wood', 2, { flat: true, solid: false });
  }
}

/**
 * Кобза діда: an old kobza laid on the slant (art-director M4-06, like the world kobzar's) — a pear-shaped bowl with a
 * pale soundboard in a dark rim (it must not melt into the wood-3 niche of a found relic), the sound hole under the
 * string, a bridge near the tail; a short neck carrying the one pale string; a dark pegbox bent back (a 1-px kink off
 * the neck's axis) with brass pegs on both sides. Every px is set flat: no wood 0, 4 ramps (wood, thatch, gold, ink).
 */
function kobza(i: Icon): void {
  // The bowl, drawn px by px (a 16-px ellipse left 4–5-px flat runs): [y, x0, x1] rows of a pear lying on the
  // diagonal — round tail lower left, the shoulders stepping 1:1 into the neck (upper right); runs ≤ 3 on the outline.
  const rows: readonly (readonly [number, number, number])[] = [
    [6, 5, 6],
    [7, 4, 7],
    [8, 3, 7],
    [9, 2, 8],
    [10, 2, 8],
    [11, 1, 8],
    [12, 1, 7],
    [13, 1, 6],
    [14, 2, 4],
  ];
  const inBowl = (x: number, y: number): boolean => rows.some(([ry, x0, x1]) => ry === y && x >= x0 && x <= x1);
  for (const [y, x0, x1] of rows) {
    for (let x = x0; x <= x1; x++) {
      const lit = x + y < 15;
      const rim = !inBowl(x - 1, y) || !inBowl(x + 1, y) || !inBowl(x, y - 1) || !inBowl(x, y + 1);
      // The rim dark (lit side wood 2, shadow side wood 1); the soundboard pale (wood 5 lit, wood 4 in shadow).
      i.set(x, y, 'wood', rim ? (lit ? 2 : 1) : lit ? 5 : 4, { flat: true });
    }
  }
  // The neck: a lit edge, the string on its axis (x + y = 16), a shadow edge.
  for (const [x, y] of [
    [8, 7],
    [9, 6],
    [10, 5],
  ] as const)
    i.set(x, y, 'wood', 2, { flat: true });
  for (const [x, y] of [
    [9, 8],
    [10, 7],
    [11, 6],
  ] as const)
    i.set(x, y, 'wood', 1, { flat: true });
  for (const [x, y] of [
    [8, 8],
    [9, 7],
    [10, 6],
    [11, 5],
  ] as const)
    i.set(x, y, 'thatch', 5, { flat: true });
  // The pegbox bent back: 2 px along the axis, 1 px lower-right of it, dark; brass pegs on both long sides.
  for (const [x, y] of [
    [12, 5],
    [13, 4],
    [13, 5],
    [14, 4],
  ] as const)
    i.set(x, y, 'wood', 1, { flat: true });
  for (const [x, y] of [
    [12, 4],
    [14, 5],
    [13, 6],
  ] as const)
    i.set(x, y, 'gold', 3, { flat: true });
  i.set(13, 3, 'gold', 4, { flat: true });
  // On the soundboard the string is a fine shadowed line from the bridge to the hole; the hole and the bridge dark.
  i.set(5, 11, 'wood', 3, { flat: true });
  for (const [x, y] of [
    [6, 10],
    [7, 9],
  ] as const)
    i.set(x, y, 'ink', 1, { flat: true });
  for (const [x, y] of [
    [4, 11],
    [5, 12],
  ] as const)
    i.set(x, y, 'wood', 1, { flat: true });
}

/** Relics not yet found show as their silhouette (the «Скарбниця», §0.1 П5): the shape, none of the colours. */
const SILHOUETTE: Partial<Readonly<Record<LootIconId, true>>> = {
  'pernach-unknown': true,
  'porokhivnytsia-unknown': true,
  'kobza-unknown': true,
};

const DRAW: Readonly<Record<LootIconId, (i: Icon) => void>> = {
  chest,
  'chest-open': chestOpen,
  pernach,
  porokhivnytsia,
  'pernach-unknown': pernach,
  'porokhivnytsia-unknown': porokhivnytsia,
  kobza,
  'kobza-unknown': kobza,
};

const icon: SpriteGenerator = {
  atlas: 'loot',
  // Frames `loot-icon.<id>/idle/00` (src/ui/icons.ts reads that prefix); generator ids are unique (load.ts).
  id: 'loot-icon',
  size: { w: ICON_FRAME, h: ICON_FRAME },
  frames: { idle: 1 },
  variants: LOOT_ICONS,
  anchor: { x: 0, y: 0 },
  generate(_rng, { variant, buffer, rampSize }) {
    const id = LOOT_ICONS.find((x) => x === variant);
    if (!id) throw new Error(`loot icon: unknown variant ${String(variant)}`);
    const shape = new Icon();
    DRAW[id](shape);
    const done = shape.finish(rampSize);
    // A silhouette: the solid shape one dark shade, its outline the darkest — no colour, no detail.
    if (SILHOUETTE[id]) for (const [k, p] of done) done.set(k, { ramp: 'ink', shade: p.solid ? 3 : 1, solid: p.solid });
    for (const [k, p] of done)
      buffer.set(ICON_MARGIN + (k % ICON_SIZE), ICON_MARGIN + Math.floor(k / ICON_SIZE), {
        ramp: p.ramp,
        shade: p.shade,
      });
  },
};

export default icon;
