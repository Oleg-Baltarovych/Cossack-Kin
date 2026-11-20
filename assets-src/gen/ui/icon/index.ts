// UI icons 16×16 (plan M2-14, SPEC §5 «іконки UI 16×16», ART-BIBLE §2): the HUD's currencies and stats, the wind's
// three states, and the marks later UI needs (pysanky, locked, quest, story milestone). They live in their own `ui`
// atlas, drawn by the React DOM as a CSS sprite (`ui/components/Icon.tsx`), never by Pixi.
// Each icon is a few primitives (disc, polygon, rect, px) filled with ramp shades and lit from the top-left: a
// gradient across the shape plus a lighter top-left edge and a darker bottom-right edge; then a 1-px coloured outline
// (ink-1, never black) wraps every lit shape, so the icon holds on the dark wood HUD and on a gold button alike. Strokes
// that must stay thin (gust lines) are drawn after the outline. Integer and + − × ÷ math only (types.ts determinism).
import type { RampName } from '../../lib/buffer.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const ICON_SIZE = 16;
export const ICONS = [
  'ducat',
  'glory',
  'kharch',
  'cossack',
  'defence',
  'wind-calm',
  'wind-breeze',
  'wind-storm',
  'pysanka',
  'lock',
  'quest',
  'milestone',
] as const;
export type IconId = (typeof ICONS)[number];

interface Px {
  readonly ramp: RampName;
  readonly shade: number;
  /** Takes part in the edge lighting and gets the outline around it. */
  readonly solid: boolean;
}

const OUTLINE: Px = { ramp: 'ink', shade: 1, solid: false };
/** Edge lighting changes a shade by one step; the gradient by one step across the shape. */
const STEP = 1;
/** Gradient threshold: (dx + dy) / r beyond ±EDGE lightens / darkens the px. */
const EDGE = 0.55;

class Icon {
  private readonly px = new Map<number, Px>();
  private readonly flat = new Set<number>();

  private key(x: number, y: number): number {
    return y * ICON_SIZE + x;
  }

  has(x: number, y: number): boolean {
    return this.px.has(this.key(x, y));
  }

  private solidAt(x: number, y: number): boolean {
    return this.px.get(this.key(x, y))?.solid === true;
  }

  set(x: number, y: number, ramp: RampName, shade: number, opts: { flat?: boolean; solid?: boolean } = {}): void {
    if (x < 0 || y < 0 || x >= ICON_SIZE || y >= ICON_SIZE) return;
    const k = this.key(x, y);
    this.px.set(k, { ramp, shade, solid: opts.solid ?? true });
    if (opts.flat === true) this.flat.add(k);
    else this.flat.delete(k);
  }

  /** Every px whose centre passes `inside`, shaded `base` ± one step by the top-left gradient around (cx, cy). */
  fill(
    inside: (x: number, y: number) => boolean,
    ramp: RampName,
    base: number,
    centre: { cx: number; cy: number; r: number },
    opts: { flat?: boolean } = {},
  ): void {
    for (let y = 0; y < ICON_SIZE; y++) {
      for (let x = 0; x < ICON_SIZE; x++) {
        const fx = x + 0.5;
        const fy = y + 0.5;
        if (!inside(fx, fy)) continue;
        const t = (fx - centre.cx + (fy - centre.cy)) / centre.r;
        const shade = t < -EDGE ? base + STEP : t > EDGE ? base - STEP : base;
        this.set(x, y, ramp, shade, opts);
      }
    }
  }

