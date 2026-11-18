// Хата-мазанка, tier I and III (plan ART-05, ART-BIBLE §5–6, recipes docs/art/recipes/materials-1.md): heavy hipped
// reed roof over bright whitewashed walls in a 3/4 view — a lit front face and a shaded side wall under the right
// hip — pryzba, window(s) with an emissive night mask, contact line + cast shadow. Modular: tier III adds a mirrored
// window, a рушник and a chimney on the same base; mallows are a separate prop (`mallows`), so the body keeps to
// plaster, thatch, wood and earth (art-director ART-05 review: colour budget). Pivot at the base.
import type { IndexBuffer } from '../../lib/buffer.ts';
import { castShadow, compose, type Part, type RampSize } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import {
  chimney,
  eaveAO,
  pryzbaBand,
  rushnyk,
  sideWall,
  thatchRoof,
  whitewashWall,
  WINDOW,
  windowRecipe,
  type Rect,
} from '../../lib/recipes.ts';
import type { CompanionLayer, SpriteGenerator } from '../../lib/types.ts';

/** Wider than the house: the cast shadow runs ~12 px right of the wall. */
const W = 76;
const H = 56;
/** Ground row: the pryzba's bottom row; the sprite's pivot is the bottom edge of this row. */
export const KHATA_GROUND = 52;
/** Pivot column (bottom-centre of the house body, as before the canvas grew for the shadow). */
export const KHATA_PIVOT_X = 32;
const WALL = { x: 10, w: 44 } as const;
/** Side wall under the right hip: the last SIDE columns of the wall. */
const SIDE = 9;
const FRONT_W = WALL.w - SIDE;
const ROOF = { x: WALL.x - 3, w: WALL.w + 6, top: 2, lip: 27 } as const;
const WALL_TOP = ROOF.lip + 3;
const PRYZBA_Y = KHATA_GROUND - 3;
const WINDOW_Y = WALL_TOP + 4;
/** Window 1 centred ~1/3 from the left edge of the front face; tier III mirrors it on that face. */
const WINDOW_X = WALL.x + Math.round(FRONT_W / 3) - 3;
const WINDOW_X2 = WALL.x + WALL.x + FRONT_W - 1 - (WINDOW_X + WINDOW.w - 1);

const ROOF_PART = 1;
const BODY_PART = 2;

/** The plots a khata is painted into, for tier extras (offsets already applied by the caller). */
export interface KhataPlots {
  readonly body: Plot;
  readonly roof: Plot;
  readonly glow: Plot;
  /** Right end of the roof ridge (exclusive); the tier-III chimney stands at `ridgeX1 − 9`. */
  readonly ridgeX1: number;
}

export interface KhataSpec {
  readonly seed: string;
  /** Offset of the khata in a larger canvas (the potter's tiers, M2-07); 0 for the M-ART frames. */
  readonly ox: number;
  readonly oy: number;
  /** Tier III: the mirrored window, a рушник over the first one and the whitewashed chimney. */
  readonly tier3: boolean;
  /** Extra px over the body (after the рушник) and over the roof (after the chimney). */
  readonly extras?: (plots: KhataPlots) => void;
  /** Extra parts composed after the body and the roof (porch, lean-to). */
  readonly parts?: readonly Part[];
  /** Ground row of the canvas (the cast shadow's base). */
  readonly ground: number;
}

/** Window rect of the khata's front face: 0 = the first window, 1 = the mirrored one (tier III). */
export function khataWindow(i: 0 | 1, ox = 0, oy = 0): Rect {
  return { x: (i === 0 ? WINDOW_X : WINDOW_X2) + ox, y: WINDOW_Y + oy, w: WINDOW.w, h: WINDOW.h + 1 };
}

/** Khata geometry in its own canvas (x, y before the offset). */
export const KHATA_GEOMETRY = { WALL, SIDE, FRONT_W, ROOF, WALL_TOP, PRYZBA_Y } as const;

/**
 * Paints the khata (tier I, or III with `tier3`) into `buffer` at an offset; the M-ART frames are `ox = oy = 0`.
 * Write order is the M-ART one, so those frames stay pixel-identical.
 */
export function paintKhata(
  buffer: IndexBuffer,
  layers: Readonly<Partial<Record<CompanionLayer, IndexBuffer>>>,
  rampSize: RampSize,
  spec: KhataSpec,
): void {
  const { seed, ox, oy, tier3 } = spec;
  const body = new Plot();
  const glow = new Plot();
  const windows: Rect[] = [khataWindow(0, ox, oy)];
  if (tier3) windows.push(khataWindow(1, ox, oy));

  whitewashWall(body, {
    seed,
    x: WALL.x + ox,
    y: WALL_TOP + oy,
    w: FRONT_W,
    h: PRYZBA_Y - WALL_TOP,
    avoid: windows,
    aoRows: 2,
    shadeEdge: false,
  });
  eaveAO(body, WALL.x + ox, WALL.x + FRONT_W + ox, WALL_TOP + oy);
  sideWall(body, { x: WALL.x + FRONT_W + ox, y: WALL_TOP + oy, w: SIDE, h: PRYZBA_Y - WALL_TOP });
  for (const win of windows) windowRecipe(body, glow, win.x, win.y);
  pryzbaBand(body, { seed, x: WALL.x - 1 + ox, y: PRYZBA_Y + oy, w: WALL.w + 2 });
  if (tier3) {
    const first = windows[0];
    if (first) rushnyk(body, first);
  }

  const roof = new Plot();
  // The right hip foot spans the side wall plus the overhang.
  const info = thatchRoof(roof, {
    seed,
    ...ROOF,
    x: ROOF.x + ox,
    top: ROOF.top + oy,
    lip: ROOF.lip + oy,
    hipFoot: { left: 0.45, right: 0.9 },
  });
  if (tier3) chimney(roof, info.ridgeX1 - 9, ROOF.top - 1 + oy, 7);
  spec.extras?.({ body, roof, glow, ridgeX1: info.ridgeX1 });

  compose(buffer, [body.part(2, BODY_PART, glow), roof.part(1, ROOF_PART), ...(spec.parts ?? [])], rampSize, {
    light: false,
    occlusion: false,
    // Heavy soft roof edge: a darker rim only on the shaded right/bottom side of the thatch silhouette.
    outline: { mode: 'outer', parts: [ROOF_PART] },
    selective: { lit: 'vanish' },
    ...(layers.emissive ? { emissive: layers.emissive } : {}),
  });

  const shadow = layers.shadow;
  if (shadow) {
    castShadow(shadow, {
      x0: WALL.x + Math.floor(WALL.w / 2) + ox,
      x1: WALL.x + WALL.w + 1 + ox,
      groundY: spec.ground,
    });
  }
}

const khata: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'khata',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: ['t1', 't3'],
  layers: ['emissive', 'shadow'],
  anchor: { x: KHATA_PIVOT_X / W, y: (KHATA_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    paintKhata(buffer, layers, rampSize, {
      seed: `khata.${variant ?? 't1'}`,
      ox: 0,
      oy: 0,
      tier3: variant === 't3',
      ground: KHATA_GROUND,
    });
  },
};

export default khata;