  disc(cx: number, cy: number, r: number, ramp: RampName, base: number, opts: { flat?: boolean } = {}): void {
    this.fill((x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r, ramp, base, { cx, cy, r }, opts);
  }

  rect(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    ramp: RampName,
    base: number,
    opts: { flat?: boolean } = {},
  ): void {
    const centre = { cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, r: Math.max(x1 - x0 + 1, y1 - y0 + 1) / 2 };
    this.fill((x, y) => x >= x0 && x <= x1 + 1 && y >= y0 && y <= y1 + 1, ramp, base, centre, opts);
  }

  /** A convex or concave polygon (even-odd rule) through px-corner coordinates. */
  poly(points: readonly (readonly [number, number])[], ramp: RampName, base: number): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const r = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    const inside = (x: number, y: number): boolean => {
      let odd = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        if (!a || !b) continue;
        if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) odd = !odd;
      }
      return odd;
    };
    this.fill(inside, ramp, base, { cx, cy, r });
  }

  /** Lighter top-left edges, darker bottom-right edges of every solid, non-flat px; then the outline around them. */
  finish(rampSize: (ramp: RampName) => number): Map<number, Px> {
    const lit = new Map<number, Px>();
    for (const [k, p] of this.px) {
      const x = k % ICON_SIZE;
      const y = Math.floor(k / ICON_SIZE);
      let shade = p.shade;
      if (p.solid && !this.flat.has(k)) {
        if (!this.solidAt(x - 1, y) || !this.solidAt(x, y - 1)) shade += STEP;
        else if (!this.solidAt(x + 1, y) || !this.solidAt(x, y + 1)) shade -= STEP;
      }
      lit.set(k, { ...p, shade: Math.max(0, Math.min(rampSize(p.ramp) - 1, shade)) });
    }
    for (let y = 0; y < ICON_SIZE; y++) {
      for (let x = 0; x < ICON_SIZE; x++) {
        if (this.has(x, y)) continue;
        if (this.solidAt(x - 1, y) || this.solidAt(x + 1, y) || this.solidAt(x, y - 1) || this.solidAt(x, y + 1))
          lit.set(this.key(x, y), OUTLINE);
      }
    }
    return lit;
  }
}

// --- the icons ---------------------------------------------------------------------------------------------------

/** Дукат: a gold coin — a darker raised rim, a lighter face, a groove and a dark stamped cross (contrast on a gold button). */
function ducat(i: Icon): void {
  i.disc(8, 8, 6.6, 'gold', 2);
  i.disc(8, 8, 4.2, 'gold', 3, { flat: true });
  // The rim's inner groove.
  i.fill(
    (x, y) => {
      const d = (x - 8) * (x - 8) + (y - 8) * (y - 8);
      return d <= 4.6 * 4.6 && d > 3.9 * 3.9;
    },
    'gold',
    1,
    { cx: 8, cy: 8, r: 4.6 },
    { flat: true },
  );
  // Stamp: a small cross on the face, one step darker than the groove.
  for (const [x, y] of [
    [7, 6],
    [7, 7],
    [7, 8],
    [6, 7],
    [8, 7],
  ] as const)
    i.set(x, y, 'gold', 0, { flat: true });
  i.set(5, 5, 'gold', 5, { flat: true });
}

/**
 * Слава: a булава (hetman's mace) — a pear-shaped gold head with darker ribs over a 1-px gold collar, a long wooden haft
 * (no foot, so it never reads as a cup) and a short crimson tassel.
 */
function glory(i: Icon): void {
  // Haft: 9 px of wood under the collar.
  i.rect(7, 7, 8, 15, 'wood', 3);
  // Pear-shaped head: wide at the top, narrowing into the collar.
  i.fill(
    (x, y) => {
      const rx = y < 4.5 ? 4.4 : 4.4 - (y - 4.5) * 0.9;
      const dx = (x - 8) / rx;
      const dy = (y - 4) / 3.6;
      return y <= 7 && dx * dx + dy * dy <= 1;
    },
    'gold',
    3,
    { cx: 8, cy: 4, r: 4 },
  );
  // Collar.
  i.rect(6, 7, 9, 7, 'gold', 4, { flat: true });
  // Ribs (flanges) of the head.
  for (const [x, y0, y1] of [
    [5, 2, 4],
    [8, 1, 5],
    [10, 2, 4],
  ] as const)
    for (let y = y0; y <= y1; y++) i.set(x, y, 'gold', 1, { flat: true });
  // Tassel tied under the collar.
  i.set(9, 8, 'crimson', 3);
  i.set(10, 9, 'crimson', 3);
  i.set(10, 10, 'crimson', 2);
}

/** Харч: a round loaf (паляниця) with three scored cuts. */
function kharch(i: Icon): void {
  i.fill(
    (x, y) => {
      const dx = (x - 8) / 6.8;
      const dy = (y - 9.4) / 5.2;
      return dx * dx + dy * dy <= 1 && y <= 13;
    },
    'thatch',
    4,
    { cx: 8, cy: 9, r: 6.5 },
  );
  for (const [x, y] of [
    [4, 8],
    [5, 7],
    [7, 7],
    [8, 6],
    [10, 7],
    [11, 6],
  ] as const)
    i.set(x, y, 'wood', 3, { flat: true });
  for (let x = 2; x <= 13; x++) if (i.has(x, 12)) i.set(x, 12, 'wood', 3, { flat: true });
}

/** Козак: a head in a crimson шапка with a black lamb-fur band, a shaved temple with the оселедець, a drooping moustache, the blue жупан's collar. */
function cossack(i: Icon): void {
  // Жупан (shoulders).
  i.poly(
    [
      [2, 16],
      [3, 13],
      [6, 12],
      [10, 12],
      [13, 13],
      [14, 16],
    ],
    'cloth',
    2,
  );
  // Face and neck.
  i.rect(5, 6, 10, 10, 'skin', 4);
  i.rect(6, 11, 9, 11, 'skin', 3, { flat: true });
  // Шапка: crimson top falling to the right, fur band.
  i.poly(
    [
      [5, 4],
      [6, 1],
      [10, 1],
      [13, 3],
      [13, 5],
      [11, 4],
    ],
    'crimson',
    3,
  );
  i.rect(4, 4, 11, 5, 'ink', 2, { flat: true });
  for (let x = 4; x <= 11; x += 2) i.set(x, 4, 'ink', 3, { flat: true });
  // Shaved temple and the оселедець falling from under the cap on the left.
  i.set(4, 6, 'skin', 4);
  i.set(4, 7, 'skin', 3);
  for (const [x, y] of [
    [3, 5],
    [3, 6],
    [2, 7],
  ] as const)
    i.set(x, y, 'ink', 2, { flat: true });
  // Eyes, moustache (falls below the mouth on both sides).
  i.set(6, 7, 'ink', 1, { flat: true });
  i.set(9, 7, 'ink', 1, { flat: true });
  for (const [x, y] of [
    [6, 9],
    [7, 9],
    [8, 9],
    [9, 9],
    [5, 10],
    [10, 10],
  ] as const)
    i.set(x, y, 'ink', 2, { flat: true });
  // Collar line.
  for (let x = 6; x <= 9; x++) i.set(x, 12, 'cloth', 3, { flat: true });
}

/** Оборона: a crimson shield with a stone rim and a gold boss. */
function defence(i: Icon): void {
  i.poly(
    [
      [2, 1],
      [14, 1],
      [14, 8],
      [8, 15],
      [2, 8],
    ],
    'stone',
    4,
  );
  i.poly(
    [
      [4, 3],
      [12, 3],
      [12, 8],
      [8, 12.6],
      [4, 8],
    ],
    'crimson',
    3,
  );
  i.disc(8, 7, 1.8, 'gold', 4);
}

/** The pole every wind icon stands on, with a 1-px gold finial; `lean` shifts its upper half 1 px (a storm bends it). */
function pole(i: Icon, lean = 0): void {
  i.rect(2, 9, 3, 14, 'wood', 4);
  i.rect(2 + lean, 2, 3 + lean, 8, 'wood', 4);
  i.set(2 + lean, 1, 'gold', 4, { flat: true });
  i.set(3 + lean, 1, 'gold', 4, { flat: true });
}

/** A thin gust stroke after the outline: pale wood over a 1-px ink underline, so it holds on dark and light panels. */
function gust(i: Icon, y: number, x0: number, x1: number): void {
  for (let x = x0; x <= x1; x++) {
    i.set(x, y, 'wood', 6, { flat: true, solid: false });
    i.set(x, y + 1, 'ink', 1, { flat: true, solid: false });
  }
}

/** Тиша: the pennant hangs limp down the pole, 4 px wide, with one fold in shadow. */
function windCalm(i: Icon): void {
  pole(i);
  i.poly(
    [
      [4, 2],
      [8, 2],
      [8, 9],
      [6, 12],
      [4, 10],
    ],
    'crimson',
    3,
  );
  for (let y = 3; y <= 9; y++) i.set(6, y, 'crimson', 1, { flat: true });
}

/** Вітерець: the pennant lifts and droops; one gust. */
function windBreeze(i: Icon): void {
  pole(i);
  i.poly(
    [
      [4, 2],
      [8, 3],
      [12, 7],
      [9, 8],
      [4, 7],
    ],
    'crimson',
    3,
  );
}

/** Буря: the pennant flies straight out with a torn triple tail, the pole bends, gusts beneath. */
function windStorm(i: Icon): void {
  pole(i, 1);
  i.poly(
    [
      [5, 1],
      [16, 1.4],
      [12.6, 2.6],
      [16, 3.6],
      [12.6, 4.7],
      [16, 5.8],
      [5, 6],
    ],
    'crimson',
    3,
  );
}

/** Писанка: a crimson egg with gold bands and a light zigzag between them. */
function pysanka(i: Icon): void {
  i.fill(
    (x, y) => {
      const rx = y < 8.5 ? 4.6 : 5.4;
      const dx = (x - 8) / rx;
      const dy = (y - 8.5) / 6.6;
      return dx * dx + dy * dy <= 1;
    },
    'crimson',
    3,
    { cx: 8, cy: 8.5, r: 6 },
  );
  for (let x = 0; x < ICON_SIZE; x++) {
    for (const y of [5, 11]) if (i.has(x, y)) i.set(x, y, 'gold', 4, { flat: true });
    // A zigzag on rows 7–9.
    for (const [y, phase] of [
      [7, 0],
      [8, 1],
      [9, 2],
    ] as const)
      if (i.has(x, y) && (x + phase) % 4 === 0) i.set(x, y, 'plaster', 6, { flat: true });
  }
}

/** Замок: a brass padlock with an iron shackle and a dark keyhole. */
function lock(i: Icon): void {
  i.fill(
    (x, y) => {
      const d = (x - 8) * (x - 8) + (y - 6) * (y - 6);
      return y <= 7 && d <= 4.4 * 4.4 && d > 2.4 * 2.4;
    },
    'stone',
    4,
    { cx: 8, cy: 5, r: 4.4 },
  );
  i.rect(2, 7, 13, 14, 'gold', 3);
  i.rect(7, 9, 8, 10, 'ink', 1, { flat: true });
  i.set(7, 11, 'ink', 2, { flat: true });
  i.set(8, 11, 'ink', 2, { flat: true });
}

/** Квест: a parchment scroll with lines of writing and a crimson seal. */
function quest(i: Icon): void {
  i.rect(3, 2, 12, 13, 'plaster', 4);
  i.rect(2, 1, 13, 2, 'wood', 4);
  i.rect(2, 13, 13, 14, 'wood', 4);
  for (const y of [5, 7, 9]) for (let x = 5; x <= 10; x++) i.set(x, y, 'plaster', 1, { flat: true });
  i.disc(11, 11, 2.2, 'crimson', 3);
}

/** Віха: a sharp five-pointed gold star, its tips cut clean against the background (never a round coin). */
function milestone(i: Icon): void {
  // Outer tips r 7.6 and inner corners r 3 around (8, 8.6), from the top clockwise (precomputed: no trig in output).
  i.poly(
    [
      [8, 1],
      [9.8, 6.2],
      [15.2, 6.3],
      [10.9, 9.5],
      [12.5, 14.7],
      [8, 11.6],
      [3.5, 14.7],
      [5.1, 9.5],
      [0.8, 6.3],
      [6.2, 6.2],
    ],
    'gold',
    3,
  );
  i.set(8, 8, 'gold', 5, { flat: true });
}

const DRAW: Readonly<Record<IconId, (i: Icon) => void>> = {
  ducat,
  glory,
  kharch,
  cossack,
  defence,
  'wind-calm': windCalm,
  'wind-breeze': windBreeze,
  'wind-storm': windStorm,
  pysanka,
  lock,
  quest,
  milestone,
};

/** Strokes drawn on top of the finished (outlined) icon. */
const AFTER: Partial<Readonly<Record<IconId, (i: Icon) => void>>> = {
  'wind-breeze': (i) => {
    gust(i, 11, 6, 11);
  },
  'wind-storm': (i) => {
    gust(i, 9, 7, 13);
    gust(i, 12, 9, 15);
  },
};

const icon: SpriteGenerator = {
  atlas: 'ui',
  id: 'icon',
  size: { w: ICON_SIZE, h: ICON_SIZE },
  frames: { idle: 1 },
  variants: ICONS,
  anchor: { x: 0, y: 0 },
  generate(_rng, { variant, buffer, rampSize }) {
    const id = ICONS.find((x) => x === variant);
    if (!id) throw new Error(`icon: unknown variant ${String(variant)}`);
    const shape = new Icon();
    DRAW[id](shape);
    const done = shape.finish(rampSize);
    const after = new Icon();
    AFTER[id]?.(after);
    // Strokes are not solid: `finish` adds no outline around them.
    for (const [k, p] of after.finish(rampSize)) done.set(k, p);
    for (const [k, p] of done) buffer.set(k % ICON_SIZE, Math.floor(k / ICON_SIZE), { ramp: p.ramp, shade: p.shade });
  },
};

export default icon;
